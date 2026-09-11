/**
 * Bind a session-projection face, duck-typed so this plugin does not import
 * client-session internals.
 *
 * @module deep-tariff/client/projections
 */

import { DEEP_TARIFF_SPEND_KEY, hasSpend } from '../spend.ts'
import type { DeepTariffSpendProjection } from '../types.ts'
import type { TariffSpendStore } from './slots.ts'

interface ProjectionFace {
  subscribe?: (fn: () => void) => () => void
  getSnapshot?: () => unknown
}

interface SessionsLike {
  binding?: (sessionId: string) => {
    session?: { projections?: { faceOf?: (key: string) => ProjectionFace | undefined } }
    projections?: { faceOf?: (key: string) => ProjectionFace | undefined }
  } | undefined
}

/**
 * Subscribe to the durable `deepTariffSpend` projection for one session.
 * Returns `null` when the sessions service or the face is absent.
 */
export function bindSpendProjection(
  sessions: unknown,
  sessionId: string,
): TariffSpendStore | null {
  const face = spendFace(sessions, sessionId)
  if (face?.subscribe === undefined || face.getSnapshot === undefined) return null
  const subscribe = face.subscribe.bind(face)
  const getSnapshot = face.getSnapshot.bind(face)
  return {
    subscribe,
    getSnapshot: () => {
      const value = getSnapshot()
      return hasSpend(asSpend(value)) ? asSpend(value) : null
    },
  }
}

function spendFace(sessions: unknown, sessionId: string): ProjectionFace | undefined {
  if (sessions === null || typeof sessions !== 'object') return undefined
  const binding = (sessions as SessionsLike).binding?.(sessionId)
  return binding?.session?.projections?.faceOf?.(DEEP_TARIFF_SPEND_KEY)
    ?? binding?.projections?.faceOf?.(DEEP_TARIFF_SPEND_KEY)
}

function asSpend(value: unknown): DeepTariffSpendProjection | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.usd !== 'number') return null
  return {
    uncachedInputTokens: Number(record.uncachedInputTokens) || 0,
    cacheReadTokens: Number(record.cacheReadTokens) || 0,
    outputTokens: Number(record.outputTokens) || 0,
    usd: record.usd,
  }
}
