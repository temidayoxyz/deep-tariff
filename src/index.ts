/**
 * DeepSeek official-API tariff resolver (`ctx.deepTariff`).
 *
 * @module deep-tariff
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_MODEL_RATES,
  DEFAULT_PEAK_WINDOWS,
  DEFAULT_TARIFF_TABLE,
  DEEPSEEK_OFFICIAL_PROVIDER,
  resolveTariff,
  validateTariffTable,
} from './schedule.ts'
import type { ClockWindow, ModelRates, TariffResolveRequest, TariffSnapshot, TariffTable } from './schedule.ts'

export {
  canonicalizeTimeZone,
  DEFAULT_MODEL_RATES,
  DEFAULT_PEAK_WINDOWS,
  DEFAULT_TARIFF_TABLE,
  DEEPSEEK_OFFICIAL_PROVIDER,
  DEEPSEEK_V4_FLASH,
  DEEPSEEK_V4_PRO,
  detectTimeZone,
  formatHm,
  parseClockToMinutes,
  remainingParts,
  resolveTariff,
  priceUsage,
  validateTariffTable,
} from './schedule.ts'
export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    deepTariff: DeepTariff
  }
}

const tokenRates = z.object({
  cacheHit: z.number().min(0),
  cacheMiss: z.number().min(0),
  output: z.number().min(0),
})

const clockWindow = z.object({
  start: z.string().required(),
  end: z.string().required(),
})

const modelRates = z.object({
  peak: tokenRates,
  offPeak: tokenRates,
})

/**
 * Plugin config: the official DeepSeek table is the default; every field is
 * overrideable from cordis.yml so a later official price change is a config
 * bump rather than a code change.
 */
export interface Config {
  /** Provider id that activates the chip and resolver (default `deepseek-official`). */
  provider?: string
  /** UTC peak windows as `HH:mm` pairs (default 01:00–04:00 and 06:00–10:00). */
  peakWindows?: ClockWindow[]
  /** Per-model peak and off-peak USD rates per 1M tokens. */
  models?: Record<string, ModelRates>
}

/** Schemastery validation for {@link Config}. */
export const Config: z<Config> = z.object({
  provider: z.string().default(DEEPSEEK_OFFICIAL_PROVIDER),
  peakWindows: z.array(clockWindow).default([...DEFAULT_PEAK_WINDOWS]),
  models: z.dict(modelRates).default({ ...DEFAULT_MODEL_RATES }),
})

/** Resolves the official DeepSeek tariff for one selected route and instant. */
export class DeepTariff extends Service {
  static Config = Config

  private readonly table: TariffTable

  /**
   * @param ctx - owning root context.
   * @param config - optional overrides of the official table.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'deepTariff')
    this.table = validateTariffTable({
      provider: config.provider ?? DEFAULT_TARIFF_TABLE.provider,
      peakWindows: config.peakWindows ?? DEFAULT_TARIFF_TABLE.peakWindows,
      models: config.models ?? DEFAULT_TARIFF_TABLE.models,
    })
  }

  /**
   * Classify `request` against this instance's table.
   * @param request - Selected provider, model, zone, and optional instant.
   * @returns The snapshot, or `null` when the route is not on this table.
   */
  resolve(request: TariffResolveRequest): TariffSnapshot | null {
    return resolveTariff(request, this.table)
  }
}

export default DeepTariff
