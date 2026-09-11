/**
 * DeepSeek tariff readout under the composer card. Hidden unless the
 * selected route is on the official DeepSeek table.
 */

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { detectTimeZone, formatHm, resolveTariff, type TariffSnapshot } from '../schedule.ts'
import { hasSpend } from '../spend.ts'
import type { DeepTariffBalanceSnapshot, DeepTariffSpendProjection } from '../types.ts'
import type { TariffDockInjected } from './slots.ts'
import {
  formatMoney,
  formatUsd,
  isPeakImminent,
  modelLabelKey,
  nextKey,
  remainingKey,
  remainingOf,
  weekdayKey,
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

const imminentStyle: CSSProperties = {
  color: 'var(--dsw-alias-warning, #c97800)',
}

const emptyStore = {
  subscribe: (): (() => void) => () => {},
  getSnapshot: (): null => null,
}

/**
 * Composer-dock tariff chip.
 * @param props - directory, optional spend/balance stores, load verb, locale seat.
 * @returns the strip, or null when the selected route is not DeepSeek.
 */
export function TariffDock({ directory, load, spend, balance, t }: TariffDockProps) {
  const state = useSyncExternalStore(directory.subscribe, directory.getSnapshot, directory.getSnapshot)
  const spendStore = spend ?? emptyStore
  const balanceStore = balance ?? emptyStore
  const spendSnap = useSyncExternalStore(spendStore.subscribe, spendStore.getSnapshot, spendStore.getSnapshot)
  const balanceSnap = useSyncExternalStore(balanceStore.subscribe, balanceStore.getSnapshot, balanceStore.getSnapshot)
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
  const instant = new Date(now)
  const imminent = isPeakImminent(snapshot, instant)
  const line = formatLine(snapshot, instant, t, spendSnap, balanceSnap, imminent)
  const tip = formatTooltip(snapshot, t, spendSnap, balanceSnap, imminent)

  return (
    <Tooltip label={tip} side="top" delayMs={500}>
      <div
        style={rootStyle}
        data-deep-tariff
        data-window={snapshot.window}
        data-model={snapshot.model}
        data-peak-imminent={imminent ? 'true' : undefined}
        aria-label={t('strip.aria', { summary: line })}
      >
        {imminent
          ? <span style={imminentStyle}>{line}</span>
          : line}
      </div>
    </Tooltip>
  )
}

/**
 * Compose the visible one-line readout.
 */
export function formatLine(
  snapshot: TariffSnapshot,
  now: Date,
  t: TariffDockProps['t'],
  spend: DeepTariffSpendProjection | null = null,
  balance: DeepTariffBalanceSnapshot | null = null,
  imminent = false,
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
  const segments = [
    t(windowKey(snapshot.window)),
    remaining,
    ...(imminent ? [t('cue.peakSoon')] : []),
    `${model} ${rates}`,
  ]
  if (hasSpend(spend)) {
    segments.push(t('spend', { amount: formatMoney(spend.usd, 'USD') }))
  }
  if (balance !== null && balance.ok) {
    segments.push(t('balance', { amount: formatMoney(balance.total, balance.currency) }))
  }
  return segments.join(' · ')
}

/**
 * Compose the hover details.
 */
export function formatTooltip(
  snapshot: TariffSnapshot,
  t: TariffDockProps['t'],
  spend: DeepTariffSpendProjection | null = null,
  balance: DeepTariffBalanceSnapshot | null = null,
  imminent = false,
): string {
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
    time: `${t(weekdayKey(snapshot.nextTransitionAt, snapshot.timeZone))} ${formatHm(snapshot.nextTransitionAt, snapshot.timeZone)}`,
  })
  const lines = [hours, rates, next]
  if (imminent) lines.push(t('cue.peakSoon'))
  if (hasSpend(spend)) {
    lines.push(t('tooltip.spend', {
      amount: formatMoney(spend.usd, 'USD'),
      uncached: String(spend.uncachedInputTokens),
      cached: String(spend.cacheReadTokens),
      output: String(spend.outputTokens),
    }))
  }
  if (balance !== null && balance.ok) {
    lines.push(t('tooltip.balance', {
      total: formatMoney(balance.total, balance.currency),
      currency: balance.currency,
      granted: formatMoney(balance.granted, balance.currency),
      toppedUp: formatMoney(balance.toppedUp, balance.currency),
    }))
    if (!balance.isAvailable) lines.push(t('tooltip.balance.unavailable'))
  }
  return lines.join('\n')
}
