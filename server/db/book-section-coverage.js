'use strict';

// Verify complete gamebook coverage against canonical sections and printed reachability limits.
function completionTarget(row) {
  return Number.isSafeInteger(row.discoverable_sections) && row.discoverable_sections > 0
    && row.discoverable_sections < row.total_sections ? row.discoverable_sections : row.total_sections;
}

function hasFullBookCoverage(row, covered, canonical) {
  const total = row.total_sections;
  if (!Number.isSafeInteger(total) || total < 1) return false;
  const target = completionTarget(row);
  if (canonical.length && canonical.length !== total && !(target < total && canonical.length >= target)) return false;
  if (canonical.length) return canonical.filter(id => covered.has(id)).length >= target;
  if (target < total) {
    const maximum = row.max_section_number ?? total;
    return [...covered].filter(id => /^[1-9]\d*$/.test(id) && Number(id) <= maximum).length >= target;
  }
  if ((row.max_section_number ?? total) !== total || covered.size < total) return false;
  for (let id = 1; id <= total; id++) if (!covered.has(String(id))) return false;
  return true;
}

module.exports = { completionTarget, hasFullBookCoverage };
