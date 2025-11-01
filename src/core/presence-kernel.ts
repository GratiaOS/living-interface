// TODO: Paste the PresenceKernel implementation from Chat (🌬️)
// Gratia OS — Presence Kernel 🌬️
// A tiny, composable heartbeat for awareness-as-system.

export type Phase = "companion" | "presence" | "archive"
export type Mood = "soft" | "presence" | "focused" | "celebratory"

export type PresenceSnapshot = Readonly<{
  t: number
  phase: Phase
  mood: Mood
  peers: number
  whisper?: string
  meta?: Record<string, unknown>
}>

export type KernelEvent =
  | { type: "tick"; snap: PresenceSnapshot }
  | { type: "phase:set"; phase: Phase; snap: PresenceSnapshot }
  | { type: "mood:set"; mood: Mood; snap: PresenceSnapshot }
  | { type: "whisper"; message: string; snap: PresenceSnapshot }
  | { type: "peer:up"; id: string; snap: PresenceSnapshot }
  | { type: "peer:down"; id: string; snap: PresenceSnapshot }

export type Unsubscribe = () => void

export interface PresenceAdapter {
  /** Called once when adapter is registered */
  init?(kernel: PresenceKernel): void
  /** Optional periodic pulse from kernel */
  onTick?(snap: PresenceSnapshot): void
  /** Outbound events you can implement (no-op if not needed) */
  emit?(evt: KernelEvent): void
  /** Cleanup if removed or kernel stops */
  dispose?(): void
}

export type KernelPlugin = (kernel: PresenceKernel) => void

export class PresenceKernel {
  private phase: Phase = "companion"
  private mood: Mood = "soft"
  private peers = new Map<string, number>()
  private whisperMsg = ""
  private listeners = new Set<(e: KernelEvent) => void>()
  private adapters = new Set<PresenceAdapter>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly intervalMs: number = 1000,
    private readonly now: () => number = () => Date.now()
  ) {}

  start() {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), this.intervalMs)
    for (const adapter of this.adapters) adapter.init?.(this)
    this.tick()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const adapter of this.adapters) adapter.dispose?.()
  }

  get snapshot(): PresenceSnapshot {
    return Object.freeze({
      t: this.now(),
      phase: this.phase,
      mood: this.mood,
      peers: this.activePeerCount(),
      whisper: this.whisperMsg || undefined,
    })
  }

  setPhase(next: Phase) {
    if (this.phase === next) return
    this.phase = next
    this.publish({ type: "phase:set", phase: next, snap: this.snapshot })
  }

  setMood(next: Mood) {
    if (this.mood === next) return
    this.mood = next
    this.publish({ type: "mood:set", mood: next, snap: this.snapshot })
  }

  whisper(message: string) {
    this.whisperMsg = message
    this.publish({ type: "whisper", message, snap: this.snapshot })
  }

  upsertPeer(id: string) {
    this.peers.set(id, this.now())
    this.publish({ type: "peer:up", id, snap: this.snapshot })
  }

  dropPeer(id: string) {
    this.peers.delete(id)
    this.publish({ type: "peer:down", id, snap: this.snapshot })
  }

  activePeerCount(staleMs = 15_000) {
    const now = this.now()
    for (const [id, seen] of this.peers) {
      if (now - seen > staleMs) this.peers.delete(id)
    }
    return this.peers.size
  }

  use(adapter: PresenceAdapter): this {
    this.adapters.add(adapter)
    if (this.timer) adapter.init?.(this)
    return this
  }

  plugin(plugin: KernelPlugin): this {
    plugin(this)
    return this
  }

  on(fn: (e: KernelEvent) => void): Unsubscribe {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private publish(event: KernelEvent) {
    for (const adapter of this.adapters) adapter.emit?.(event)
    for (const listener of this.listeners) listener(event)
  }

  private tick() {
    const snap = this.snapshot
    for (const adapter of this.adapters) adapter.onTick?.(snap)
    this.publish({ type: "tick", snap })
  }
}
