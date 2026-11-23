'use strict';

const endingBits = node => {
  const choices = Array.isArray(node?.choices) ? node.choices : [];
  return (choices.some(choice => choice === 0 || choice === '0') ? 1 : 0)
    | (choices.some(choice => choice === -1 || choice === '-1') ? 2 : 0);
};

const resultBits = { success: 1, death: 2 };
const endings = { 1: 'success', 2: 'death' };

// Graph endpoints classify story endings. Battle deaths and portals are run-specific.
function reconcileRunEndings(previous, next, now = Date.now()) {
  const changed = new Set();
  for (const field of ['playthroughs', 'preSeriesRuns']) {
    const before = previous?.[field] || [];
    const byStart = new Map(before.filter(run => run?.startedAt != null).map(run => [run.startedAt, run]));
    for (const [index, run] of (next[field] || []).entries()) {
      const oldRun = run?.startedAt == null ? before[index] : byStart.get(run.startedAt);
      const section = run?.path?.at(-1);
      const oldSection = oldRun?.path?.at(-1);
      if (!oldRun || section == null || oldSection == null) continue;
      const oldNode = previous.graph?.[oldSection];
      const node = next.graph?.[section];
      const oldBits = endingBits(oldNode);
      const bits = endingBits(node);
      const recorded = resultBits[run.result];
      const sameSection = String(section) === String(oldSection);
      if (run.completed && !oldRun.completed && oldRun.completedAt != null
          && run.completedAt === oldRun.completedAt && sameSection) {
        // A save queued before a reopened run refreshed may still carry its old completion.
        run.completed = false;
        run.result = null;
      } else if (run.completed && oldRun.completed && recorded) {
        if (bits & recorded) continue;
        // A mismatch can also come from a legacy save made before ending edits were reconciled.
        if (endings[bits] && ((oldBits & recorded) || bits === oldBits)) {
          run.result = endings[bits];
        } else if (oldBits & recorded) {
          run.completed = false;
          run.result = null;
        } else continue;
      } else if (!run.completed && !oldRun.completed && run.startedAt
          && sameSection && oldNode && !oldNode.discovered
          && !node?.discovered && bits !== oldBits && endings[bits]
          && node.choices.length === 1 && !node.portals?.length) {
        run.completed = true;
        run.result = endings[bits];
        run.completedAt = now;
        if (field === 'playthroughs' && next.activePtIndex === index) next.activePtIndex = null;
      } else continue;
      if (run.startedAt != null) changed.add(run.startedAt);
    }
  }
  return changed;
}

module.exports = { reconcileRunEndings };
