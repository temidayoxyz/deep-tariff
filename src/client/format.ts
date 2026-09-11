/**
 * Display helpers for the DeepSeek tariff chip.
 *
 * @module deep-tariff/format
 */

import {
  DEEPSEEK_FLASH,
  DEEPSEEK_V4_FLASH,
  DEEPSEEK_V4_FLASH_VISION_EXP,
  DEEPSEEK_V4_PRO,
  remainingParts,
  type RemainingParts,
  type TariffSnapshot,
  type TariffWindow,
} from '../schedule.ts'

/**
 * Format a USD-per-1M rate with two decimals, or three when the value is under a cent.
 * @param value - Non-negative USD amount.
 * @returns A `$` prefixed decimal string.
 */
export function formatUsd(value: number): string {
  const text = value.toFixed(3).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  return `$${text.includes('.') ? text : `${text}.00`}`
}

const FLASH_MODEL_IDS = new Set([DEEPSEEK_FLASH, DEEPSEEK_V4_FLASH, DEEPSEEK_V4_FLASH_VISION_EXP])

const WEEKDAY_KEYS = [
  'weekday.sun',
  'weekday.mon',
  'weekday.tue',
  'weekday.wed',
  'weekday.thu',
  'weekday.fri',
  'weekday.sat',
] as const

/**
 * Locale key for an official Flash/Pro model id, including retired Flash aliases.
 * @param model - Selected model id.
 * @returns Flash/Pro key, or `null` so the caller can print the raw id.
 */
export function modelLabelKey(model: string): 'model.flash' | 'model.pro' | null {
  if (FLASH_MODEL_IDS.has(model)) return 'model.flash'
  if (model === DEEPSEEK_V4_PRO) return 'model.pro'
  return null
}

/**
 * Locale key for the local weekday of `date` in `timeZone`.
 * @param date - Instant to project.
 * @param timeZone - Canonical IANA zone or `UTC`.
 * @returns `weekday.*` key.
 */
export function weekdayKey(date: Date, timeZone: string): (typeof WEEKDAY_KEYS)[number] {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date)
  switch (weekday) {
    case 'Sun': return 'weekday.sun'
    case 'Mon': return 'weekday.mon'
    case 'Tue': return 'weekday.tue'
    case 'Wed': return 'weekday.wed'
    case 'Thu': return 'weekday.thu'
    case 'Fri': return 'weekday.fri'
    case 'Sat': return 'weekday.sat'
    default: throw new TypeError(`unexpected weekday in ${timeZone}: ${JSON.stringify(weekday)}`)
  }
}

/**
 * Pick the remaining-time copy key for a whole-second remainder.
 * @param parts - Split remainder.
 * @returns Locale key covering the largest non-zero units.
 */
export function remainingKey(parts: RemainingParts): 'remaining.hm' | 'remaining.ms' | 'remaining.s' {
  if (parts.hours > 0) return 'remaining.hm'
  if (parts.minutes > 0) return 'remaining.ms'
  return 'remaining.s'
}

/**
 * Window copy key.
 * @param window - Peak or off-peak.
 * @returns Locale key.
 */
export function windowKey(window: TariffWindow): 'window.peak' | 'window.offPeak' {
  return window === 'peak' ? 'window.peak' : 'window.offPeak'
}

/**
 * Next-window copy key.
 * @param window - Incoming window.
 * @returns Locale key.
 */
export function nextKey(window: TariffWindow): 'next.peak' | 'next.offPeak' {
  return window === 'peak' ? 'next.peak' : 'next.offPeak'
}

/**
 * Split the snapshot's remaining time at `now`.
 * @param snapshot - Resolved tariff.
 * @param now - Instant to subtract from `nextTransitionAt`.
 * @returns Whole-second parts.
 */
export function remainingOf(snapshot: TariffSnapshot, now: Date): RemainingParts {
  return remainingParts(snapshot.nextTransitionAt.getTime() - now.getTime())
}

/** Peak-soon window: next flip is into peak and less than 15 minutes away. */
export const PEAK_IMMINENT_MS = 15 * 60 * 1000

/**
 * True when the next window is peak and arrives within {@link PEAK_IMMINENT_MS}.
 * Already-peak instants are false — the window label already says Peak.
 */
export function isPeakImminent(snapshot: TariffSnapshot, now: Date): boolean {
  if (snapshot.nextWindow !== 'peak') return false
  const remaining = snapshot.nextTransitionAt.getTime() - now.getTime()
  return remaining > 0 && remaining <= PEAK_IMMINENT_MS
}

/**
 * Format a billed amount (session spend or remaining credit).
 * @param value - Non-negative amount in `currency`.
 * @param currency - API currency; `CNY`/`RMB` use ¥, everything else `$`.
 */
export function formatMoney(value: number, currency = 'USD'): string {
  const abs = Math.max(0, value)
  const text = abs < 0.01 && abs > 0
    ? abs.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
    : abs.toFixed(2)
  const prefix = currency === 'CNY' || currency === 'RMB' ? '¥' : '$'
  return `${prefix}${text}`
}
