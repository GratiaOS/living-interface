// 📡 Sim SignalBus — local mesh via BroadcastChannel (multi-tab) with fallback.
//
// Provides the same API as SignalBus. Works offline and across tabs.

import type {
  GratiaSignal,
  SignalBus,
  Unsubscribe,
} from "./gratiaSignalAdapter"

type BC = BroadcastChannel

export function createSimSignalBus(
  channelName = "gratia-signal"
): SignalBus & { close(): void } {
  const listeners = new Set<(signal: GratiaSignal) => void>()
  let channel: BC | null = null

  const fallback = {
    post(data: unknown) {
      window.postMessage({ __GRATIA__: true, data }, "*")
    },
    on(fn: (data: unknown) => void) {
      const handler = (event: MessageEvent) => {
        const payload = event.data
        if (payload && payload.__GRATIA__) fn(payload.data)
      }
      window.addEventListener("message", handler)
      return () => window.removeEventListener("message", handler)
    },
  }

  let removeFallback: (() => void) | null = null

  const route = (payload: unknown) => {
    if (
      !payload ||
      typeof payload !== "object" ||
      (payload as { type?: string }).type !== "signal"
    ) {
      return
    }
    const signal = (payload as { payload?: GratiaSignal }).payload
    if (!signal) return
    for (const listener of listeners) listener(signal)
  }

  try {
    channel = new BroadcastChannel(channelName)
    channel.onmessage = (event) => route(event.data)
  } catch {
    channel = null
    removeFallback = fallback.on(route)
  }

  return {
    send: (signal) => {
      const packet = { type: "signal", payload: signal }
      if (channel) {
        try {
          channel.postMessage(packet)
        } catch {
          // ignore
        }
      } else {
        try {
          fallback.post(packet)
        } catch {
          // ignore
        }
      }
    },
    subscribe: (fn) => {
      listeners.add(fn)
      const unsubscribe: Unsubscribe = () => listeners.delete(fn)
      return unsubscribe
    },
    close: () => {
      try {
        channel?.close()
      } catch {
        // ignore
      }
      channel = null
      removeFallback?.()
      removeFallback = null
      listeners.clear()
    },
  }
}
