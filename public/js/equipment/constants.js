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
  </defs>
  <ellipse class="eq-dummy-glow" cx="140" cy="292" rx="116" ry="236" />

  <g class="eq-dummy-figure">
    <circle class="eq-dummy-head" cx="140" cy="82" r="28" />
    <path class="eq-dummy-neck" d="M128,116 H152 V138 H128 Z" />

    <path class="eq-dummy-shoulder-line" d="M87,157 C105,146 124,141 140,141 C156,141 175,146 193,157" />
    <path class="eq-dummy-arm" d="M89,162 L68,254 L58,328" />
    <path class="eq-dummy-arm" d="M191,162 L212,254 L222,328" />

    <path class="eq-dummy-torso" d="M100,154 H180 L170,283 H110 Z" />
    <path class="eq-dummy-centerline" d="M140,150 V283" />
    <path class="eq-dummy-beltline" d="M110,283 H170" />

    <path class="eq-dummy-leg" d="M122,304 L112,407 L104,504" />
    <path class="eq-dummy-leg" d="M158,304 L168,407 L176,504" />
    <path class="eq-dummy-base" d="M92,510 H120" />
    <path class="eq-dummy-base" d="M160,510 H188" />
  </g>
</svg>`;
