import React from "react"

import { RadarConstellation } from "./Radar"
import "./radar.css"

export function App() {
  const poll = React.useCallback(() => {
    const list = (window as any).gratia?.radar?.() || []
    return list
  }, [])

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1>Gratia OS — The Living Interface</h1>
      <p>Presence kernel is running. Open a second tab to see the constellation.</p>
      <p>
        Try in console: <code>gratia.whisper("presence")</code> or <code>gratia.phase("archive")</code>
      </p>
      <RadarConstellation poll={poll} />
    </div>
  )
}
