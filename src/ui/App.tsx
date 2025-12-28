import React from 'react';

import { RadarConstellation } from './Radar';
import { Heartbeat, ConstellationHUD } from '@gratiaos/presence-kernel';
import './radar.css';

export function App() {
  const poll = React.useCallback(() => {
    const list = (window as any).gratia?.radar?.() || [];
    return list;
  }, []);

  return (
    <div className="min-h-screen space-y-4 p-6 font-sans text-lg">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold">Gratia OS — The Living Interface</h1>
        <p style={{ color: 'var(--color-subtle)' }}>Presence kernel is running. Open a second tab to see the constellation.</p>
        <p style={{ color: 'var(--color-muted)' }}>
          Try in console:
          <code
            style={{
              backgroundColor: 'var(--color-elev)',
              borderRadius: '6px',
              padding: '0 0.25rem',
              marginLeft: '0.35rem',
            }}>
            gratia.whisper("presence")
          </code>
          <code
            style={{
              backgroundColor: 'var(--color-elev)',
              borderRadius: '6px',
              padding: '0 0.25rem',
              marginLeft: '0.35rem',
            }}>
            gratia.phase("archive")
          </code>
        </p>
      </header>
      <section className="relative">
        <RadarConstellation poll={poll} />
      </section>
      <Heartbeat />
      <ConstellationHUD />
    </div>
  );
}
