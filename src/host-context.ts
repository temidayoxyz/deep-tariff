/**
 * Host-context faces used by this package. The public cordis lib types do
 * not carry the source-level merges the harness resolves from its own
 * vendor tree, so the members below are declared here as plain exported
 * types (never as a `declare module` augmentation, which hides the
 * package's own exports from this program). Every member exists at runtime.
 */
import type { Context } from '@deepseek-ai/cordis'

/** Harness context with the plugin-facing fiber operations this package uses. */
export type HostContext = Context & {
  /** Run a callback once the requested services are available. */
  inject: (deps: readonly string[], callback: (ctx: HostContext) => unknown) => unknown
  /** Run an effect with the returned disposer as teardown. */
  effect: (factory: () => unknown, name?: string) => () => void
}
