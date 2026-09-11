/**
 * Slot-registry face used by the browser half. Plain exported type (see
 * host-context.ts for why this is not a module augmentation).
 */
export interface SlotsHost {
  slots: {
    inject: (name: string, factory: () => () => void) => () => void
    register: (options: Record<string, unknown>, component: unknown) => () => void
  }
}
