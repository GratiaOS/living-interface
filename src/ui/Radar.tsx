import React, { useEffect, useMemo, useState } from "react"

type Entry = {
  id: string
  phase: "companion" | "presence" | "archive"
  mood: "soft" | "presence" | "focused" | "celebratory"
  whisper?: string
  energy?: number
  resonance: number
  seenAt: number
}

type RadarProvider = () => Array<{
  signal: {
    id: string
    phase: Entry["phase"]
    mood: Entry["mood"]
    whisper?: string
    energy?: number
  }
  resonance: number
  seenAt: number
}>

export function useRadar(poll: RadarProvider, interval = 1000) {
  const [list, setList] = useState<Entry[]>([])

  useEffect(() => {
    let alive = true
    const tick = () => {
      const rows = poll().map((row) => ({
        id: row.signal.id,
        phase: row.signal.phase,
        mood: row.signal.mood,
        whisper: row.signal.whisper,
        energy: row.signal.energy,
        resonance: row.resonance,
        seenAt: row.seenAt,
      }))
      if (alive) setList(rows)
    }
    tick()
    const timer = setInterval(tick, interval)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [poll, interval])

  return list
}

function hueForPhase(phase: Entry["phase"]) {
  if (phase === "companion") return 160
  if (phase === "presence") return 210
  return 330
}

export function RadarConstellation({ poll }: { poll: RadarProvider }) {
  const items = useRadar(poll, 1000)

  const dots = useMemo(() => {
    const now = Date.now()
    return items.slice(0, 18).map((entry: Entry, index: number) => {
      const hash = [...entry.id].reduce((acc, char) => acc + char.charCodeAt(0), 0)
      const angle = ((hash % 360) * Math.PI) / 180
      const radius = 48 + (index % 8) * 6
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      const age = Math.max(0, Math.min(1, 1 - (now - entry.seenAt) / 60_000))
      return { ...entry, x, y, age }
    })
  }, [items])

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]">
      {["tl", "tr", "br", "bl"].map((corner) => (
        <div key={corner} className={cornerClass(corner)} aria-hidden>
          {dots.map((dot) => {
            const hue = hueForPhase(dot.phase)
            const opacity = Math.max(0.15, dot.age * 0.9)
            const scale = 0.5 + dot.resonance * 0.5
            const size = 6 + Math.round((dot.energy ?? 0.5) * 6)
            return (
              <div
                key={corner + dot.id}
                className="radar-dot"
                style={{
                  transform: `translate(${dot.x}px, ${dot.y}px) scale(${scale})`,
                  width: size,
                  height: size,
                  backgroundColor: `hsl(${hue} 75% 62%)`,
                  opacity,
                  boxShadow: `0 0 10px hsl(${hue} 70% 65% / ${0.4 * opacity})`,
                }}
                title={`${dot.id} · ${dot.phase}${dot.whisper ? ` — ${dot.whisper}` : ""}`}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

function cornerClass(corner: string) {
  const base = "absolute"
  switch (corner) {
    case "tl":
      return `${base} left-2 top-2`
    case "tr":
      return `${base} right-2 top-2`
    case "br":
      return `${base} right-2 bottom-2`
    case "bl":
      return `${base} left-2 bottom-2`
    default:
      return base
  }
}
