import { state, saveState } from '../core/state.js';
import { network, graphRuntime } from './runtime.js';


// Track stabilization until completion to prevent overlapping passes.
// Recheck pending syncs against current state; use lighter, debounced settling while reading.
const LIGHTWEIGHT_RESTABILIZE_DEBOUNCE_MS = 600;

// Debounce render bursts so they cannot repeatedly interrupt stabilization.
const RESTABILIZE_DEBOUNCE_MS = 150;

export function syncPhysics(hasSavedPositions, hasUnpositioned, syncAgain) {
  // Keep saved positions fixed; stabilize only unplaced nodes.
  // If a pass is running, defer and recheck placement after completion.
  if (hasSavedPositions && hasUnpositioned) {
    if (graphRuntime._stabilizing) {
      graphRuntime._pendingSync = true;
    } else {
      clearTimeout(graphRuntime._restabilizeTimer);
      graphRuntime._restabilizeTimer = setTimeout(() => {
        graphRuntime._restabilizeTimer = null;
        if (!network) return; // book switched away before the timer fired
        if (graphRuntime._stabilizeHandler) network.off('stabilizationIterationsDone', graphRuntime._stabilizeHandler);
        graphRuntime._stabilizeHandler = () => {
          graphRuntime._stabilizing = false;
          network.setOptions({ physics: { enabled: false } });
          // Explicitly stop stabilization: disabling physics alone may not halt its internal loop.
          network.stopSimulation();
          Object.assign(state.positions, network.getPositions());
          saveState();
          network.off('stabilizationIterationsDone', graphRuntime._stabilizeHandler);
          graphRuntime._stabilizeHandler = null;
          if (graphRuntime._pendingSync) { graphRuntime._pendingSync = false; syncAgain(); }
        };
        network.on('stabilizationIterationsDone', graphRuntime._stabilizeHandler);
        graphRuntime._stabilizing = true;
        network.setOptions({ physics: { enabled: true, stabilization: { fit: false } } });
        network.stabilize(graphRuntime._lightweightRestabilize ? 60 : 300);
      }, graphRuntime._lightweightRestabilize ? LIGHTWEIGHT_RESTABILIZE_DEBOUNCE_MS : RESTABILIZE_DEBOUNCE_MS);
    }
  } else if (hasSavedPositions) {
    clearTimeout(graphRuntime._restabilizeTimer);
    graphRuntime._restabilizeTimer = null;
    graphRuntime._pendingSync = false;
    // Use completion cleanup when stopping early so the in-flight guard cannot remain stuck.
    if (graphRuntime._stabilizing) {
      graphRuntime._stabilizing = false;
      if (graphRuntime._stabilizeHandler) { network.off('stabilizationIterationsDone', graphRuntime._stabilizeHandler); graphRuntime._stabilizeHandler = null; }
      network.stopSimulation();
    }
    network.setOptions({ physics: { enabled: false } });
  }
}
