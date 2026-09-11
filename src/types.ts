/**
 * DeepSeek official API tariff vocabulary. Types only.
 *
 * @module deep-tariff/types
 */

/** One UTC clock window expressed as `HH:mm` (24-hour, inclusive start, exclusive end). */
export interface ClockWindow {
  /** Inclusive UTC start (`HH:mm`). */
  readonly start: string
  /** Exclusive UTC end (`HH:mm`). */
  readonly end: string
}

/** USD prices for one million tokens of one billing class. */
export interface TokenRatesUsd {
  /** Cached input tokens (prompt cache hit). */
  readonly cacheHit: number
  /** Uncached input tokens (prompt cache miss). */
  readonly cacheMiss: number
  /** Output tokens, including reasoning. */
  readonly output: number
}

/**
 * Provider-billed token buckets for one DeepSeek request (or a session total).
 * Cache writes are omitted: DeepSeek does not bill a separate write metric.
 */
export interface UsageBuckets {
  /** Uncached prompt tokens (cache miss). */
  readonly uncachedInputTokens: number
  /** Prompt tokens served from cache (cache hit). */
  readonly cacheReadTokens: number
  /** Output tokens, including reasoning. */
  readonly outputTokens: number
}

/** Peak and off-peak rates for one DeepSeek model id. */
export interface ModelRates {
  /** Rates while a configured UTC peak window is open. */
  readonly peak: TokenRatesUsd
  /** Rates outside every configured UTC peak window (half of peak on the official table). */
  readonly offPeak: TokenRatesUsd
}

/** Official DeepSeek billing window. */
export type TariffWindow = 'peak' | 'off-peak'

/** One local-clock copy of a UTC peak window. */
export interface LocalClockWindow {
  /** Inclusive local start (`HH:mm`, 24-hour). */
  readonly start: string
  /** Exclusive local end (`HH:mm`, 24-hour). */
  readonly end: string
}

/** Whole-second remainder until the next billing-window change. */
export interface RemainingParts {
  /** Whole hours remaining. */
  readonly hours: number
  /** Whole minutes remaining after hours. */
  readonly minutes: number
  /** Whole seconds remaining after minutes. */
  readonly seconds: number
}

/** Resolved official (or config-overridden) tariff table used by {@link import('./schedule.ts').resolveTariff}. */
export interface TariffTable {
  /** Provider id that activates the table (official route is `deepseek-official`). */
  readonly provider: string
  /** UTC peak windows; off-peak is every instant outside these half-open ranges. */
  readonly peakWindows: readonly ClockWindow[]
  /**
   * UTC weekdays when `peakWindows` apply (`Date.getUTCDay()`, 0=Sun … 6=Sat).
   * Official table is Monday–Friday; Saturday and Sunday are off-peak.
   */
  readonly peakWeekdays: readonly number[]
  /** Per-model peak and off-peak USD rates. */
  readonly models: Readonly<Record<string, ModelRates>>
}

/** Inputs that locate one instant on the official DeepSeek tariff. */
export interface TariffResolveRequest {
  /** Instant to classify; callers that omit it use `new Date()`. */
  readonly now?: Date
  /** IANA zone used only to project UTC windows onto a local clock. */
  readonly timeZone: string
  /** Provider id of the selected route. */
  readonly provider: string
  /** Model id of the selected route. */
  readonly model: string
}

/**
 * Durable DeepSeek spend for one session log. Priced at each usage sample's
 * UTC window and model, not the window currently on screen.
 */
export interface DeepTariffSpendProjection {
  /** Uncached prompt tokens billed on DeepSeek routes. */
  uncachedInputTokens: number
  /** Cached prompt tokens billed on DeepSeek routes. */
  cacheReadTokens: number
  /** Output tokens billed on DeepSeek routes. */
  outputTokens: number
  /** USD priced at each sample's UTC window and model. */
  usd: number
}

/** Successful `GET /user/balance` readout. Amounts are in `currency`. */
export interface DeepTariffBalance {
  /** Discriminator: the request succeeded. */
  readonly ok: true
  /** Whether DeepSeek considers the balance sufficient for API calls. */
  readonly isAvailable: boolean
  /** API-reported currency (`USD` or `CNY`). */
  readonly currency: string
  /** Total remaining (granted + topped-up). */
  readonly total: number
  /** Unexpired granted credit. */
  readonly granted: number
  /** Topped-up remaining credit. */
  readonly toppedUp: number
  /** Host clock when this snapshot was fetched. */
  readonly fetchedAt: number
}

/** Failed or unavailable balance readout. The chip omits the balance segment. */
export interface DeepTariffBalanceError {
  /** Discriminator: the request failed or no key is configured. */
  readonly ok: false
  /** Short reason for logs / tooltip; never an API key. */
  readonly error: string
  /** Host clock of the attempt. */
  readonly fetchedAt: number
}

/** Host snapshot served at `/deep-tariff/snapshot`. */
export type DeepTariffBalanceSnapshot = DeepTariffBalance | DeepTariffBalanceError

/** One resolved DeepSeek billing snapshot. Absent routes yield `null` instead. */
export interface TariffSnapshot {
  /** Model id from the request, known to the table. */
  readonly model: string
  /** Canonical IANA zone used for local clocks. */
  readonly timeZone: string
  /** Billing window that contains `now`. */
  readonly window: TariffWindow
  /** Active USD rates for `model` in `window`. */
  readonly rates: TokenRatesUsd
  /** UTC instant at which the window changes. */
  readonly nextTransitionAt: Date
  /** Window that begins at `nextTransitionAt`. */
  readonly nextWindow: TariffWindow
  /** Configured UTC peak windows projected into `timeZone` on the UTC calendar day of `now`. */
  readonly localPeakWindows: readonly LocalClockWindow[]
}
