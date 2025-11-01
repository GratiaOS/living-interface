import { PresenceAdapter } from "../core/presence-kernel"

export const consoleAdapter = (): PresenceAdapter => ({
  init: (kernel) => {
    const snap = kernel.snapshot
    console.log("[kernel:init]", snap.phase, snap.mood, `peers=${snap.peers}`)
  },
  onTick: (snap) => {
    if (snap.t % 5000 < 1000) {
      console.log("[tick]", snap.phase, snap.mood, `peers=${snap.peers}`)
    }
  },
  emit: (event) => {
    if (event.type === "whisper") console.info("🌬️", event.message)
  },
})
