/**
 * DeepSeek official-API tariff resolver (`ctx.deepTariff`).
 *
 * @module deep-tariff
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { DEFAULT_API_KEY_ENV, DEFAULT_BALANCE_URL, fetchBalance } from './balance.ts'
import {
  addLiveSpend,
  createSpendProjectionDefinition,
  zeroSpend,
} from './spend.ts'
import {
  DEFAULT_MODEL_RATES,
  DEFAULT_PEAK_WEEKDAYS,
  DEFAULT_PEAK_WINDOWS,
  DEFAULT_TARIFF_TABLE,
  DEEPSEEK_OFFICIAL_PROVIDER,
  resolveTariff,
  validateTariffTable,
} from './schedule.ts'
import type { ClockWindow, ModelRates, TariffResolveRequest, TariffSnapshot, TariffTable } from './schedule.ts'
import type {
  DeepTariffBalanceSnapshot,
  DeepTariffSpendProjection,
} from './types.ts'

export {
  canonicalizeTimeZone,
  DEFAULT_MODEL_RATES,
  DEFAULT_PEAK_WEEKDAYS,
  DEFAULT_PEAK_WINDOWS,
  DEFAULT_TARIFF_TABLE,
  DEEPSEEK_FLASH,
  DEEPSEEK_OFFICIAL_PROVIDER,
  DEEPSEEK_V4_FLASH,
  DEEPSEEK_V4_FLASH_VISION_EXP,
  DEEPSEEK_V4_PRO,
  detectTimeZone,
  formatHm,
  parseClockToMinutes,
  remainingParts,
  resolveTariff,
  priceUsage,
  validateTariffTable,
} from './schedule.ts'
export {
  addLiveSpend,
  applySpendEvent,
  bucketsFromUsage,
  createSpendProjectionDefinition,
  DEEP_TARIFF_SPEND_KEY,
  hasSpend,
  initSpendState,
  priceSample,
  zeroSpend,
} from './spend.ts'
export { DEFAULT_API_KEY_ENV, DEFAULT_BALANCE_URL, fetchBalance, parseBalanceBody } from './balance.ts'
export type * from './types.ts'
export type { DeepTariffSpendState, SpendFoldEvent } from './spend.ts'

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
  /**
   * UTC weekdays when peak windows apply (`Date.getUTCDay()`, 0=Sun … 6=Sat).
   * Default Monday–Friday; weekends are off-peak.
   */
  peakWeekdays?: number[]
  /** Per-model peak and off-peak USD rates per 1M tokens. */
  models?: Record<string, ModelRates>
  /** Credential env name for `GET /user/balance` (default `DEEPSEEK_API_KEY`). */
  apiKeyEnv?: string
  /** Official balance URL. */
  balanceUrl?: string
  /** How often the host refreshes balance, in milliseconds (default 60s). */
  balanceRefreshMs?: number
}

/** Schemastery validation for {@link Config}. */
export const Config: z<Config> = z.object({
  provider: z.string().default(DEEPSEEK_OFFICIAL_PROVIDER),
  peakWindows: z.array(clockWindow).default([...DEFAULT_PEAK_WINDOWS]),
  peakWeekdays: z.array(z.number()).default([...DEFAULT_PEAK_WEEKDAYS]),
  models: z.dict(modelRates).default({ ...DEFAULT_MODEL_RATES }),
  apiKeyEnv: z.string().default(DEFAULT_API_KEY_ENV),
  balanceUrl: z.string().default(DEFAULT_BALANCE_URL),
  balanceRefreshMs: z.number().min(5_000).default(60_000),
})

/** JSON body of `GET /deep-tariff/snapshot`. */
export interface DeepTariffHostSnapshot {
  /** Official account remaining credit, or a failure that the chip omits. */
  balance: DeepTariffBalanceSnapshot
  /** Live `llm/stream` spend keyed by session id (fallback when the projection is absent). */
  spend: Record<string, DeepTariffSpendProjection>
}

/** Resolves the official DeepSeek tariff for one selected route and instant. */
export class DeepTariff extends Service {
  static Config = Config

  private readonly table: TariffTable
  private readonly apiKeyEnv: string
  private readonly balanceUrl: string
  private readonly liveSpend = new Map<string, DeepTariffSpendProjection>()
  private balance: DeepTariffBalanceSnapshot = {
    ok: false,
    error: 'not fetched yet',
    fetchedAt: 0,
  }

