/**
 * Isomorphic DeepSeek official-API tariff: UTC peak windows, published USD
 * rates, and local-clock projection. No Node, DOM, or Cordis imports — the
 * host service and the browser chip share this module.
 *
 * @module deep-tariff/schedule
 */

import type {
  ClockWindow,
  LocalClockWindow,
  ModelRates,
  RemainingParts,
  TariffResolveRequest,
  TariffSnapshot,
  TariffTable,
  TariffWindow,
  TokenRatesUsd,
  UsageBuckets,
} from './types.ts'

export type {
  ClockWindow,
  LocalClockWindow,
  ModelRates,
  RemainingParts,
  TariffResolveRequest,
  TariffSnapshot,
  TariffTable,
  TariffWindow,
  TokenRatesUsd,
  UsageBuckets,
}

/** Provider route owned by `@deepseek-ai/dsh-llm-deepseek`. */
export const DEEPSEEK_OFFICIAL_PROVIDER = 'deepseek-official'

/** Official V4 Flash model id. */
export const DEEPSEEK_V4_FLASH = 'deepseek-v4-flash'

/** Official V4 Pro model id. */
export const DEEPSEEK_V4_PRO = 'deepseek-v4-pro'

/** Official UTC peak windows (01:00–04:00 and 06:00–10:00 UTC). */
export const DEFAULT_PEAK_WINDOWS: readonly ClockWindow[] = [
  { start: '01:00', end: '04:00' },
  { start: '06:00', end: '10:00' },
]

/** Official USD rates per 1M tokens, as published 2026-08-16. */
export const DEFAULT_MODEL_RATES: Readonly<Record<string, ModelRates>> = {
  [DEEPSEEK_V4_FLASH]: {
    offPeak: { cacheHit: 0.007, cacheMiss: 0.22, output: 0.66 },
    peak: { cacheHit: 0.014, cacheMiss: 0.44, output: 1.32 },
  },
  [DEEPSEEK_V4_PRO]: {
    offPeak: { cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 },
    peak: { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 },
  },
}

/** Official table used when a caller omits an override. */
export const DEFAULT_TARIFF_TABLE: TariffTable = {
  provider: DEEPSEEK_OFFICIAL_PROVIDER,
  peakWindows: DEFAULT_PEAK_WINDOWS,
  models: DEFAULT_MODEL_RATES,
}

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/

/** One peak window as minutes from UTC midnight. */
interface MinuteWindow {
  readonly startMinutes: number
  readonly endMinutes: number
}

/**
 * Parse a 24-hour `HH:mm` clock into minutes from midnight.
 * @param value - Clock string.
 * @param label - Field name used in the thrown error.
 * @returns Minutes in `[0, 1440)`.
 */
export function parseClockToMinutes(value: string, label: string): number {
  const match = CLOCK.exec(value)
  if (match === null) {
    throw new TypeError(`${label} must be HH:mm on a 24-hour clock: ${JSON.stringify(value)}`)
  }
  return Number(match[1]) * 60 + Number(match[2])
}

/**
 * Canonicalize an IANA zone (or `UTC`) through `Intl`.
 * @param timeZone - Caller-supplied zone.
 * @returns The zone `Intl` reports for that identifier.
 */
export function canonicalizeTimeZone(timeZone: string): string {
  if (timeZone === 'UTC') return 'UTC'
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone
  } catch (error: unknown) {
    throw new TypeError(`unsupported IANA time zone: ${JSON.stringify(timeZone)}`, { cause: error })
  }
}

/**
 * Read the host environment's IANA zone, falling back to `UTC`.
 * @returns A zone `Intl` accepts.
 */
export function detectTimeZone(): string {
  try {
    return canonicalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return 'UTC'
  }
}

/**
 * Split a non-negative millisecond remainder into whole hours, minutes, and seconds.
 * @param ms - Remaining milliseconds; negative values clamp to zero.
 * @returns Whole-second parts.
 */
