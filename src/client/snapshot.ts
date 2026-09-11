/**
 * Host snapshot poller: remaining credit plus live llm/stream spend fallback.
 *
 * @module deep-tariff/client/snapshot
 */

import type { DeepTariffBalanceSnapshot, DeepTariffSpendProjection } from '../types.ts'
import { hasSpend } from '../spend.ts'

/** JSON body of `GET /deep-tariff/snapshot`. */
interface HostSnapshot {
  balance?: DeepTariffBalanceSnapshot
  spend?: Record<string, DeepTariffSpendProjection>
}

const SNAPSHOT_PATH = '/deep-tariff/snapshot'
const POLL_MS = 30_000

/**
 * Shared host snapshot store. One poller per page; chips subscribe.
 */
export function createHostSnapshotStore() {
  let snapshot: HostSnapshot | null = null
  const listeners = new Set<() => void>()

  const notify = (): void => {
    for (const listener of listeners) listener()
  }

  const load = async (): Promise<void> => {
    try {
      const response = await fetch(SNAPSHOT_PATH, { credentials: 'same-origin' })
      if (!response.ok) return
      const body = await response.json() as HostSnapshot
      snapshot = body
      notify()
    } catch {
      // Route missing or offline: omit balance / live spend.
    }
  }

  void load()
  const timer = window.setInterval(() => {
    void load()
  }, POLL_MS)

  return {
    subscribe: (fn: () => void): (() => void) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    balance: (): DeepTariffBalanceSnapshot | null => snapshot?.balance ?? null,
    spendFor: (sessionId: string): DeepTariffSpendProjection | null => {
      const spend = snapshot?.spend?.[sessionId]
      return hasSpend(spend) ? spend : null
    },
    dispose: (): void => {
      window.clearInterval(timer)
      listeners.clear()
    },
  }
}

export type HostSnapshotStore = ReturnType<typeof createHostSnapshotStore>
