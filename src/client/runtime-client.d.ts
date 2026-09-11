/**
 * Local ambient types for `@deepseek-ai/dsh-client-runtime/client`, whose
 * package cannot be installed from the public registry (it pulls a
 * non-public dependency). Types only: every import of this module in this
 * package is type-only, so nothing here reaches any bundle.
 *
 * NOTE: do not add a `declare module '@deepseek-ai/cordis'` augmentation
 * here — it hides the package's `export *` members (e.g. `Service`) from
 * this program. Harness-context faces live in slot-host.ts / host-context.ts
 * as plain exported types instead.
 */
declare module '@deepseek-ai/dsh-client-runtime/client' {
  import type { Context } from '@deepseek-ai/cordis'
  /** Client root context (service merges arrive from the installed client packages). */
  export type ClientContext = Context
  /** Owning session id. */
  export type SessionId = string
}
