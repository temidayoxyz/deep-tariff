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

/** Injected business face of the composer tariff readout. */
export interface TariffDockInjected {
  /** The session's shared model-directory store. */
  directory: TariffDirectoryStore
  /** Refresh the directory (fire-and-forget; a failed load leaves `current` null). */
  load: () => void
}
