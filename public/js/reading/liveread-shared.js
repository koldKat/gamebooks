// Import-free reading helpers shared by desktop and mobile.
// Keep platform-specific markup separate and avoid pulling desktop dependencies into mobile.

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
