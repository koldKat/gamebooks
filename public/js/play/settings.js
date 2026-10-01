// settings.js - Internal play-screen module; use ../play.js externally.

import { playContext } from './context.js';

// ── Discoverable sections cap ───────────────────────────────────────────────
export function setDiscoverableLimit(n) { playContext._discoverableLimit = (n != null && n > 0) ? n : null; }

// ── Trail collapsed state ────────────────────────────────────────────────────
export function setTrailCollapsed(v) { playContext._trailCollapsed = !!v; }
export function setOnTrailToggle(fn) { playContext._onTrailToggle = fn; }

// ── Open world context (set by main.js when a book is opened) ────────────────
export function setOnViewPublicRun(fn) { playContext._onViewPublicRun = fn; }

export function setOpenWorldContext({ isOpenWorld = false, seriesId = null, seriesBooks = [], onPortalTravel = null, onNewSeriesRun = null, crossBookEnabled = null, onRunActivated = null, onRunDeleted = null, getRunLocation = null } = {}) {
  playContext._owIsOpenWorld       = !!isOpenWorld;
  playContext._owSeriesId          = seriesId;
  playContext._owSeriesBooks       = seriesBooks || [];
  playContext._owPortalHandler     = onPortalTravel || null;
  playContext._onNewSeriesRun      = onNewSeriesRun || null;
  playContext._owCrossBookEnabled  = crossBookEnabled || null;
  playContext._onRunActivated      = onRunActivated || null;
  playContext._onRunDeleted        = onRunDeleted || null;
  playContext._owGetRunLocation    = getRunLocation || null;
}

// ── Render pipeline ─────────────────────────────────────────────────────────

// A list rather than a single slot - dice.js registers its own post-render
// restore here, and liveread.js needs the same "ran after every render()"
// timing (fast-travel jumps and the sidebar's own choice buttons move pt.path
// without going through setViewingPt, so liveread.js can't just hook
// setOnViewingPtChange the way the rest of its lifecycle does).
export function setAfterRenderFn(fn) { if (fn) playContext._afterRenderFns.push(fn); }

// New players often don't realize the choices box needs typing into - pulse it
// until they've used it enough times to have clearly figured it out. Synced
// server-side via ui_prefs (see prefs.js), not per-book, since it's about
// general UI familiarity rather than progress in any one book.
export const CHOICES_PULSE_THRESHOLD = 50;
export function setChoicesRecordedCount(n) { playContext._choicesRecordedCount = Number(n) || 0; }
export function setOnChoicesRecorded(fn)   { playContext._onChoicesRecordedFn = fn; }

// Ref-counted rather than a plain boolean: party.js wraps SSE-driven state
// syncs in suppressAutoNav(true)/(false), and liveread.js wraps its whole
// open/close lifecycle the same way - a boolean would let whichever one
// finishes first (e.g. a party sync completing while the reading panel is
// still open) clear the other's still-active suppression via its own
// finally-block false call.
export function suppressAutoNav(v) { playContext._suppressAutoNavDepth = Math.max(0, playContext._suppressAutoNavDepth + (v ? 1 : -1)); }

export function setFastTravelHandler(fn) { playContext._fastTravelHandler = fn; }
export function setAltStartHandler(fn) { playContext._altStartHandler = fn; }