  /**
   * @param ctx - owning root context.
   * @param config - optional overrides of the official table.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'deepTariff')
    this.table = validateTariffTable({
      provider: config.provider ?? DEFAULT_TARIFF_TABLE.provider,
      peakWindows: config.peakWindows ?? DEFAULT_TARIFF_TABLE.peakWindows,
      peakWeekdays: config.peakWeekdays ?? DEFAULT_TARIFF_TABLE.peakWeekdays,
      models: config.models ?? DEFAULT_TARIFF_TABLE.models,
    })
    this.apiKeyEnv = config.apiKeyEnv ?? DEFAULT_API_KEY_ENV
    this.balanceUrl = config.balanceUrl ?? DEFAULT_BALANCE_URL
    const balanceRefreshMs = config.balanceRefreshMs ?? 60_000

    ctx.inject(['sessionProjections'], (scope: Context) => {
      const registry = (scope as Context & {
        sessionProjections: { register: (definition: unknown) => () => void }
      }).sessionProjections
      scope.effect(
        () => registry.register(createSpendProjectionDefinition(this.table)),
        'deep-tariff: spend projection',
      )
    })

    ;(ctx as Context & {
      on: (name: string, listener: (...args: never[]) => unknown) => () => void
    }).on('llm/stream', ((options: LiveStreamOptions, next: () => AsyncIterable<LiveStreamChunk>) => {
      if (typeof next !== 'function') return undefined
      const inner = next()
      const self = this
      return (async function* () {
        for await (const chunk of inner) {
          if (chunk?.type === 'usage' && chunk.usage !== undefined) {
            try {
              self.recordLive(options, chunk.usage)
            } catch {
              // Accounting must never break the model stream.
            }
          }
          yield chunk
        }
      })()
    }) as never)

    ctx.inject(['webServer'], (scope: Context) => {
      const webServer = (scope as Context & {
        webServer: { register: (route: HostHttpRoute) => () => void }
      }).webServer
      scope.effect(
        () => webServer.register({
          kind: 'exact',
          path: '/deep-tariff/snapshot',
          handler: async (_req, res) => {
            const body: DeepTariffHostSnapshot = {
              balance: this.balance,
              spend: Object.fromEntries(this.liveSpend),
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(body))
          },
        }),
        'deep-tariff: snapshot route',
      )
      const poll = (): void => {
        this.refreshBalance().catch(() => {
          // Next interval retries; the chip omits a failed snapshot.
        })
      }
      poll()
      const timer = setInterval(poll, balanceRefreshMs)
      scope.effect(() => () => clearInterval(timer), 'deep-tariff: balance poll')
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

  /**
   * Latest official balance snapshot, or a failure the chip omits.
   */
  currentBalance(): DeepTariffBalanceSnapshot {
    return this.balance
  }

  /**
   * Live spend for one session from `llm/stream` (empty when none recorded).
   * Durable spend lives on the `deepTariffSpend` session projection.
   */
  liveSpendFor(sessionId: string): DeepTariffSpendProjection {
    return this.liveSpend.get(sessionId) ?? zeroSpend()
  }

  private recordLive(
    options: LiveStreamOptions,
    usage: { inputTokens?: number; cacheReadTokens?: number; outputTokens?: number },
  ): void {
    const sessionId = options.sessionId
    if (typeof sessionId !== 'string' || sessionId.length === 0) return
    if (typeof options.provider !== 'string' || typeof options.model !== 'string') return
    const previous = this.liveSpend.get(sessionId) ?? zeroSpend()
    const next = addLiveSpend(
      previous,
      usage,
      options.provider,
      options.model,
      new Date(),
      this.table,
    )
    if (next !== previous) this.liveSpend.set(sessionId, next)
  }

  private async refreshBalance(): Promise<void> {
    const apiKey = await resolveApiKey(this.ctx, this.apiKeyEnv)
    if (apiKey === undefined) {
      this.balance = { ok: false, error: `${this.apiKeyEnv} not configured`, fetchedAt: Date.now() }
      return
    }
    this.balance = await fetchBalance(apiKey, this.balanceUrl)
  }
}

interface LiveStreamOptions {
  provider?: string
  model?: string
  sessionId?: string
}

interface LiveStreamChunk {
  type?: string
  usage?: { inputTokens?: number; cacheReadTokens?: number; outputTokens?: number }
}

interface HostHttpRoute {
  kind: 'exact'
  path: string
  handler: (
    req: { url?: string },
    res: { writeHead: (status: number, headers: Record<string, string>) => void; end: (body: string) => void },
  ) => void | Promise<void>
}

async function resolveApiKey(ctx: Context, envName: string): Promise<string | undefined> {
  const credentials = (ctx as Context & {
    get: (name: string) => { resolve: (ref: string) => Promise<{ value?: string } | undefined> } | undefined
  }).get('credentials')
  if (credentials !== undefined) {
    try {
      const hit = await credentials.resolve(envName)
      if (typeof hit?.value === 'string' && hit.value.length > 0) return hit.value
    } catch {
      // Fall through to process.env.
    }
  }
  const fromEnv = process.env[envName]
  return typeof fromEnv === 'string' && fromEnv.length > 0 ? fromEnv : undefined
}

export default DeepTariff
