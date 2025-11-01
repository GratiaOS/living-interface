import { PresenceAdapter, PresenceKernel } from "../core/presence-kernel"

export const presencePing = (id: string): PresenceAdapter => {
  let timer: ReturnType<typeof setInterval> | null = null
  let kernel: PresenceKernel | null = null

  return {
    init(k) {
      kernel = k
      timer = setInterval(() => kernel?.upsertPeer(id), 5000)
      k.upsertPeer(id)
    },
    dispose() {
      if (timer) clearInterval(timer)
      kernel?.dropPeer(id)
    },
  }
}
