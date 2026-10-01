import { state, saveState } from '../state.js';
import { network, graphRuntime } from './runtime.js';


// True from the moment a stabilize() pass is issued until its
// stabilizationIterationsDone handler actually fires. Debouncing (below)
// only stops a *new* pass from being scheduled too soon after the last
// *request* - it says nothing about whether the *previous* pass has
// actually finished running yet. A graph with several fixed obstacles
// (e.g. manually-added nodes, which still count toward avoidOverlap
// collision-avoidance even though they don't move) can take longer than
// the debounce window to converge, so a second debounced call could fire
// while the first stabilize(300) is still active - starting a *second*
// concurrent physics pass on top of the first, each one independently
// shoving nodes around. That reads as the graph jittering chaotically
// while genuinely nothing should be moving it, confirmed via a user
// report that it stopped entirely with DevTools open the whole time
// (the added JS overhead widened timing enough that the first pass
// always finished before a second one could be scheduled - the same
// "adding a print statement masks a race" pattern from threaded code).

// Set when syncGraph() finds a pass already running (graphRuntime._stabilizing) and still
// needs one. The first version of this fix responded to that case by just
// rescheduling the same debounce timer to try again later - but that retry
// carried no logic of its own, so once it finally got its turn it called
// stabilize() unconditionally, trusting whatever hasUnpositioned had been at
// the moment this *specific* call was originally made rather than checking
// whether it was still true by the time it actually ran. If the in-flight
// pass's own completion had already placed everything in the meantime, that
// was an unnecessary extra pass on stale information. Now the in-flight
// pass's own completion handler is the only thing that starts a follow-up
// pass, and it does so by calling syncGraph() again - which re-derives
// hasUnpositioned fresh from current state - rather than trusting a snapshot
// from whenever this flag got set.

// Live-reading reveals a brand-new, never-before-mapped section on every
// single page turn - the read section usually has no already-positioned
// neighbor yet for _assignLocalPositions to place it next to, so it falls
// through to a full stabilize() pass below on every page turn, at normal
// reading pace (several seconds apart) well outside RESTABILIZE_DEBOUNCE_MS.
// A full 300-iteration pass on the whole graph every single page is real,
// sustained CPU cost that a slower reader would feel continuously. A single
// newly-revealed node doesn't need the same convergence a fresh full layout
// does, so liveread.js sets this for as long as its panel is open to trade
// precision for a much cheaper settle each time - the reader isn't watching
// the physics settle anyway, just the prose.

// The lighter iteration count above only cuts the cost of *one* pass - it
// doesn't stop a fresh pass from firing on nearly every page turn if pages
// are read faster than RESTABILIZE_DEBOUNCE_MS apart but not truly
// back-to-back (rapid-fire clicking during testing, not just normal
// reading, can land in exactly that gap). Widening the debounce while
// reading is active coalesces a burst of fast clicks into far fewer passes
// total, on top of each surviving pass already being cheaper.
const LIGHTWEIGHT_RESTABILIZE_DEBOUNCE_MS = 600;

// A burst of render() calls in quick succession (e.g. losing a run, marking it
// public, and starting a new one, each chaining through saveState/UI-update
// callbacks within a few ms of each other) used to restart the physics solver
// from scratch on every single call - interrupting a not-yet-finished
// stabilize() pass before it ever got to fire stabilizationIterationsDone,
// which could leave the graph visibly re-jostling indefinitely (worse the
// more fixed obstacles, e.g. manually-added nodes, the solver has to route
// around under avoidOverlap). Debouncing so only the last call in a tight
// burst actually kicks off a pass fixes it without changing anything for a
// single, isolated render().
const RESTABILIZE_DEBOUNCE_MS = 150;

export function syncPhysics(hasSavedPositions, hasUnpositioned, syncAgain) {
  // Physics management:
  // - Initial layout (no saved positions): the BFS-depth-grid pass above
  //   already pinned every reachable node (physics: !posValid, above), so
  //   initGraph's forceAtlas2Based sim - still nominally "enabled" at the
  //   network level - has nothing left to actually move. Its
  //   stabilizationIterationsDone handler still fires (trivially, near-
  //   instantly) and persists the same positions again; harmless.
  // - Existing layout, new nodes added: re-enable physics to place them, save on settle.
  // - Existing layout, all nodes positioned: keep physics off.
  //
  // Single-flight, not "debounce and blindly retry": if a pass is already
  // running (graphRuntime._stabilizing), this call doesn't schedule anything of its own -
  // it just flags graphRuntime._pendingSync and returns. The *only* thing that starts a
  // follow-up pass is the in-flight pass's own completion handler calling
  // syncAgain() again once it's done, which re-derives hasUnpositioned fresh
  // from current state at that later point in time. A version of this that
  // instead rescheduled a plain retry timer would call stabilize() again
  // unconditionally once its turn came up, even if the graph had already
  // been fully placed by the pass it waited on - an unnecessary pass argued
  // from stale information instead of a real, rechecked need.
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
          // Belt-and-suspenders alongside physics.enabled:false - stabilize()
          // runs its own internal loop that isn't guaranteed to be governed
          // by the enabled flag the same way ordinary always-on physics is,
          // so explicitly halting it here (it should already be finished,
          // this is a no-op in the normal case) avoids relying on that.
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
    // Force-disabling physics here while a stabilize() pass is still
    // actually in flight would leave graphRuntime._stabilizing stuck true forever (its
    // own completion handler, which is what normally clears it, never gets
    // to run) - silently blocking every future restabilize attempt for
    // this book until the network is torn down. Go through the same
    // cleanup the completion handler would have done instead of just
    // cutting physics off underneath it.
    if (graphRuntime._stabilizing) {
      graphRuntime._stabilizing = false;
      if (graphRuntime._stabilizeHandler) { network.off('stabilizationIterationsDone', graphRuntime._stabilizeHandler); graphRuntime._stabilizeHandler = null; }
      network.stopSimulation();
    }
    network.setOptions({ physics: { enabled: false } });
  }
}
