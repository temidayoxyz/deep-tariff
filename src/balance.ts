/**
 * Official DeepSeek `GET /user/balance` client. Runs on the host so the API
 * key never reaches the browser.
 *
 * @module deep-tariff/balance
 */

import type { DeepTariffBalance, DeepTariffBalanceSnapshot } from './types.ts'

/** Official balance endpoint. */
export const DEFAULT_BALANCE_URL = 'https://api.deepseek.com/user/balance'

/** Default credential env name, matching `llm-deepseek`. */
export const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'

/**
 * Parse a DeepSeek `/user/balance` JSON body into a snapshot.
 * @param body - Decoded JSON.
 * @param fetchedAt - Host clock of the fetch.
 */
export function parseBalanceBody(body: unknown, fetchedAt: number): DeepTariffBalance {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new TypeError('deep-tariff: balance response must be an object')
  }
  const record = body as Record<string, unknown>
  const infos = record.balance_infos
  const info = Array.isArray(infos) && infos.length > 0 && isRecord(infos[0])
    ? infos[0]
    : {}
  return {
    ok: true,
    isAvailable: record.is_available === true,
    currency: typeof info.currency === 'string' && info.currency.length > 0 ? info.currency : 'USD',
    total: money(info.total_balance),
    granted: money(info.granted_balance),
    toppedUp: money(info.topped_up_balance),
    fetchedAt,
  }
}

/**
 * Fetch the official balance endpoint with a bearer key.
 * @param apiKey - Resolved DeepSeek API key.
 * @param url - Endpoint; defaults to the official URL.
 */
export async function fetchBalance(
  apiKey: string,
  url: string = DEFAULT_BALANCE_URL,
): Promise<DeepTariffBalanceSnapshot> {
  const fetchedAt = Date.now()
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}`, fetchedAt }
    }
    return parseBalanceBody(await response.json(), fetchedAt)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message.slice(0, 200), fetchedAt }
  }
}

function money(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
