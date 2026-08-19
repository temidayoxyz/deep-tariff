/**
 * Display helpers for the DeepSeek tariff chip.
 *
 * @module deep-tariff/format
 */

import { remainingParts, type RemainingParts, type TariffSnapshot, type TariffWindow } from '../schedule.ts'

/**
 * Format a USD-per-1M rate with two decimals, or three when the value is under a cent.
 * @param value - Non-negative USD amount.
 * @returns A `$` prefixed decimal string.
 */
export function formatUsd(value: number): string {
  const text = value.toFixed(3).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  return `$${text.includes('.') ? text : `${text}.00`}`
}

/**
 * Locale key for an official V4 model id.
 * @param model - Selected model id.
 * @returns Flash/Pro key, or `null` so the caller can print the raw id.
 */
export function modelLabelKey(model: string): 'model.flash' | 'model.pro' | null {
  if (model === 'deepseek-v4-flash') return 'model.flash'
  if (model === 'deepseek-v4-pro') return 'model.pro'
  return null
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
