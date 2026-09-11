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

/** Canonical Flash model id (`DeepSeek-V4.1-Flash`). */
export const DEEPSEEK_FLASH = 'deepseek-flash'

/** Retired V4 Flash id. Still accepted by the API; billed as Flash. */
export const DEEPSEEK_V4_FLASH = 'deepseek-v4-flash'

/** Retired V4 Flash vision-exp id. Still accepted by the API; billed as Flash. */
export const DEEPSEEK_V4_FLASH_VISION_EXP = 'deepseek-v4-flash-vision-exp'

/** Official V4 Pro model id (`DeepSeek-V4-Pro-0813`). Billing unchanged after the V4.1 Flash launch. */
export const DEEPSEEK_V4_PRO = 'deepseek-v4-pro'

/** Official UTC peak windows (01:00–04:00 and 06:00–10:00 UTC). */
export const DEFAULT_PEAK_WINDOWS: readonly ClockWindow[] = [
  { start: '01:00', end: '04:00' },
  { start: '06:00', end: '10:00' },
]

/**
 * UTC weekdays when {@link DEFAULT_PEAK_WINDOWS} apply.
 * `Date.getUTCDay()` numbering: 0=Sun … 6=Sat. Weekends are off-peak.
 */
export const DEFAULT_PEAK_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5]

/** Official Flash USD rates per 1M tokens (V4.1 Flash, effective 2026-09-10 04:00 UTC). */
const FLASH_RATES: ModelRates = {
  offPeak: { cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 },
  peak: { cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 },
}

/** Official USD rates per 1M tokens, as published 2026-09-10. */
export const DEFAULT_MODEL_RATES: Readonly<Record<string, ModelRates>> = {
  [DEEPSEEK_FLASH]: FLASH_RATES,
  [DEEPSEEK_V4_FLASH]: FLASH_RATES,
  [DEEPSEEK_V4_FLASH_VISION_EXP]: FLASH_RATES,
  [DEEPSEEK_V4_PRO]: {
    offPeak: { cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 },
    peak: { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 },
  },
}

/** Official table used when a caller omits an override. */
export const DEFAULT_TARIFF_TABLE: TariffTable = {
  provider: DEEPSEEK_OFFICIAL_PROVIDER,
  peakWindows: DEFAULT_PEAK_WINDOWS,
  peakWeekdays: DEFAULT_PEAK_WEEKDAYS,
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
  resolvePeakWeekdays(table.peakWeekdays)
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
  const peakWeekdays = resolvePeakWeekdays(table.peakWeekdays)
  const window: TariffWindow = inPeak(now, windows, peakWeekdays) ? 'peak' : 'off-peak'
  const nextTransitionAt = nextTransition(now, windows, peakWeekdays)
  const nextWindow: TariffWindow = inPeak(nextTransitionAt, windows, peakWeekdays) ? 'peak' : 'off-peak'
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

function resolvePeakWeekdays(days: readonly number[]): ReadonlySet<number> {
  if (days.length === 0) {
    throw new TypeError('deep-tariff: at least one peak weekday is required')
  }
  const resolved = new Set<number>()
  for (const day of days) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new TypeError(`deep-tariff: peak weekday must be an integer 0–6 (Sun–Sat): ${JSON.stringify(day)}`)
    }
    resolved.add(day)
  }
  return resolved
}

function inPeak(now: Date, windows: readonly MinuteWindow[], peakWeekdays: ReadonlySet<number>): boolean {
  if (!peakWeekdays.has(now.getUTCDay())) return false
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes()
  return windows.some(window => minute >= window.startMinutes && minute < window.endMinutes)
}

function nextTransition(
  now: Date,
  windows: readonly MinuteWindow[],
  peakWeekdays: ReadonlySet<number>,
): Date {
  const current = inPeak(now, windows, peakWeekdays)
  const boundaries = [...new Set(windows.flatMap(window => [window.startMinutes, window.endMinutes]))]
    .sort((left, right) => left - right)
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const day = now.getUTCDate()
  // Walk at most a week plus today so a Mon–Fri table still finds Monday 01:00 from Friday evening.
  for (let offset = 0; offset <= 7; offset += 1) {
    for (const minutes of boundaries) {
      const candidate = new Date(Date.UTC(year, month, day + offset, 0, minutes))
      if (candidate.getTime() <= now.getTime()) continue
      if (inPeak(candidate, windows, peakWeekdays) !== current) return candidate
    }
  }
  throw new TypeError('deep-tariff: could not find a future peak/off-peak transition')
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
