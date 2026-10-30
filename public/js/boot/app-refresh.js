// Check for a release only when an idle main page returns from the background.
import { canRefreshMainPage } from './refresh-safety.js';

const AWAY_MS = 5 * 60 * 1000;
let started = false;

export function initAppRefresh(initialConfig) {
  if (started) return;
  started = true;
  // This baseline belongs to the loaded document; live header updates must not replace it.
  const baseline = initialConfig;
  let awayAt = null, interaction = 0, checking = false, reloading = false;
  const noteInteraction = () => { interaction++; };
  for (const event of ['pointerdown', 'pointermove', 'keydown', 'input', 'change', 'wheel', 'touchstart', 'scroll']) {
    document.addEventListener(event, noteInteraction, { capture: true, passive: true });
  }
  window.addEventListener('popstate', noteInteraction);
  window.addEventListener('hashchange', noteInteraction);

  function leave() {
    // Visibility is already hidden here, so the full safety check runs on return instead.
    if (awayAt === null) awayAt = Date.now();
    noteInteraction(); // Invalidate any response already in flight.
  }
  async function returning() {
    if (document.visibilityState !== 'visible' || awayAt === null) return;
    const elapsed = Date.now() - awayAt;
    awayAt = null;
    if (elapsed < AWAY_MS || checking || reloading || !canRefreshMainPage()) return;
    const beforeRequest = interaction;
    checking = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('/api/config', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) return;
      const latest = await response.json();
      const changed = typeof baseline?.version === 'string' && !!baseline.version &&
        typeof latest?.version === 'string' && !!latest.version && baseline.version !== latest.version;
      // Navigation, typing, scrolling or another departure cancels this return's update.
      if (!changed || interaction !== beforeRequest || !canRefreshMainPage()) return;
      reloading = true;
      location.reload();
    } catch (_) { /* Offline/restarting: keep this page intact until a later return. */ }
    finally { clearTimeout(timeout); checking = false; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') leave();
    else returning();
  });
  window.addEventListener('pagehide', leave);
  window.addEventListener('pageshow', returning);
  window.addEventListener('focus', returning);
  if (document.visibilityState === 'hidden') leave();
}
