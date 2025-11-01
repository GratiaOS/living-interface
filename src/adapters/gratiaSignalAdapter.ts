// 📡 Gratia Signal Adapter — discovery by resonance, not reach.
//
// Plugs into PresenceKernel and periodically emits a compact GratiaSignal.
// Also listens to incoming signals (via a provided subscribe() bus) and
// maintains a tiny in-memory radar with auto-expiry.
//
// Usage:
// kernel.use(gratiaSignalAdapter({ bus }))

import type {
  Mood,
  Phase,
  PresenceAdapter,
  PresenceKernel,
} from "../core/presence-kernel"

export type GratiaSignal = {
  id: string
  t: number
  phase: Phase
  mood: Mood
  whisper?: string
  seed?: string
  energy?: number
  sig?: string
}

export type Unsubscribe = () => void

export type SignalBus = {
  send: (signal: GratiaSignal) => void
  subscribe: (fn: (signal: GratiaSignal) => void) => Unsubscribe
}

export type GratiaSignalOpts = {
  bus: SignalBus
  peerId?: string
  seed?: string
  interval?: number
  staleMs?: number
  privacy?: {
    includeWhisper?: boolean
  }
  energy?: () => number
  resonance?: (a: GratiaSignal, b: GratiaSignal) => number
}

export function defaultResonance(a: GratiaSignal, b: GratiaSignal): number {
  let score = 0
  if (a.phase === b.phase) score += 0.4
  if (a.mood === b.mood) score += 0.2
  if (a.whisper && b.whisper && a.whisper.toLowerCase() === b.whisper.toLowerCase()) {
    score += 0.3
  }
  if (typeof a.energy === "number" && typeof b.energy === "number") {
    score += Math.max(0, 0.1 - Math.abs(a.energy - b.energy))
  }
  return Math.min(1, score)
}

export type RadarEntry = {
  signal: GratiaSignal
  seenAt: number
  resonance: number
}

export type Radar = {
  list(): RadarEntry[]
  get(id: string): RadarEntry | undefined
  sweep(now: number): void
}

function createRadar(
  staleMs: number,
  self: () => GratiaSignal,
  resonance: (a: GratiaSignal, b: GratiaSignal) => number
): Radar & { upsert: (signal: GratiaSignal) => void } {
  const map = new Map<string, RadarEntry>()
  return {
    list: () => {
      const arr = Array.from(map.values())
      arr.sort((a, b) => (b.resonance - a.resonance) || (b.seenAt - a.seenAt))
      return arr
    },
    get: (id) => map.get(id),
    sweep: (now) => {
      for (const [id, entry] of map) {
        if (now - entry.seenAt > staleMs) map.delete(id)
      }
    },
    upsert: (incoming) => {
      const me = self()
      if (incoming.id === me.id) return
      const entry: RadarEntry = {
        signal: incoming,
        seenAt: Date.now(),
        resonance: resonance(me, incoming),
      }
      map.set(incoming.id, entry)
    },
  }
}

export function gratiaSignalAdapter(opts: GratiaSignalOpts): PresenceAdapter & {
  radar: Radar
  current: () => GratiaSignal
} {
  const {
    bus,
    peerId = `peer-${Math.random().toString(36).slice(2, 8)}`,
    seed,
    interval = 15_000,
    staleMs = 60_000,
    privacy = { includeWhisper: true },
    energy = defaultEnergyHeuristic,
    resonance = defaultResonance,
  } = opts

  let kernel: PresenceKernel | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let unsubBus: Unsubscribe | null = null
  let unsubKernel: Unsubscribe | null = null
  let last: GratiaSignal | null = null

  const selfSignal = (): GratiaSignal => {
    if (!kernel) {
      throw new Error("PresenceKernel not available yet")
    }
    const snapshot = kernel.snapshot
    const signal: GratiaSignal = {
      id: peerId,
      t: snapshot.t,
      phase: snapshot.phase,
      mood: snapshot.mood,
      seed,
      energy: clamp01(energy()),
      whisper: privacy.includeWhisper ? snapshot.whisper : undefined,
    }
    last = signal
    return signal
  }

  const radarWithUpsert = createRadar(staleMs, () => last ?? selfSignal(), resonance)

  const emitNow = () => {
    try {
      bus.send(selfSignal())
    } catch {
      // swallow transport errors
    }
  }

  return {
    init(k) {
      kernel = k
      timer = setInterval(emitNow, interval)
      emitNow()

      unsubKernel = k.on((event) => {
        if (event.type === "phase:set" || event.type === "mood:set" || event.type === "whisper") {
          emitNow()
        }
        if (event.type === "tick") {
          radarWithUpsert.sweep(event.snap.t)
        }
      })

      unsubBus = bus.subscribe((signal) => {
        radarWithUpsert.upsert(signal)
      })
    },

    onTick() {},

    dispose() {
      if (timer) clearInterval(timer)
      timer = null
      unsubBus?.()
      unsubBus = null
      unsubKernel?.()
      unsubKernel = null
    },

    radar: {
      list: () => radarWithUpsert.list(),
      get: (id) => radarWithUpsert.get(id),
      sweep: (now) => radarWithUpsert.sweep(now),
    },
    current: () => last ?? selfSignal(),
  }
}

function clamp01(x: number) {
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

function defaultEnergyHeuristic(): number {
  return 0.4 + (Date.now() % 3000) / 10_000
}

export function createLocalSignalBus(): SignalBus {
  const listeners = new Set<(signal: GratiaSignal) => void>()
  return {
    send: (signal) => {
      for (const listener of listeners) listener(signal)
    },
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}
