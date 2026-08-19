/**
 * DeepSeek tariff readout under the composer card. Hidden unless the
 * selected route is on the official DeepSeek table.
 */

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { detectTimeZone, formatHm, resolveTariff, type TariffSnapshot } from '../schedule.ts'
import type { TariffDockInjected } from './slots.ts'
import {
  formatUsd,
  modelLabelKey,
  nextKey,
  remainingKey,
  remainingOf,
  windowKey,
} from './format.ts'

export type TariffDockProps = TariffDockInjected & PropsLocale<'deepTariff'>

const rootStyle: CSSProperties = {
  display: 'block',
  textAlign: 'center',
  maxWidth: 'var(--dsh-chat-content-width)',
  width: '100%',
  margin: '0 auto',
  boxSizing: 'border-box',
  padding: '0 calc(var(--dsh-composer-side-clearance, 0px) + 16px) 4px',
  fontSize: '12px',
  lineHeight: '20px',
  color: 'var(--dsw-alias-label-tertiary, #888)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

/**
 * Composer-dock tariff chip.
 * @param props - directory store, load verb, and the locale seat.
 * @returns the strip, or null when the selected route is not DeepSeek.
 */
export function TariffDock({ directory, load, t }: TariffDockProps) {
  const state = useSyncExternalStore(directory.subscribe, directory.getSnapshot, directory.getSnapshot)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const tick = (): void => {
      setNow(Date.now())
    }
    const id = window.setInterval(tick, 1000)
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const current = state.current
  const snapshot = current === null
    ? null
    : resolveTariff({
      now: new Date(now),
      timeZone: detectTimeZone(),
      provider: current.provider,
      model: current.model,
    })

  if (snapshot === null) return null
  const line = formatLine(snapshot, new Date(now), t)
  const tip = formatTooltip(snapshot, t)

  return (
    <Tooltip label={tip} side="top" delayMs={500}>
      <div
        style={rootStyle}
        data-deep-tariff
        data-window={snapshot.window}
        data-model={snapshot.model}
        aria-label={t('strip.aria', { summary: line })}
      >
        {line}
      </div>
    </Tooltip>
  )
}

/**
 * Compose the visible one-line readout.
 * @param snapshot - Resolved tariff.
 * @param now - Instant used for the countdown.
 * @param t - Locale seat.
 * @returns Window, countdown, model, and cache-miss / output rates.
 */
export function formatLine(
  snapshot: TariffSnapshot,
  now: Date,
  t: TariffDockProps['t'],
): string {
  const parts = remainingOf(snapshot, now)
  const remaining = t(remainingKey(parts), {
    hours: parts.hours,
    minutes: parts.minutes,
    seconds: parts.seconds,
    next: t(nextKey(snapshot.nextWindow)),
  })
  const modelKey = modelLabelKey(snapshot.model)
  const model = modelKey === null ? snapshot.model : t(modelKey)
  const rates = t('rates', {
    input: formatUsd(snapshot.rates.cacheMiss),
    output: formatUsd(snapshot.rates.output),
  })
  return `${t(windowKey(snapshot.window))} · ${remaining} · ${model} ${rates}`
}

/**
 * Compose the hover details: local peak hours, all three rates, next flip.
 * @param snapshot - Resolved tariff.
 * @param t - Locale seat.
 * @returns Multiline tooltip text.
 */
export function formatTooltip(snapshot: TariffSnapshot, t: TariffDockProps['t']): string {
  const windows = snapshot.localPeakWindows
    .map(window => `${window.start}–${window.end}`)
    .join(t('windows.sep'))
  const hours = t('tooltip.hours', { zone: snapshot.timeZone, windows })
  const rates = t('tooltip.rates', {
    cacheHit: formatUsd(snapshot.rates.cacheHit),
    cacheMiss: formatUsd(snapshot.rates.cacheMiss),
    output: formatUsd(snapshot.rates.output),
  })
  const next = t('tooltip.next', {
    next: t(nextKey(snapshot.nextWindow)),
    time: formatHm(snapshot.nextTransitionAt, snapshot.timeZone),
  })
  return `${hours}\n${rates}\n${next}`
}
