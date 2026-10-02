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

// Post-render hooks serve dice and reading; not all navigation changes the viewed-run index.
export function setAfterRenderFn(fn) { if (fn) playContext._afterRenderFns.push(fn); }

// Persist choice-box onboarding per player, not per book.
export const CHOICES_PULSE_THRESHOLD = 50;
export function setChoicesRecordedCount(n) { playContext._choicesRecordedCount = Number(n) || 0; }
export function setOnChoicesRecorded(fn)   { playContext._onChoicesRecordedFn = fn; }

// Reference-count suppression so party and reader guards cannot release each other.
export function suppressAutoNav(v) { playContext._suppressAutoNavDepth = Math.max(0, playContext._suppressAutoNavDepth + (v ? 1 : -1)); }

export function setFastTravelHandler(fn) { playContext._fastTravelHandler = fn; }
export function setAltStartHandler(fn) { playContext._altStartHandler = fn; }
