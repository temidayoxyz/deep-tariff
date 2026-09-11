/**
 * DeepSeek tariff chip, browser half: an ambient readout on
 * `conversation.composer.dock`.
 */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { TariffDock } from './TariffDock.tsx'
import { bindSpendProjection } from './projections.ts'
import { createHostSnapshotStore } from './snapshot.ts'
import type { TariffBalanceStore, TariffDockInjected, TariffSpendStore } from './slots.ts'
import { en, NS, zh, type DeepTariffKey } from './locales.ts'

export type { TariffDockInjected, TariffDirectoryState } from './slots.ts'
export type { DeepTariffKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The DeepSeek tariff chip's copy. */
    deepTariff: DeepTariffKey
  }
}

/** Required services: slot contribution, locale, and the session model directory. */
export const inject = ['slots', 'locale', 'modelDirectories']

/**
 * Client plugin body: dictionaries plus the composer-dock chip.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'deep-tariff: dictionaries')

  const host = createHostSnapshotStore()
  ctx.effect(() => () => host.dispose(), 'deep-tariff: snapshot poller')

  ctx.inject(['slots', 'modelDirectories'], (scope: ClientContext) => {
    const models = scope.modelDirectories
    const sessions = (scope as ClientContext & { sessions?: unknown }).sessions
      ?? (scope as ClientContext & { get: (name: string) => unknown }).get('sessions')
    const balance: TariffBalanceStore = {
      subscribe: host.subscribe,
      getSnapshot: () => host.balance(),
    }
    scope.slots.inject('conversation.composer.dock', () => scope.slots.register({
      name: 'conversation.composer.dock',
      id: 'deep-tariff',
      order: 10,
      locale: NS,
      inject: (sessionId: SessionId): TariffDockInjected => {
        const directory = models.directoryFor(sessionId)
        const liveSpend: TariffSpendStore = {
          subscribe: host.subscribe,
          getSnapshot: () => host.spendFor(String(sessionId)),
        }
        const projected = bindSpendProjection(sessions, String(sessionId))
        return {
          directory: directory.store,
          spend: projected === null ? liveSpend : composeSpend(projected, liveSpend),
          balance,
          load: () => {
            directory.load().catch(() => {
              // Surfaced by leaving `current` null so the chip stays hidden.
            })
          },
        }
      },
    }, TariffDock))
  })
}

function composeSpend(primary: TariffSpendStore, fallback: TariffSpendStore): TariffSpendStore {
  return {
    subscribe: (fn) => {
      const dropPrimary = primary.subscribe(fn)
      const dropFallback = fallback.subscribe(fn)
      return () => {
        dropPrimary()
        dropFallback()
      }
    },
    getSnapshot: () => primary.getSnapshot() ?? fallback.getSnapshot(),
  }
}
