/**
 * TariffDock's injected face. The target `conversation.composer.dock` slot is
 * declared by ui-conversation; this package only contributes the entry.
 */

/** Directory snapshot this chip reads; structurally a subset of the model-selection store. */
export interface TariffDirectoryState {
  /** Host-reported selection for the next assembled step; null before the first load. */
  current: { provider: string; model: string } | null
}

/** Subscribe/getSnapshot face of the session model directory. */
export interface TariffDirectoryStore {
  /** Subscribe to directory snapshots. */
  subscribe: (fn: () => void) => () => void
  /** Latest snapshot; only `current` is read. */
  getSnapshot: () => TariffDirectoryState
}

/** Subscribe/getSnapshot face of this session's spend projection (or the live fallback). */
export interface TariffSpendStore {
  subscribe: (fn: () => void) => () => void
  getSnapshot: () => import('../types.ts').DeepTariffSpendProjection | null
}

/** Subscribe/getSnapshot face of the host balance poller. */
export interface TariffBalanceStore {
  subscribe: (fn: () => void) => () => void
  getSnapshot: () => import('../types.ts').DeepTariffBalanceSnapshot | null
}

/** Injected business face of the composer tariff readout. */
export interface TariffDockInjected {
  /** The session's shared model-directory store. */
  directory: TariffDirectoryStore
  /** Refresh the directory (fire-and-forget; a failed load leaves `current` null). */
  load: () => void
  /** Session spend priced at each sample's window; null store means the host did not wire it. */
  spend: TariffSpendStore | null
  /** Account remaining credit; null store means the snapshot route is not being polled. */
  balance: TariffBalanceStore | null
}