export function remainingParts(ms: number): RemainingParts {
  const total = Math.max(0, Math.floor(ms / 1000))
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

/**
 * Price billed DeepSeek buckets at one rate card.
 * @param usage - Disjoint cache-miss, cache-hit, and output token counts.
 * @param rates - USD per 1M tokens.
 * @returns USD for those buckets.
 */
export function priceUsage(usage: UsageBuckets, rates: TokenRatesUsd): number {
  return (usage.uncachedInputTokens * rates.cacheMiss
    + usage.cacheReadTokens * rates.cacheHit
    + usage.outputTokens * rates.output) / 1_000_000
}

/**
 * Validate a tariff table and freeze its resolved minute windows.
 * @param table - Official defaults or a config override.
 * @returns The same table after validation.
 */
export function validateTariffTable(table: TariffTable): TariffTable {
  if (table.provider.length === 0) {
    throw new TypeError('deep-tariff: provider must be a non-empty string')
  }
  const windows = resolveMinuteWindows(table.peakWindows)
  if (windows.length === 0) throw new TypeError('deep-tariff: at least one peak window is required')
  const models = Object.keys(table.models)
  if (models.length === 0) throw new TypeError('deep-tariff: at least one model rate card is required')
  for (const model of models) {
    if (model.length === 0) throw new TypeError('deep-tariff: model ids must be non-empty')
    validateRates(table.models[model]!.offPeak, `${model} offPeak`)
    validateRates(table.models[model]!.peak, `${model} peak`)
  }
  return table
}

/**
 * Classify one instant on the official (or overridden) DeepSeek tariff.
 * @param request - Selected route, zone, and optional instant.
 * @param table - Rate table; omission uses {@link DEFAULT_TARIFF_TABLE}.
 * @returns The snapshot, or `null` when the route is not on this table.
 */
export function resolveTariff(
  request: TariffResolveRequest,
  table: TariffTable = DEFAULT_TARIFF_TABLE,
): TariffSnapshot | null {
  if (request.provider !== table.provider) return null
  const ratesForModel = table.models[request.model]
  if (ratesForModel === undefined) return null
  const timeZone = canonicalizeTimeZone(request.timeZone)
  const now = request.now ?? new Date()
  const windows = resolveMinuteWindows(table.peakWindows)
  const window: TariffWindow = inPeak(now, windows) ? 'peak' : 'off-peak'
  const nextTransitionAt = nextTransition(now, windows)
  const nextWindow: TariffWindow = inPeak(nextTransitionAt, windows) ? 'peak' : 'off-peak'
  return {
    model: request.model,
    timeZone,
    window,
    rates: window === 'peak' ? ratesForModel.peak : ratesForModel.offPeak,
    nextTransitionAt,
    nextWindow,
    localPeakWindows: projectLocalWindows(now, windows, timeZone),
  }
}

/**
 * Format `date` as `HH:mm` in `timeZone` using a 24-hour clock.
 * @param date - Instant to project.
 * @param timeZone - Canonical IANA zone or `UTC`.
 * @returns Zero-padded 24-hour clock.
 */
export function formatHm(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const hour = parts.find(part => part.type === 'hour')?.value
  const minute = parts.find(part => part.type === 'minute')?.value
  if (hour === undefined || minute === undefined) {
    throw new TypeError(`could not format a local clock in ${timeZone}`)
  }
  return `${hour}:${minute}`
}

function validateRates(rates: TokenRatesUsd, label: string): void {
  for (const [key, value] of Object.entries(rates) as [keyof TokenRatesUsd, number][]) {
    if (!Number.isFinite(value) || value < 0) {
      throw new TypeError(`deep-tariff: ${label}.${key} must be a non-negative finite number`)
    }
  }
}

function resolveMinuteWindows(windows: readonly ClockWindow[]): MinuteWindow[] {
  const resolved = windows.map((window, index) => {
    const startMinutes = parseClockToMinutes(window.start, `peakWindows[${index}].start`)
    const endMinutes = parseClockToMinutes(window.end, `peakWindows[${index}].end`)
    if (startMinutes >= endMinutes) {
      throw new TypeError(
        `deep-tariff: peak window ${window.start}–${window.end} must end after it starts (UTC, no wrap)`,
      )
    }
    return { startMinutes, endMinutes }
  })
  const ordered = [...resolved].sort((left, right) => left.startMinutes - right.startMinutes)
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!
    const current = ordered[index]!
    if (current.startMinutes < previous.endMinutes) {
      throw new TypeError('deep-tariff: peak windows must not overlap')
    }
  }
  return resolved
}

function inPeak(now: Date, windows: readonly MinuteWindow[]): boolean {
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes()
  return windows.some(window => minute >= window.startMinutes && minute < window.endMinutes)
}

function nextTransition(now: Date, windows: readonly MinuteWindow[]): Date {
  const boundaries = [...new Set(windows.flatMap(window => [window.startMinutes, window.endMinutes]))]
    .sort((left, right) => left - right)
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const day = now.getUTCDate()
  for (const minutes of boundaries) {
    const candidate = new Date(Date.UTC(year, month, day, 0, minutes))
    if (candidate.getTime() > now.getTime()) return candidate
  }
  return new Date(Date.UTC(year, month, day + 1, 0, boundaries[0]!))
}

function projectLocalWindows(
  now: Date,
  windows: readonly MinuteWindow[],
  timeZone: string,
): LocalClockWindow[] {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const day = now.getUTCDate()
  return windows.map(window => ({
    start: formatHm(new Date(Date.UTC(year, month, day, 0, window.startMinutes)), timeZone),
    end: formatHm(new Date(Date.UTC(year, month, day, 0, window.endMinutes)), timeZone),
  }))
}
