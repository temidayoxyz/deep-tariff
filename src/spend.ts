/**
 * Session spend fold: price each durable usage sample at the UTC window it
 * ran in. Shared by the session-projection unit and the live `llm/stream`
 * fallback. No Cordis imports.
 *
 * @module deep-tariff/spend
 */

import { priceUsage, resolveTariff } from './schedule.ts'
import type { DeepTariffSpendProjection, TariffTable, UsageBuckets } from './types.ts'

/** Client-visible session-projection key. */
export const DEEP_TARIFF_SPEND_KEY = 'deepTariffSpend'

/** Host fold state for {@link DEEP_TARIFF_SPEND_KEY}. */
export interface DeepTariffSpendState {
  /** Running totals, priced per sample. */
  totals: DeepTariffSpendProjection
  /** Last priced settlement, so a retry of the same turn/step replaces rather than doubles. */
  last: { turn: number; step: number; buckets: UsageBuckets; usd: number } | null
  /** Latest `request/header` route, used when the settlement itself has no provider. */
  route: { provider: string; model: string } | null
}

/** Minimal session-event face this fold reads. */
export interface SpendFoldEvent {
  readonly type: string
  readonly time: number
  readonly data: Record<string, unknown>
}

/** Empty spend totals. */
export function zeroSpend(): DeepTariffSpendProjection {
  return { uncachedInputTokens: 0, cacheReadTokens: 0, outputTokens: 0, usd: 0 }
}

/** Empty fold state for a new session. */
export function initSpendState(): DeepTariffSpendState {
  return { totals: zeroSpend(), last: null, route: null }
}

/**
 * Map provider-reported disjoint usage onto billed buckets. Cache writes are
 * omitted: DeepSeek does not bill a separate write metric.
 * @param usage - Adapter `TokenUsage` (or a compatible duck).
 */
export function bucketsFromUsage(usage: {
  readonly inputTokens?: number
  readonly cacheReadTokens?: number
  readonly outputTokens?: number
}): UsageBuckets {
  return {
    uncachedInputTokens: finiteCount(usage.inputTokens),
    cacheReadTokens: finiteCount(usage.cacheReadTokens),
    outputTokens: finiteCount(usage.outputTokens),
  }
}

/**
 * Price one usage sample at the official (or overridden) table for that instant.
 * @returns USD, or `null` when the route is not on the table.
 */
export function priceSample(
  usage: UsageBuckets,
  provider: string,
  model: string,
  at: Date,
  table: TariffTable,
): number | null {
  const snapshot = resolveTariff({ now: at, timeZone: 'UTC', provider, model }, table)
  if (snapshot === null) return null
  return priceUsage(usage, snapshot.rates)
}

/**
 * Fold one session event into spend state. Uninterested events return `state`.
 * @param state - Previous fold state.
 * @param event - Committed session event (or a compatible duck).
 * @param table - Rate table used to price the sample.
 */
export function applySpendEvent(
  state: DeepTariffSpendState,
  event: SpendFoldEvent,
  table: TariffTable,
): DeepTariffSpendState {
  if (event.type === 'request/header') {
    const config = nested(event.data.header, 'config')
    const provider = stringField(config, 'provider')
    const model = stringField(config, 'model')
    if (provider === undefined || model === undefined) return state
    if (state.route?.provider === provider && state.route.model === model) return state
    return { ...state, route: { provider, model } }
  }
  if (event.type === 'llm/retry-started') {
    // Close the replacement slot so the retried attempt adds instead of
    // overwriting the failed attempt's billed usage (same rule as token-meter).
    const turn = numberField(event.data, 'turn')
    const step = numberField(event.data, 'step')
    if (state.last !== null && state.last.turn === turn && state.last.step === step) {
      return { ...state, last: null }
    }
    return state
  }
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return state
  const sample = usageOf(event)
  if (sample === undefined) return state
  const route = state.route
  if (route === null) return state
  const buckets = bucketsFromUsage(sample)
  const usd = priceSample(buckets, route.provider, route.model, new Date(event.time), table)
  if (usd === null) return state
  const turn = numberField(event.data, 'turn') ?? 0
  const step = numberField(event.data, 'step') ?? 0
  const previous = state.last !== null && state.last.turn === turn && state.last.step === step
    ? state.last
    : undefined
  if (
    previous !== undefined
    && bucketsEqual(previous.buckets, buckets)
    && previous.usd === usd
  ) {
    return state
  }
  return {
    totals: {
      uncachedInputTokens: state.totals.uncachedInputTokens
        - (previous?.buckets.uncachedInputTokens ?? 0) + buckets.uncachedInputTokens,
      cacheReadTokens: state.totals.cacheReadTokens
        - (previous?.buckets.cacheReadTokens ?? 0) + buckets.cacheReadTokens,
      outputTokens: state.totals.outputTokens
        - (previous?.buckets.outputTokens ?? 0) + buckets.outputTokens,
      usd: state.totals.usd - (previous?.usd ?? 0) + usd,
    },
    last: { turn, step, buckets, usd },
    route: state.route,
  }
}

/**
 * Accumulate a live `llm/stream` usage chunk into a session total.
 * Unlike the durable fold, this cannot replace a retried step — adapters
 * emit one usage chunk per completed attempt.
 */
