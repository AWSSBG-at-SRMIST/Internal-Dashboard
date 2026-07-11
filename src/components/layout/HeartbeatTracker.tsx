'use client';
import { useEffect } from 'react';

const HEARTBEAT_INTERVAL_MS = 60_000;

// Silently pings the server roughly once a minute while this tab is open and
// focused, so Presidium can see aggregate active-hours/visit-frequency on
// the Activity page. Deliberately stops while the tab is backgrounded or
// minimized (Page Visibility API) — leaving a tab open elsewhere shouldn't
// count as "active."
export default function HeartbeatTracker() {
  useEffect(() => {
    function ping() {
      if (document.visibilityState !== 'visible') return;
      fetch('/api/presence/heartbeat', { method: 'POST' }).catch(() => {});
    }

    ping(); // count this page load immediately, don't wait a full interval
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);

    // Coming back to the tab shouldn't wait up to a minute for the next tick.
    document.addEventListener('visibilitychange', ping);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', ping);
    };
  }, []);

  return null;
}
