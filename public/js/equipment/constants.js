// constants.js - Internal equipment module; use ../equipment.js externally.

import { t } from '../i18n.js';

// Slot centers use body-relative percentages; same-column gaps must clear slot height.
export const SLOTS = [
  { key: 'head',      label: () => t('eq.slot.head'),   x: 50, y: 14 },
  { key: 'neck',      label: () => t('eq.slot.neck'),   x: 50, y: 29 },
  { key: 'chest',     label: () => t('eq.slot.chest'),  x: 50, y: 44 },
  { key: 'belt',      label: () => t('eq.slot.belt'),   x: 50, y: 59 },
  { key: 'legs',      label: () => t('eq.slot.legs'),   x: 50, y: 74 },
  { key: 'feet',      label: () => t('eq.slot.feet'),   x: 50, y: 89 },
  { key: 'cloak',     label: () => t('eq.slot.cloak'),    x: 10, y: 18 },
  { key: 'ring1',     label: () => t('eq.slot.ring'),     x: 10, y: 36 },
  { key: 'ring3',     label: () => t('eq.slot.ring'),     x: 10, y: 54 },
  { key: 'primary',   label: () => t('eq.slot.weapon'),   x: 10, y: 72 },
  { key: 'hands',     label: () => t('eq.slot.hands'),    x: 90, y: 18 },
  { key: 'ring2',     label: () => t('eq.slot.ring'),     x: 90, y: 36 },
  { key: 'ring4',     label: () => t('eq.slot.ring'),     x: 90, y: 54 },
  { key: 'secondary', label: () => t('eq.slot.offhand'), x: 90, y: 72 },
  { key: 'back',      label: () => t('eq.slot.back'),     x: 90, y: 90 },
];

// Consumable item slots - rendered in their own row below the dummy, at the
// same size as inventory slots (matches .inv-slot: 80x98px).
export const ITEM_SLOTS = [
  { key: 'item1', label: () => t('eq.slot.item', { n: 1 }) },
  { key: 'item2', label: () => t('eq.slot.item', { n: 2 }) },
  { key: 'item3', label: () => t('eq.slot.item', { n: 3 }) },
  { key: 'item4', label: () => t('eq.slot.item', { n: 4 }) },
  { key: 'item5', label: () => t('eq.slot.item', { n: 5 }) },
];

export const ALL_SLOTS = [...SLOTS, ...ITEM_SLOTS];

export const DUMMY_SVG = `
<svg class="eq-dummy" viewBox="0 0 280 560" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <radialGradient id="eqGlowGrad" cx="50%" cy="42%" r="58%">
      <stop offset="0%"   stop-color="#64748b" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#64748b" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="eqFigureGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#718096" stop-opacity="0.48" />
      <stop offset="48%" stop-color="#475569" stop-opacity="0.28" />
      <stop offset="100%" stop-color="#334155" stop-opacity="0.16" />
    </linearGradient>
  </defs>
  <ellipse class="eq-dummy-glow" cx="140" cy="292" rx="116" ry="236" />

  <g class="eq-dummy-figure">
    <path class="eq-dummy-outline" d="M126 106 L125 126 Q108 135 94 141
      Q78 148 75 172 L60 234 Q55 251 54 269 L48 316
      Q43 324 44 337 L47 350 Q49 355 52 351 L53 339
      L56 354 Q58 358 61 354 L65 336 Q67 327 63 319
      L78 268 Q84 253 88 238 L103 194 Q105 225 111 250
      L106 288 Q98 311 101 339 L108 399 Q105 420 105 444
      L105 489 L94 504 Q89 514 98 518 L124 518
      Q130 515 128 506 L127 488 L131 442 L140 360
      L149 442 L153 488 L152 506 Q150 515 156 518
      L182 518 Q191 514 186 504 L175 489 L175 444
      Q175 420 172 399 L179 339 Q182 311 174 288
      L169 250 Q175 225 177 194 L192 238 Q196 253 202 268
      L217 319 Q213 327 215 336 L219 354 Q222 358 224 354
      L227 339 L228 351 Q231 355 233 350 L236 337
      Q237 324 232 316 L226 269 Q225 251 220 234
      L205 172 Q202 148 186 141 Q172 135 155 126 L154 106 Z" />
    <path class="eq-dummy-outline" d="M114 77 Q112 48 140 46
      Q168 48 166 77 L164 94 Q160 109 149 117
      Q140 122 131 117 Q120 109 116 94 Z" />
    <g class="eq-dummy-detail">
      <path d="M125 127 L140 148 L155 127 M108 145 Q119 155 131 156
        M172 145 Q161 155 149 156 M140 153 V280
        M105 193 Q116 205 133 206 M175 193 Q164 205 147 206
        M111 250 Q140 258 169 250 M108 281 Q140 290 172 281
        M106 294 Q140 304 174 294 M140 305 V340
        M106 337 L126 351 M174 337 L154 351
        M109 400 Q118 406 131 401 M171 400 Q162 406 149 401
        M106 465 L128 467 M174 465 L152 467
        M105 488 L126 490 M175 488 L154 490
        M97 508 L125 508 M183 508 L155 508
        M62 238 L84 245 M218 238 L196 245
        M50 310 L66 314 M230 310 L214 314" />
    </g>
  </g>
</svg>`;