export function addLiveSpend(
  previous: DeepTariffSpendProjection,
  usage: { readonly inputTokens?: number; readonly cacheReadTokens?: number; readonly outputTokens?: number },
  provider: string,
  model: string,
  at: Date,
  table: TariffTable,
): DeepTariffSpendProjection {
  const buckets = bucketsFromUsage(usage)
  const usd = priceSample(buckets, provider, model, at, table)
  if (usd === null) return previous
  return {
    uncachedInputTokens: previous.uncachedInputTokens + buckets.uncachedInputTokens,
    cacheReadTokens: previous.cacheReadTokens + buckets.cacheReadTokens,
    outputTokens: previous.outputTokens + buckets.outputTokens,
    usd: previous.usd + usd,
  }
}

/** True when the projection has any billed tokens (so the chip should show it). */
export function hasSpend(spend: DeepTariffSpendProjection | null | undefined): spend is DeepTariffSpendProjection {
  if (spend === null || spend === undefined) return false
  return spend.uncachedInputTokens > 0
    || spend.cacheReadTokens > 0
    || spend.outputTokens > 0
    || spend.usd > 0
}

/**
 * Session-projection unit for {@link DEEP_TARIFF_SPEND_KEY}. Registered when
 * `ctx.sessionProjections` is present. Schema is Zod-shaped (`parse` /
 * `safeParse`) without importing `zod`.
 */
export function createSpendProjectionDefinition(table: TariffTable) {
  return {
    key: DEEP_TARIFF_SPEND_KEY,
    stateVersion: 1,
    stateSchema: objectSchema(parseSpendState),
    init: (): DeepTariffSpendState => initSpendState(),
    apply: (state: DeepTariffSpendState, event: SpendFoldEvent): DeepTariffSpendState =>
      applySpendEvent(state, event, table),
    wire: {
      viewSchema: objectSchema(parseSpendView),
      view: (state: DeepTariffSpendState): DeepTariffSpendProjection => state.totals,
    },
  }
}

function usageOf(event: SpendFoldEvent): {
  inputTokens?: number
  cacheReadTokens?: number
  outputTokens?: number
} | undefined {
  if (event.type === 'assistant/message' && isUsage(event.data.usage)) return event.data.usage
  return usageFromStream(event.data.stream)
}

function usageFromStream(stream: unknown): {
  inputTokens?: number
  cacheReadTokens?: number
  outputTokens?: number
} | undefined {
  if (!Array.isArray(stream)) return undefined
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index] as Record<string, unknown> | undefined
    const chunk = isRecord(record?.chunk) ? record.chunk : record
    if (chunk?.type === 'usage' && isUsage(chunk.usage)) return chunk.usage
  }
  return undefined
}

function isUsage(value: unknown): value is {
  inputTokens?: number
  cacheReadTokens?: number
  outputTokens?: number
} {
  return isRecord(value)
}

function bucketsEqual(left: UsageBuckets, right: UsageBuckets): boolean {
  return left.uncachedInputTokens === right.uncachedInputTokens
    && left.cacheReadTokens === right.cacheReadTokens
    && left.outputTokens === right.outputTokens
}

function parseSpendView(value: unknown): DeepTariffSpendProjection {
  if (!isRecord(value)) throw new TypeError('deep-tariff: spend view must be an object')
  return {
    uncachedInputTokens: finiteCount(value.uncachedInputTokens),
    cacheReadTokens: finiteCount(value.cacheReadTokens),
    outputTokens: finiteCount(value.outputTokens),
    usd: finiteAmount(value.usd),
  }
}

function parseSpendState(value: unknown): DeepTariffSpendState {
  if (!isRecord(value)) throw new TypeError('deep-tariff: spend state must be an object')
  return {
    totals: parseSpendView(value.totals),
    last: parseLast(value.last),
    route: parseRoute(value.route),
  }
}

function parseLast(value: unknown): DeepTariffSpendState['last'] {
  if (value === null || value === undefined) return null
  if (!isRecord(value) || !isRecord(value.buckets)) {
    throw new TypeError('deep-tariff: spend last must be an object with buckets, or null')
  }
  return {
    turn: finiteCount(value.turn),
    step: finiteCount(value.step),
    buckets: {
      uncachedInputTokens: finiteCount(value.buckets.uncachedInputTokens),
      cacheReadTokens: finiteCount(value.buckets.cacheReadTokens),
      outputTokens: finiteCount(value.buckets.outputTokens),
    },
    usd: finiteAmount(value.usd),
  }
}

function parseRoute(value: unknown): DeepTariffSpendState['route'] {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) throw new TypeError('deep-tariff: spend route must be an object or null')
  const provider = stringField(value, 'provider')
  const model = stringField(value, 'model')
  if (provider === undefined || model === undefined) {
    throw new TypeError('deep-tariff: spend route needs provider and model')
  }
  return { provider, model }
}

function objectSchema<T>(parse: (value: unknown) => T) {
  return {
    parse,
    safeParse: (value: unknown) => {
      try {
        return { success: true as const, data: parse(value) }
      } catch (error) {
        return { success: false as const, error }
      }
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nested(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  const inner = value[key]
  return isRecord(inner) ? inner : undefined
}

function stringField(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberField(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function finiteCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0
  return value
}

function finiteAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return value
}
