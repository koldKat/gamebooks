// choices.js - Internal play-screen module; use ../play.js externally.

import { state, saveState, isTerminal, parseSecId, isValidSecId, allDiscoveredSections } from '../state.js';
import { t } from '../i18n.js';
import { naturalCompare } from '../sort.js';
import { showAlert } from '../confirm.js';
import { render } from './render.js';
import { confirmAlphanumericSwitch } from './dialogs.js';

// Exported so liveread.js can reveal-on-arrival choices from imported
// book_sections data using the same dedup/orphan-cleanup path as manual entry.
export function commitChoices(sec, choices) {
  const deduped = [...new Set(choices)].sort((a, b) => {
    const av = isValidSecId(a), bv = isValidSecId(b);
    if (av && bv) {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      if (typeof a === 'number') return -1;
      if (typeof b === 'number') return 1;
      return naturalCompare(a, b);
    }
    if (av) return -1;
    if (bv) return 1;
    return (b === 0 ? 1 : 0) - (a === 0 ? 1 : 0); // 0 (win) before -1 (death)
  });
  const existingNote    = state.graph[sec]?.note;
  const existingPri     = state.graph[sec]?.priority;
  const existingBattle  = state.graph[sec]?.battle;
  const existingColor   = state.graph[sec]?.color;
  const existingPortals = state.graph[sec]?.portals;
  const existingShowNote = state.graph[sec]?.showNote;
  const oldChoices = state.graph[sec]?.choices || [];
  state.graph[sec] = { choices: deduped };
  if (existingNote)     state.graph[sec].note     = existingNote;
  if (existingPri)      state.graph[sec].priority = existingPri;
  if (existingBattle)   state.graph[sec].battle   = existingBattle;
  if (existingColor)    state.graph[sec].color    = existingColor;
  if (existingPortals)  state.graph[sec].portals  = existingPortals;
  if (existingShowNote) state.graph[sec].showNote  = existingShowNote;

  _cleanupOrphanedTargets(sec, oldChoices, deduped);

  saveState();
  render();
}

// A choice that's removed from `sec` may leave its target node with no
// incoming edges from anywhere. If a playthrough's current position is
// that now-orphaned node, revert it back to the previous node in its path.
// The orphaned node itself is also deleted, unless it carries metadata
// (note/priority/battle/color/portals) worth preserving.
function _cleanupOrphanedTargets(sec, oldChoices, newChoices) {
  // Protect the book's default start plus every run's own entry point (path[0])
  // - a run begun via the alternate-start button (play.js's startPlaythrough)
  // can legitimately sit on a node nothing else points to.
  const roots = new Set([isValidSecId(state.startSection) ? state.startSection : 1]);
  state.playthroughs.forEach(pt => { if (isValidSecId(pt?.path?.[0])) roots.add(pt.path[0]); });
  const removed = oldChoices.filter(c => !newChoices.includes(c) && !isTerminal(c) && c !== sec);

  for (const target of removed) {
    if (roots.has(target)) continue;

    const hasIncoming = Object.entries(state.graph).some(([srcKey, data]) => {
      const src = parseSecId(srcKey);
      return src !== target && (data.choices || []).includes(target);
    });
    if (hasIncoming) continue;

    state.playthroughs.forEach(pt => {
      while (pt.path.length > 1 && pt.path[pt.path.length - 1] === target) {
        pt.path.pop();
      }
    });

    const node = state.graph[target];
    const hasMetadata = node && (node.note || node.priority || node.battle || node.color || node.portals || node.showNote || node.manual);
    if (node && !hasMetadata) {
      delete state.graph[target];
    }
  }
}

// allowEmpty: an explicitly empty box commits choices:[] ("no more choices
// here", a genuine dead end) instead of silently doing nothing - that no-op
// meant openEditModal's "clear everything and save" had no way to ever
// actually remove the last choice(s) from an already-mapped node. Only
// openEditModal opts into this; the first-time "Record & Choose" flow keeps
// the old no-op behavior, since an empty submit there is far more likely to
// be an accidental click/Enter before typing anything than a deliberate
// "this section has no choices" - see call sites.
export function handleRecordChoices(sec, raw, allowEmpty = false) {
  if (raw === '') {
    if (allowEmpty) commitChoices(sec, []);
    return;
  }
  if (!raw) return;
  const parsed = raw
    .split(/[.,;\s]+/)
    .map(s => parseSecId(s.trim()))
    .filter(n => n !== null && n !== sec && (isTerminal(n) || isValidSecId(n)));
  if (!parsed.length) return;

  const hasAlpha = parsed.some(n => typeof n === 'string');

  if (hasAlpha && !state.alphanumericSections) {
    const example = parsed.find(n => typeof n === 'string');
    confirmAlphanumericSwitch(example, () => commitChoices(sec, parsed));
    return;
  }

  const choices = state.alphanumericSections
    ? parsed
    : parsed.filter(n => typeof n !== 'number' || n <= (state.totalSections || Infinity));
  if (!choices.length) return;

  if (state.alphanumericSections && state.totalSections > 0) {
    const discovered = allDiscoveredSections();
    const newSections = choices.filter(n => isValidSecId(n) && !discovered.has(n));
    if (discovered.size + newSections.length > state.totalSections) {
      showAlert(t('play.choices_exceed_limit', { limit: state.totalSections }));
      return;
    }
  }

  commitChoices(sec, choices);
}
