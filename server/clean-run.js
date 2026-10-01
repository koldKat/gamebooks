'use strict';

function isCleanRun(run, previousRun, relatedRuns = []) {
  if (!run?.startedAt || !run.completed || !['success', 'death', 'battle'].includes(run.result) || !run.path?.length) return false;
  const runs = [run, previousRun, ...relatedRuns].filter(Boolean);
  return runs.every(pt => ['undosUsed', 'fastTravelsUsed'].every(key => {
    const count = pt[key] ?? 0;
    return typeof count === 'number' && Number.isFinite(count) && count === 0;
  }));
}

module.exports = { isCleanRun };
