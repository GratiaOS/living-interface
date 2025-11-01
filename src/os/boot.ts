import { consoleAdapter } from "../adapters/console-adapter"
import { gratiaSignalAdapter } from "../adapters/gratiaSignalAdapter"
import { presencePing } from "../adapters/presence-ping"
import { createSimSignalBus } from "../adapters/sim-signal-bus"
import { createWebRTCSignalBus } from "../adapters/webrtc-signal-bus"
import { PresenceKernel } from "../core/presence-kernel"

function getTransport(): "sim" | "webrtc" {
  if (typeof window === "undefined") return "sim"
  const params = new URLSearchParams(window.location.search)
  return params.get("transport") === "webrtc" ? "webrtc" : "sim"
}

export function bootOS() {
  const peerId = `peer-${Math.random().toString(36).slice(2, 8)}`
  const transport = getTransport()
  const bus =
    transport === "webrtc"
      ? createWebRTCSignalBus({
          signalingUrl: "wss://your-hub/ws",
          roomId: "garden",
          peerId,
        })
      : createSimSignalBus("gratia-signal")

  const kernel = new PresenceKernel(1000)
    .use(consoleAdapter())
    .use(presencePing(peerId))
  const signal = gratiaSignalAdapter({
    bus,
    seed: typeof window !== "undefined" ? window.location.href : undefined,
    privacy: { includeWhisper: true },
  })

  kernel.use(signal)
  kernel.start()

  if (typeof window !== "undefined") {
    ;(window as any).gratia = {
      k: kernel,
      radar: () => signal.radar.list(),
      me: () => signal.current(),
      whisper: (message: string) => kernel.whisper(message),
      phase: (phase: Parameters<PresenceKernel["setPhase"]>[0]) =>
        kernel.setPhase(phase),
      mood: (mood: Parameters<PresenceKernel["setMood"]>[0]) =>
        kernel.setMood(mood),
      transport,
    }
    console.info(
      `📡 Signal online via ${transport}. Try: gratia.radar(), gratia.whisper("presence")`
    )
  }

  return kernel
}

if (typeof window !== "undefined") {
  bootOS()
}
