// liveread-shared.js - the handful of in-app-reading pieces that are
// genuinely identical between desktop (liveread.js) and mobile
// (public/mobile/js/reader.js), so the two can't literally copy-paste-drift
// on them the way the trophy/shield icons already did once. Deliberately
// zero imports of its own, and must stay that way - mobile's reader.js
// exists specifically to avoid pulling in liveread.js's own heavier import
// chain (play.js -> charsheet.js/equipment.js, vis-network), so anything
// added here has to be as import-free as this file is.
//
// This does NOT own the run-end screen's actual markup/DOM wiring - each
// platform's own #liveread-body/#m-top structure, panel-vs-pane model, and
// CSS are different enough that forcing them through one shared renderer
// would cost more than it saves. It only owns the parts with truly zero
// platform-specific shape: the icon SVGs and which i18n key the heading
// uses. Both use the same `end-icon` class name on the <svg> itself -
// each platform's own CSS still independently defines that class's actual
// size/color/filter rules, scoped under its own wrapper (`.liveread-end`
// vs `.m-end-achievement`).

export const TROPHY_SVG = `<svg class="end-icon" viewBox="0 0 48 48" fill="none">
  <path d="M14 8h20v10a10 10 0 0 1-20 0V8Z" stroke="#f5a623" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M14 10H7v3a7 7 0 0 0 7 7" stroke="#f5a623" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M34 10h7v3a7 7 0 0 1-7 7" stroke="#f5a623" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M24 28v6" stroke="#f5a623" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M16 40h16l-2-6H18l-2 6Z" stroke="#f5a623" stroke-width="2.5" stroke-linejoin="round"/>
</svg>`;

export const BROKEN_SHIELD_SVG = `<svg class="end-icon" viewBox="0 0 48 48" fill="none">
  <path d="M24 6 8 12v11c0 10 7 16.5 16 19 9-2.5 16-9 16-19V12L24 6Z" stroke="#e74c3c" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M20 16l4 6-5 4 5 6-3 6" stroke="#e74c3c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export function terminalHeadingKey(win) {
  return win ? 'liveread.victory_heading' : 'liveread.death_heading';
}
