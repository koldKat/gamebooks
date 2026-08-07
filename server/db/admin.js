'use strict';

// Admin-facing content management: tips, level-up/join templates, taglines seed data,
// items catalog, series/anthology admin listings, user/book admin stats, admin settings,
// announcements, and the shop economy (purchase/refund) including gift-a-book.
// Physically these lived interleaved across several mislabeled sections of the
// original server/db.js - consolidated here by actual domain rather than by
// original (often misleading) section comment.

const { db, _naturalCompareByName, _getPdfSize } = require('./connection');
const { computeLevel, getTitleForLevel, getUserXpInfo, awardXp, awardCoins, processStateXp, _insertNotif } = require('./xp');
const { purgeExpiredSessions } = require('./auth');

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    type        TEXT    NOT NULL DEFAULT 'weapon',
    svg_data    TEXT    NOT NULL DEFAULT '',
    description TEXT    DEFAULT NULL,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  );
`);

if (db.prepare('SELECT COUNT(*) AS n FROM items').get().n === 0) {
  const weaponSvg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${inner}</svg>`;
  const rot45 = (inner) => `<g transform="rotate(45 32 32)">${inner}</g>`;
  const weapons = [
    { name: 'Longsword', description: 'A classic double-edged blade. Reliable in any situation.', svg: weaponSvg(rot45(
      `<polygon points="32,5 29,37 35,37" fill="#cbd5e1"/><polygon points="32,5 32,36 35,37" fill="#e2e8f0" opacity="0.4"/><rect x="19" y="36" width="26" height="5" rx="2" fill="#64748b"/><rect x="30" y="41" width="4" height="13" rx="2" fill="#78350f"/><circle cx="32" cy="57" r="4" fill="#64748b"/>`
    )) },
    { name: 'Dagger', description: 'Short and quick. Perfect for close quarters.', svg: weaponSvg(rot45(
      `<polygon points="32,12 29.5,35 34.5,35" fill="#cbd5e1"/><polygon points="32,12 32,34 34.5,35" fill="#e2e8f0" opacity="0.4"/><rect x="23" y="34" width="18" height="4" rx="2" fill="#64748b"/><rect x="30" y="38" width="4" height="10" rx="2" fill="#7c2d12"/><circle cx="32" cy="51" r="3.5" fill="#64748b"/>`
    )) },
    { name: 'Battle Axe', description: 'Heavy single-headed axe. Devastating against armour.', svg: weaponSvg(rot45(
      `<rect x="31" y="8" width="2.5" height="50" rx="1.2" fill="#78350f"/><path d="M32,14 C20,12 12,18 11,27 C10,36 16,42 32,43 Z" fill="#94a3b8"/><path d="M32,14 C26,13 20,17 19,24 C18,30 20,37 32,38" fill="#cbd5e1" opacity="0.3"/><polygon points="32,8 30,16 34,16" fill="#94a3b8"/><rect x="29.5" y="54" width="5" height="4" rx="2" fill="#64748b"/>`
    )) },
    { name: 'Spear', description: 'Long reach, deadly thrust. Simple and effective.', svg: weaponSvg(rot45(
      `<rect x="31" y="18" width="2" height="43" rx="1" fill="#78350f"/><polygon points="32,4 28,20 36,20" fill="#94a3b8"/><polygon points="32,4 32,19 36,20" fill="#cbd5e1" opacity="0.4"/><rect x="29" y="18" width="6" height="4" rx="1" fill="#64748b"/><polygon points="32,61 30.5,56 33.5,56" fill="#64748b"/>`
    )) },
    { name: 'Mace', description: 'Flanged head delivers crushing blows. Ignores light armour.', svg: weaponSvg(rot45(
      `<rect x="30.5" y="33" width="3" height="27" rx="1.5" fill="#64748b"/><circle cx="32" cy="22" r="11" fill="#94a3b8"/><circle cx="29" cy="19" r="3.5" fill="#cbd5e1" opacity="0.2"/><polygon points="32,8 30.5,13 33.5,13" fill="#64748b"/><polygon points="32,36 30.5,31 33.5,31" fill="#64748b"/><polygon points="18,22 23,20.5 23,23.5" fill="#64748b"/><polygon points="46,22 41,20.5 41,23.5" fill="#64748b"/><polygon points="22.3,13.3 25.6,16.6 23.9,18.3" fill="#64748b"/><polygon points="41.7,30.7 38.4,27.4 40.1,25.7" fill="#64748b"/>`
    )) },
    { name: 'War Hammer', description: 'Two-handed bludgeon with a back spike. Armour bane.', svg: weaponSvg(rot45(
      `<rect x="30.5" y="30" width="3" height="30" rx="1.5" fill="#78350f"/><rect x="18" y="10" width="28" height="22" rx="3" fill="#94a3b8"/><rect x="20" y="12" width="14" height="18" rx="2" fill="#cbd5e1" opacity="0.2"/><polygon points="46,13 54,21 46,29" fill="#64748b"/><polygon points="32,10 30,4 34,4" fill="#94a3b8"/>`
    )) },
    { name: 'Crossbow', description: 'Mechanical ranged weapon. Slow to reload, lethal shot.', svg: weaponSvg(
      `<rect x="8" y="29" width="44" height="8" rx="3" fill="#78350f"/><rect x="8" y="28" width="22" height="10" rx="3" fill="#92400e"/><path d="M38,10 Q46,32 38,54" fill="none" stroke="#64748b" stroke-width="5" stroke-linecap="round"/><line x1="38" y1="11" x2="8" y2="33" stroke="#e2e8f0" stroke-width="1.2"/><line x1="38" y1="53" x2="8" y2="33" stroke="#e2e8f0" stroke-width="1.2"/><line x1="8" y1="33" x2="38" y2="33" stroke="#94a3b8" stroke-width="2"/><polygon points="38,33 44,31 44,35" fill="#94a3b8"/><rect x="22" y="37" width="6" height="8" rx="1" fill="#64748b"/><rect x="44" y="26" width="6" height="4" rx="1" fill="#64748b"/>`
    ) },
    { name: 'Flail', description: 'Spiked ball on a chain. Unpredictable and brutal.', svg: weaponSvg(
      `<rect x="8" y="8" width="4" height="20" rx="2" transform="rotate(30 10 18)" fill="#78350f"/><path d="M20,22 Q28,28 32,36 Q34,42 38,46" fill="none" stroke="#64748b" stroke-width="2.5" stroke-dasharray="3,2.5" stroke-linecap="round"/><circle cx="43" cy="49" r="10" fill="#94a3b8"/><circle cx="40" cy="46" r="4" fill="#cbd5e1" opacity="0.15"/><polygon points="43,36 41.5,41 44.5,41" fill="#475569"/><polygon points="43,62 41.5,57 44.5,57" fill="#475569"/><polygon points="30,49 35,47.5 35,50.5" fill="#475569"/><polygon points="56,49 51,47.5 51,50.5" fill="#475569"/><polygon points="34.8,40.8 37.8,43.8 36.3,45.3" fill="#475569"/><polygon points="51.2,57.2 48.2,54.2 49.7,52.7" fill="#475569"/><polygon points="34.8,57.2 37.8,54.2 36.3,52.7" fill="#475569"/><polygon points="51.2,40.8 48.2,43.8 49.7,45.3" fill="#475569"/>`
    ) },
    { name: 'Halberd', description: 'Axe, spear and hook in one polearm. Feared by cavalry.', svg: weaponSvg(rot45(
      `<rect x="31" y="6" width="2" height="54" rx="1" fill="#78350f"/><polygon points="32,4 29,16 35,16" fill="#94a3b8"/><polygon points="32,4 32,15 35,16" fill="#cbd5e1" opacity="0.4"/><path d="M32,16 L16,22 Q9,28 11,35 L32,35 Z" fill="#94a3b8"/><path d="M32,16 L18,22 Q12,27 14,32 L32,32" fill="#cbd5e1" opacity="0.25"/><path d="M32,22 C44,20 46,28 40,31" fill="none" stroke="#64748b" stroke-width="3" stroke-linecap="round"/><polygon points="32,60 30.5,55 33.5,55" fill="#64748b"/>`
    )) },
    { name: 'Morning Star', description: 'Spiked iron ball on a sturdy shaft. Pain in every direction.', svg: weaponSvg(rot45(
      `<rect x="30.5" y="35" width="3" height="25" rx="1.5" fill="#78350f"/><rect x="28" y="31" width="8" height="6" rx="2" fill="#64748b"/><circle cx="32" cy="21" r="12" fill="#94a3b8"/><circle cx="29" cy="18" r="4" fill="#cbd5e1" opacity="0.15"/><polygon points="32,6 30.5,11 33.5,11" fill="#475569"/><polygon points="32,36 30.5,31 33.5,31" fill="#475569"/><polygon points="17,21 22,19.5 22,22.5" fill="#475569"/><polygon points="47,21 42,19.5 42,22.5" fill="#475569"/><polygon points="21.4,11.4 24.6,14.6 23.1,16.1" fill="#475569"/><polygon points="42.6,30.6 39.4,27.4 40.9,25.9" fill="#475569"/><polygon points="21.4,30.6 24.6,27.4 23.1,25.9" fill="#475569"/><polygon points="42.6,11.4 39.4,14.6 40.9,16.1" fill="#475569"/>`
    )) },
    { name: 'Pistol', description: 'Standard semi-automatic handgun. Easy to carry, easy to use.', svg: weaponSvg(
      `<rect x="6" y="24" width="34" height="6" rx="2" fill="#374151"/><rect x="16" y="21" width="22" height="12" rx="2" fill="#4b5563"/><rect x="24" y="21" width="10" height="3" rx="1" fill="#1f2937"/><rect x="10" y="20" width="3" height="3" rx="0.5" fill="#94a3b8"/><rect x="34" y="20" width="4" height="2" rx="0.5" fill="#94a3b8"/><rect x="20" y="30" width="18" height="10" rx="2" fill="#4b5563"/><path d="M22,32 Q20,40 24,42 L30,42" fill="none" stroke="#374151" stroke-width="2.5"/><rect x="23" y="33" width="2" height="5" rx="1" fill="#94a3b8"/><rect x="20" y="38" width="14" height="16" rx="3" fill="#374151"/><rect x="22" y="40" width="10" height="12" rx="1" fill="#1f2937" opacity="0.4"/><rect x="21" y="52" width="12" height="3" rx="1" fill="#6b7280"/><circle cx="6" cy="27" r="2.5" fill="#1f2937"/>`
    ) },
    { name: 'Assault Rifle', description: 'Selective-fire rifle. Effective at most ranges.', svg: weaponSvg(
      `<path d="M50,26 L62,24 L62,38 L50,40 Z" fill="#374151"/><rect x="18" y="22" width="34" height="14" rx="2" fill="#4b5563"/><rect x="4" y="25" width="18" height="10" rx="2" fill="#374151"/><rect x="2" y="27" width="6" height="5" rx="1" fill="#374151"/><rect x="36" y="20" width="12" height="3" rx="1" fill="#374151"/><rect x="40" y="34" width="8" height="14" rx="3" fill="#374151"/><rect x="28" y="36" width="10" height="16" rx="2" fill="#374151"/><path d="M34,36 Q32,43 36,45 L40,45" fill="none" stroke="#4b5563" stroke-width="1.5"/><rect x="46" y="21" width="4" height="3" rx="1" fill="#94a3b8"/><rect x="2" y="27" width="4" height="5" rx="0.5" fill="#1f2937"/>`
    ) },
    { name: 'Shotgun', description: 'Pump-action spread shot. Devastating at close range.', svg: weaponSvg(
      `<path d="M50,27 L62,25 L62,41 L50,43 Z" fill="#78350f"/><rect x="28" y="25" width="24" height="16" rx="3" fill="#374151"/><rect x="4" y="26" width="28" height="5" rx="2" fill="#4b5563"/><rect x="4" y="31" width="28" height="4" rx="2" fill="#374151"/><rect x="8" y="25" width="14" height="14" rx="2" fill="#92400e"/><rect x="40" y="39" width="10" height="14" rx="3" fill="#78350f"/><path d="M36,39 Q34,47 38,49 L42,49" fill="none" stroke="#4b5563" stroke-width="1.5"/><rect x="2" y="26.5" width="4" height="4" rx="0.5" fill="#1f2937"/><rect x="2" y="31" width="4" height="3.5" rx="0.5" fill="#1f2937"/><rect x="38" y="25" width="10" height="4" rx="1" fill="#1f2937"/>`
    ) },
    { name: 'Sniper Rifle', description: 'Long-range precision rifle with scope and bipod.', svg: weaponSvg(
      `<path d="M52,26 L62,24 L62,40 L52,42 Z" fill="#78350f"/><path d="M52,26 L62,24 L62,30 L52,32 Z" fill="#92400e"/><rect x="28" y="24" width="26" height="16" rx="2" fill="#374151"/><rect x="2" y="28" width="30" height="5" rx="2" fill="#4b5563"/><rect x="30" y="16" width="20" height="9" rx="4" fill="#1f2937"/><rect x="32" y="18" width="16" height="5" rx="3" fill="#374151"/><circle cx="40" cy="20.5" r="2" fill="#1f2937"/><rect x="30" y="23" width="4" height="5" rx="1" fill="#4b5563"/><rect x="46" y="23" width="4" height="5" rx="1" fill="#4b5563"/><line x1="12" y1="33" x2="8" y2="48" stroke="#374151" stroke-width="2" stroke-linecap="round"/><line x1="18" y1="33" x2="22" y2="48" stroke="#374151" stroke-width="2" stroke-linecap="round"/><rect x="40" y="38" width="8" height="14" rx="3" fill="#78350f"/><rect x="30" y="40" width="10" height="10" rx="2" fill="#374151"/><rect x="2" y="27" width="5" height="7" rx="1" fill="#374151"/>`
    ) },
    { name: 'Submachine Gun', description: 'Compact automatic weapon. High rate of fire in tight spaces.', svg: weaponSvg(
      `<path d="M50,26 L60,26 L60,38 L50,40 Z" fill="#374151"/><rect x="12" y="22" width="40" height="18" rx="3" fill="#4b5563"/><rect x="2" y="26" width="14" height="6" rx="2" fill="#374151"/><rect x="26" y="40" width="10" height="16" rx="2" fill="#374151"/><rect x="38" y="38" width="10" height="16" rx="3" fill="#374151"/><path d="M34,40 Q32,46 36,48 L40,48" fill="none" stroke="#4b5563" stroke-width="1.5"/><rect x="46" y="21" width="4" height="3" rx="1" fill="#94a3b8"/><rect x="2" y="26" width="4" height="6" rx="0.5" fill="#1f2937"/><rect x="10" y="21" width="2" height="3" rx="0.5" fill="#94a3b8"/>`
    ) },
    { name: 'Frag Grenade', description: 'Pull the pin, throw, and find cover. Fast.', svg: weaponSvg(
      `<ellipse cx="32" cy="40" rx="14" ry="16" fill="#4d7c4d"/><line x1="32" y1="25" x2="32" y2="55" stroke="#2d4d2d" stroke-width="1.2" opacity="0.7"/><line x1="18" y1="33" x2="46" y2="33" stroke="#2d4d2d" stroke-width="1.2" opacity="0.7"/><line x1="18" y1="40" x2="46" y2="40" stroke="#2d4d2d" stroke-width="1.2" opacity="0.7"/><line x1="18" y1="47" x2="46" y2="47" stroke="#2d4d2d" stroke-width="1.2" opacity="0.7"/><path d="M19.5,28 Q18,34 18,40 Q18,46 19.5,52" stroke="#2d4d2d" stroke-width="1.2" fill="none" opacity="0.7"/><path d="M44.5,28 Q46,34 46,40 Q46,46 44.5,52" stroke="#2d4d2d" stroke-width="1.2" fill="none" opacity="0.7"/><rect x="26" y="20" width="12" height="7" rx="2" fill="#374151"/><rect x="22" y="16" width="20" height="6" rx="1" fill="#374151"/><circle cx="42" cy="19" r="3.5" fill="none" stroke="#94a3b8" stroke-width="2"/><line x1="42" y1="15.5" x2="42" y2="10" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/><path d="M32,10 Q36,6 37,3" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round"/><circle cx="37" cy="3" r="2" fill="#fbbf24"/>`
    ) },
    { name: 'Combat Knife', description: 'Military-grade blade with serrated spine. Silent and lethal.', svg: weaponSvg(rot45(
      `<polygon points="32,6 29,33 35,30" fill="#94a3b8"/><polygon points="32,6 32,30 35,30" fill="#cbd5e1" opacity="0.4"/><path d="M29,18 L27,22 L29,22 L27,26 L29,26 L27,30" fill="none" stroke="#64748b" stroke-width="1.2"/><rect x="22" y="31" width="20" height="5" rx="2" fill="#1f2937"/><rect x="27" y="36" width="10" height="18" rx="3" fill="#1e293b"/><line x1="27" y1="40" x2="37" y2="40" stroke="#374151" stroke-width="1.5"/><line x1="27" y1="45" x2="37" y2="45" stroke="#374151" stroke-width="1.5"/><line x1="27" y1="50" x2="37" y2="50" stroke="#374151" stroke-width="1.5"/><rect x="26" y="54" width="12" height="5" rx="2.5" fill="#374151"/>`
    )) },
    { name: 'Rocket Launcher', description: 'Shoulder-fired anti-armour weapon. One shot, one crater.', svg: weaponSvg(
      `<rect x="8" y="24" width="50" height="14" rx="7" fill="#4b5563"/><rect x="22" y="24" width="3" height="14" rx="1" fill="#374151"/><rect x="40" y="24" width="3" height="14" rx="1" fill="#374151"/><ellipse cx="58" cy="31" rx="5" ry="8" fill="#374151"/><polygon points="8,28 2,31 8,34" fill="#ef4444"/><rect x="5" y="28" width="5" height="6" rx="1" fill="#dc2626"/><rect x="28" y="16" width="10" height="9" rx="2" fill="#1f2937"/><circle cx="33" cy="20.5" r="2.5" fill="#374151"/><rect x="22" y="36" width="8" height="16" rx="3" fill="#374151"/><rect x="36" y="36" width="8" height="12" rx="3" fill="#374151"/><path d="M24,38 Q22,45 26,47" fill="none" stroke="#4b5563" stroke-width="1.5"/>`
    ) },
    { name: 'Revolver', description: 'Six-shot wheelgun. Slow, loud, and very convincing.', svg: weaponSvg(
      `<rect x="8" y="22" width="30" height="7" rx="2.5" fill="#374151"/><rect x="20" y="18" width="22" height="14" rx="2" fill="#4b5563"/><circle cx="34" cy="27" r="9" fill="#374151"/><circle cx="34" cy="19" r="2.2" fill="#1f2937"/><circle cx="40.8" cy="22.5" r="2.2" fill="#1f2937"/><circle cx="40.8" cy="31.5" r="2.2" fill="#1f2937"/><circle cx="34" cy="35" r="2.2" fill="#1f2937"/><circle cx="27.2" cy="31.5" r="2.2" fill="#1f2937"/><circle cx="27.2" cy="22.5" r="2.2" fill="#1f2937"/><rect x="22" y="30" width="18" height="10" rx="2" fill="#4b5563"/><path d="M24,38 Q22,46 26,48 L32,48" fill="none" stroke="#374151" stroke-width="2.5"/><rect x="26" y="38" width="2.5" height="5" rx="1" fill="#94a3b8"/><path d="M22,38 L18,52 Q18,56 22,56 L32,56 L32,38 Z" fill="#1e293b"/><rect x="40" y="18" width="4" height="9" rx="1" fill="#374151"/><circle cx="8" cy="25.5" r="2.5" fill="#1f2937"/><rect x="36" y="17" width="4" height="2" rx="0.5" fill="#94a3b8"/>`
    ) },
    { name: 'Dynamite', description: 'Three sticks of explosive joy. Light fuse, retreat immediately.', svg: weaponSvg(
      `<rect x="16" y="22" width="9" height="28" rx="4" fill="#b91c1c"/><rect x="39" y="22" width="9" height="28" rx="4" fill="#b91c1c"/><rect x="27" y="20" width="10" height="30" rx="5" fill="#dc2626"/><rect x="28" y="28" width="8" height="10" rx="1" fill="#fef3c7" opacity="0.85"/><rect x="15" y="32" width="34" height="5" rx="2" fill="#d97706"/><path d="M32,20 Q38,14 36,8 Q34,4 38,2" fill="none" stroke="#d97706" stroke-width="2.5" stroke-linecap="round"/><circle cx="38" cy="2" r="3" fill="#fbbf24" opacity="0.9"/><line x1="16" y1="30" x2="25" y2="30" stroke="#7f1d1d" stroke-width="1" opacity="0.5"/><line x1="16" y1="36" x2="25" y2="36" stroke="#7f1d1d" stroke-width="1" opacity="0.5"/><line x1="39" y1="30" x2="48" y2="30" stroke="#7f1d1d" stroke-width="1" opacity="0.5"/><line x1="39" y1="36" x2="48" y2="36" stroke="#7f1d1d" stroke-width="1" opacity="0.5"/>`
    ) },
    { name: 'Box of Shotgun Shells', type: 'consumable', description: 'Three shells ready to load. Standard buckshot.', svg: weaponSvg(
      `<rect x="12" y="38" width="40" height="20" rx="2" fill="#92400e"/><rect x="14" y="40" width="36" height="16" rx="1" fill="#b45309" opacity="0.4"/><rect x="18" y="16" width="8" height="26" rx="2" fill="#dc2626"/><rect x="18" y="36" width="8" height="4" fill="#d97706"/><circle cx="22" cy="16" r="3.5" fill="#fbbf24"/><rect x="28" y="16" width="8" height="26" rx="2" fill="#dc2626"/><rect x="28" y="36" width="8" height="4" fill="#d97706"/><circle cx="32" cy="16" r="3.5" fill="#fbbf24"/><rect x="38" y="16" width="8" height="26" rx="2" fill="#dc2626"/><rect x="38" y="36" width="8" height="4" fill="#d97706"/><circle cx="42" cy="16" r="3.5" fill="#fbbf24"/>`
    ) },
    { name: 'Box of Bullets', type: 'consumable', description: 'A box of standard rounds. Keep them dry.', svg: weaponSvg(
      `<rect x="12" y="36" width="40" height="22" rx="2" fill="#374151"/><rect x="14" y="38" width="36" height="18" rx="1" fill="#4b5563" opacity="0.5"/><rect x="14" y="52" width="36" height="2" fill="#1f2937" opacity="0.6"/><polygon points="20,36 17,28 23,28" fill="#d97706"/><rect x="17" y="28" width="6" height="8" fill="#b45309"/><polygon points="28,36 25,28 31,28" fill="#d97706"/><rect x="25" y="28" width="6" height="8" fill="#b45309"/><polygon points="36,36 33,28 39,28" fill="#d97706"/><rect x="33" y="28" width="6" height="8" fill="#b45309"/><polygon points="44,36 41,28 47,28" fill="#d97706"/><rect x="41" y="28" width="6" height="8" fill="#b45309"/>`
    ) },
    { name: 'String', type: 'tool', description: 'A coil of sturdy twine. Useful for almost anything.', svg: weaponSvg(
      `<circle cx="32" cy="32" r="20" fill="#d97706" opacity="0.15"/><circle cx="32" cy="32" r="16" fill="none" stroke="#92400e" stroke-width="4"/><circle cx="32" cy="32" r="10" fill="none" stroke="#b45309" stroke-width="3"/><circle cx="32" cy="32" r="5" fill="none" stroke="#92400e" stroke-width="2"/><circle cx="32" cy="32" r="2" fill="#92400e"/><path d="M32,12 Q40,8 46,12 Q50,16 48,20" fill="none" stroke="#92400e" stroke-width="2" stroke-linecap="round"/>`
    ) },
    { name: 'Key', type: 'tool', description: 'A heavy iron key. Unlocks something important.', svg: weaponSvg(
      `<circle cx="18" cy="30" r="14" fill="none" stroke="#94a3b8" stroke-width="5"/><circle cx="18" cy="30" r="7" fill="#1e293b"/><rect x="30" y="28" width="28" height="5" rx="1" fill="#94a3b8"/><rect x="42" y="33" width="5" height="7" rx="1" fill="#94a3b8"/><rect x="51" y="33" width="5" height="5" rx="1" fill="#94a3b8"/>`
    ) },
    { name: 'Box of Matches', type: 'tool', description: 'A half-used box of safety matches.', svg: weaponSvg(
      `<rect x="14" y="32" width="36" height="24" rx="2" fill="#92400e"/><rect x="16" y="34" width="32" height="20" rx="1" fill="#b45309" opacity="0.5"/><rect x="14" y="38" width="36" height="3" fill="#78350f" opacity="0.5"/><line x1="24" y1="32" x2="20" y2="12" stroke="#d97706" stroke-width="2.5" stroke-linecap="round"/><circle cx="20" cy="11" r="4" fill="#dc2626"/><line x1="32" y1="32" x2="32" y2="10" stroke="#d97706" stroke-width="2.5" stroke-linecap="round"/><circle cx="32" cy="9" r="4" fill="#dc2626"/><line x1="40" y1="32" x2="44" y2="12" stroke="#d97706" stroke-width="2.5" stroke-linecap="round"/><circle cx="44" cy="11" r="4" fill="#dc2626"/>`
    ) },
    { name: 'Marker Pen', type: 'tool', description: 'A thick permanent marker. Writes on anything.', svg: weaponSvg(
      `<rect x="44" y="26" width="16" height="12" rx="4" fill="#374151"/><rect x="44" y="28" width="16" height="5" rx="3" fill="#4b5563" opacity="0.5"/><rect x="6" y="24" width="40" height="16" rx="4" fill="#2563eb"/><rect x="6" y="25" width="40" height="6" rx="3" fill="#3b82f6" opacity="0.4"/><polygon points="6,24 6,40 2,32" fill="#1e3a8a"/><rect x="54" y="22" width="3" height="20" rx="1.5" fill="#1f2937"/>`
    ) },
    { name: 'Blacksmith Tongs', type: 'tool', description: 'Heavy iron tongs for handling hot metal.', svg: weaponSvg(
      `<path d="M26,8 L30,38" stroke="#94a3b8" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M38,8 L34,38" stroke="#94a3b8" stroke-width="5" stroke-linecap="round" fill="none"/><circle cx="32" cy="28" r="4" fill="#64748b"/><path d="M30,38 Q26,46 28,52 L32,52" stroke="#94a3b8" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M34,38 Q38,46 36,52 L32,52" stroke="#94a3b8" stroke-width="4" stroke-linecap="round" fill="none"/><rect x="23" y="6" width="6" height="4" rx="2" fill="#64748b"/><rect x="35" y="6" width="6" height="4" rx="2" fill="#64748b"/>`
    ) },
    { name: 'Sawn-off Shotgun', type: 'weapon', description: 'Illegally shortened shotgun. Extremely intimidating.', svg: weaponSvg(
      `<rect x="6" y="22" width="26" height="7" rx="2" fill="#4b5563"/><rect x="6" y="29" width="26" height="7" rx="2" fill="#374151"/><circle cx="6" cy="25.5" r="2.5" fill="#1f2937"/><circle cx="6" cy="32.5" r="2.5" fill="#1f2937"/><rect x="28" y="20" width="20" height="20" rx="3" fill="#374151"/><rect x="30" y="22" width="16" height="8" rx="2" fill="#4b5563" opacity="0.5"/><path d="M42,40 L38,58 Q36,62 40,62 L46,62 Q50,62 48,58 L44,40 Z" fill="#78350f"/><path d="M32,40 Q30,50 34,54" fill="none" stroke="#374151" stroke-width="2"/><rect x="32" y="40" width="3" height="7" rx="1" fill="#94a3b8"/>`
    ) },
    { name: 'Machine Gun', type: 'weapon', description: 'Belt-fed automatic weapon. Suppression guaranteed.', svg: weaponSvg(
      `<rect x="6" y="22" width="34" height="14" rx="3" fill="#374151"/><rect x="6" y="22" width="34" height="7" rx="3" fill="#4b5563"/><rect x="38" y="25" width="22" height="7" rx="2" fill="#4b5563"/><rect x="40" y="27" width="2" height="3" fill="#374151"/><rect x="45" y="27" width="2" height="3" fill="#374151"/><rect x="50" y="27" width="2" height="3" fill="#374151"/><rect x="55" y="27" width="2" height="3" fill="#374151"/><rect x="58" y="23" width="4" height="11" rx="1" fill="#6b7280"/><rect x="6" y="36" width="18" height="12" rx="2" fill="#374151"/><rect x="8" y="38" width="14" height="8" rx="1" fill="#4b5563" opacity="0.4"/><path d="M22,36 Q24,32 26,36 Q28,40 30,36 Q32,32 34,36" fill="none" stroke="#d97706" stroke-width="2.5" stroke-linecap="round"/><rect x="28" y="36" width="7" height="16" rx="3" fill="#78350f"/><rect x="12" y="18" width="16" height="5" rx="2" fill="#374151"/><line x1="46" y1="32" x2="42" y2="52" stroke="#374151" stroke-width="3" stroke-linecap="round"/><line x1="52" y1="32" x2="56" y2="52" stroke="#374151" stroke-width="3" stroke-linecap="round"/>`
    ) },
    { name: 'Chainsaw', type: 'weapon', description: 'A roaring engine attached to a chain of teeth. Do not trip.', svg: weaponSvg(
      `<rect x="4" y="18" width="26" height="24" rx="4" fill="#374151"/><rect x="6" y="20" width="22" height="20" rx="3" fill="#4b5563"/><circle cx="17" cy="30" r="8" fill="#1f2937"/><circle cx="17" cy="30" r="5" fill="#374151"/><circle cx="17" cy="30" r="2" fill="#4b5563"/><rect x="28" y="26" width="32" height="10" rx="3" fill="#6b7280"/><ellipse cx="60" cy="31" rx="4" ry="5" fill="#6b7280"/><rect x="30" y="25" width="3" height="3" rx="0.5" fill="#94a3b8"/><rect x="37" y="25" width="3" height="3" rx="0.5" fill="#94a3b8"/><rect x="44" y="25" width="3" height="3" rx="0.5" fill="#94a3b8"/><rect x="51" y="25" width="3" height="3" rx="0.5" fill="#94a3b8"/><rect x="30" y="34" width="3" height="3" rx="0.5" fill="#94a3b8"/><rect x="37" y="34" width="3" height="3" rx="0.5" fill="#94a3b8"/><rect x="44" y="34" width="3" height="3" rx="0.5" fill="#94a3b8"/><rect x="51" y="34" width="3" height="3" rx="0.5" fill="#94a3b8"/><rect x="6" y="12" width="18" height="8" rx="3" fill="#78350f"/><rect x="22" y="38" width="8" height="14" rx="3" fill="#78350f"/><rect x="24" y="42" width="4" height="6" rx="1" fill="#1f2937"/>`
    ) },
    { name: 'Axe', type: 'weapon', description: 'A sturdy hand axe. Reliable for chopping and combat.', svg: weaponSvg(rot45(
      `<rect x="31" y="16" width="2" height="44" rx="1" fill="#78350f"/><polygon points="32,18 20,22 20,36 32,40" fill="#94a3b8"/><polygon points="32,18 22,23 22,34 32,38" fill="#cbd5e1" opacity="0.3"/><rect x="29.5" y="57" width="5" height="4" rx="2" fill="#64748b"/>`
    )) },
    { name: 'Baseball Bat', type: 'weapon', description: 'A solid wooden bat. Widely available, highly effective.', svg: weaponSvg(
      `<circle cx="8" cy="32" r="5" fill="#78350f"/><rect x="8" y="29" width="16" height="6" rx="1" fill="#92400e"/><rect x="8" y="30" width="14" height="4" fill="#1f2937" opacity="0.6"/><polygon points="24,27 24,37 50,36 50,28" fill="#92400e"/><ellipse cx="50" cy="32" rx="6" ry="8" fill="#b45309"/><path d="M12,32 Q32,30 48,32" fill="none" stroke="#78350f" stroke-width="1" opacity="0.5"/>`
    ) },
    { name: 'Crowbar', type: 'weapon', description: 'A steel pry bar. Opens doors, crates, and skulls.', svg: weaponSvg(
      `<line x1="14" y1="52" x2="54" y2="16" stroke="#374151" stroke-width="7" stroke-linecap="round"/><path d="M14,52 Q8,58 10,62" fill="none" stroke="#374151" stroke-width="7" stroke-linecap="round"/><path d="M54,16 Q62,10 60,4" fill="none" stroke="#374151" stroke-width="6" stroke-linecap="round"/><line x1="6" y1="60" x2="14" y2="56" stroke="#4b5563" stroke-width="3" stroke-linecap="round"/>`
    ) },
    { name: 'Penknife', type: 'weapon', description: 'A compact folding blade. Fits in any pocket.', svg: weaponSvg(rot45(
      `<polygon points="32,10 29.5,30 34.5,28" fill="#94a3b8"/><polygon points="32,10 32,28 34.5,28" fill="#cbd5e1" opacity="0.4"/><rect x="27" y="28" width="10" height="4" rx="1" fill="#374151"/><rect x="26" y="32" width="12" height="18" rx="3" fill="#1e293b"/><rect x="27" y="33" width="5" height="16" rx="1" fill="#374151" opacity="0.5"/><rect x="26" y="49" width="12" height="4" rx="2" fill="#374151"/><circle cx="38" cy="51" r="1.5" fill="#94a3b8"/>`
    )) },
    { name: 'Med Kit', type: 'consumable', description: 'A full first aid kit. Stops bleeding, stabilises wounds.', svg: weaponSvg(
      `<rect x="8" y="16" width="48" height="38" rx="4" fill="#f0fdf4"/><rect x="8" y="16" width="48" height="38" rx="4" fill="none" stroke="#16a34a" stroke-width="2"/><rect x="26" y="22" width="12" height="26" rx="2" fill="#dc2626"/><rect x="16" y="29" width="32" height="12" rx="2" fill="#dc2626"/><rect x="20" y="12" width="8" height="5" rx="2" fill="#94a3b8"/><rect x="36" y="12" width="8" height="5" rx="2" fill="#94a3b8"/>`
    ) },
    { name: 'Grenade', type: 'weapon', description: 'Smooth-bodied defensive grenade. Handle the pin with care.', svg: weaponSvg(
      `<ellipse cx="32" cy="38" rx="15" ry="18" fill="#374151"/><ellipse cx="26" cy="32" rx="5" ry="7" fill="#4b5563" opacity="0.4"/><rect x="26" y="18" width="12" height="7" rx="2" fill="#4b5563"/><rect x="24" y="14" width="16" height="5" rx="1" fill="#374151"/><rect x="40" y="13" width="3" height="14" rx="1" fill="#6b7280"/><circle cx="46" cy="16" r="4" fill="none" stroke="#94a3b8" stroke-width="2"/><line x1="46" y1="12" x2="44" y2="8" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>`
    ) },
    { name: 'Small Med Kit', type: 'consumable', description: 'A compact first aid pouch. Better than nothing.', svg: weaponSvg(
      `<rect x="14" y="20" width="36" height="28" rx="4" fill="#f0fdf4"/><rect x="14" y="20" width="36" height="28" rx="4" fill="none" stroke="#16a34a" stroke-width="2"/><rect x="26" y="26" width="12" height="16" rx="2" fill="#dc2626"/><rect x="20" y="31" width="24" height="6" rx="2" fill="#dc2626"/><rect x="22" y="48" width="20" height="5" rx="2" fill="#94a3b8"/><rect x="29" y="46" width="6" height="4" rx="1" fill="#6b7280"/>`
    ) },
    { name: 'Scientist Lab Coat', type: 'armor', description: 'White coat, many pockets, questionable stains.', svg: weaponSvg(
      `<rect x="12" y="8" width="40" height="50" rx="3" fill="#f1f5f9"/><rect x="12" y="8" width="40" height="50" rx="3" fill="none" stroke="#cbd5e1" stroke-width="1.5"/><polygon points="32,8 12,8 12,22 32,28" fill="#e2e8f0"/><polygon points="32,8 52,8 52,22 32,28" fill="#e2e8f0"/><path d="M12,8 L32,28" fill="none" stroke="#cbd5e1" stroke-width="1.5"/><path d="M52,8 L32,28" fill="none" stroke="#cbd5e1" stroke-width="1.5"/><line x1="32" y1="28" x2="32" y2="58" stroke="#cbd5e1" stroke-width="1.5"/><circle cx="32" cy="34" r="2" fill="#94a3b8"/><circle cx="32" cy="42" r="2" fill="#94a3b8"/><circle cx="32" cy="50" r="2" fill="#94a3b8"/><rect x="15" y="24" width="10" height="8" rx="1" fill="none" stroke="#94a3b8" stroke-width="1.2"/><line x1="18" y1="24" x2="18" y2="19" stroke="#2563eb" stroke-width="1.5" stroke-linecap="round"/><circle cx="18" cy="18" r="2" fill="#1d4ed8"/>`
    ) },
    { name: 'Magnifying Glass', type: 'tool', description: 'A classic hand lens. What are you looking for?', svg: weaponSvg(
      `<line x1="46" y1="46" x2="58" y2="58" stroke="#78350f" stroke-width="6" stroke-linecap="round"/><circle cx="28" cy="28" r="18" fill="none" stroke="#94a3b8" stroke-width="5"/><circle cx="28" cy="28" r="14" fill="#bfdbfe" opacity="0.3"/><ellipse cx="22" cy="22" rx="4" ry="5" fill="#e0f2fe" opacity="0.5"/><rect x="44" y="42" width="5" height="5" rx="2" fill="#6b7280"/>`
    ) },
    { name: 'Hairbrush', type: 'tool', description: 'Not as useless as you might think.', svg: weaponSvg(
      `<rect x="42" y="27" width="18" height="10" rx="5" fill="#b45309"/><rect x="44" y="29" width="16" height="4" rx="2" fill="#d97706" opacity="0.4"/><ellipse cx="30" cy="32" rx="16" ry="12" fill="#92400e"/><ellipse cx="30" cy="32" rx="14" ry="10" fill="#b45309" opacity="0.5"/><circle cx="20" cy="28" r="1.5" fill="#1f2937"/><circle cx="26" cy="26" r="1.5" fill="#1f2937"/><circle cx="32" cy="26" r="1.5" fill="#1f2937"/><circle cx="38" cy="28" r="1.5" fill="#1f2937"/><circle cx="20" cy="32" r="1.5" fill="#1f2937"/><circle cx="26" cy="32" r="1.5" fill="#1f2937"/><circle cx="32" cy="32" r="1.5" fill="#1f2937"/><circle cx="38" cy="32" r="1.5" fill="#1f2937"/><circle cx="20" cy="36" r="1.5" fill="#1f2937"/><circle cx="26" cy="38" r="1.5" fill="#1f2937"/><circle cx="32" cy="38" r="1.5" fill="#1f2937"/><circle cx="38" cy="36" r="1.5" fill="#1f2937"/>`
    ) },
    { name: 'Empty Purse', type: 'tool', description: 'No coins. No cards. Just memories.', svg: weaponSvg(
      `<path d="M14,34 Q14,24 32,24 Q50,24 50,34 L50,52 Q50,58 32,58 Q14,58 14,52 Z" fill="#4b5563"/><path d="M16,34 Q16,26 32,26 Q48,26 48,34 L48,50 Q48,56 32,56 Q16,56 16,50 Z" fill="#6b7280" opacity="0.3"/><path d="M18,34 Q18,26 32,26 Q46,26 46,34" fill="none" stroke="#94a3b8" stroke-width="3"/><circle cx="32" cy="28" r="5" fill="#94a3b8"/><circle cx="32" cy="28" r="3" fill="#6b7280"/><path d="M20,24 Q32,14 44,24" fill="none" stroke="#374151" stroke-width="4" stroke-linecap="round"/>`
    ) },
    { name: 'Diary', type: 'tool', description: "Someone's personal journal. Perhaps yours.", svg: weaponSvg(
      `<rect x="12" y="8" width="8" height="48" rx="2" fill="#92400e"/><rect x="18" y="8" width="34" height="48" rx="2" fill="#1d4ed8"/><rect x="20" y="8" width="32" height="48" rx="2" fill="#2563eb"/><rect x="48" y="10" width="4" height="44" rx="1" fill="#fef9c3"/><rect x="22" y="12" width="24" height="40" rx="1" fill="#eff6ff" opacity="0.15"/><line x1="26" y1="22" x2="42" y2="22" stroke="#93c5fd" stroke-width="1" opacity="0.6"/><line x1="26" y1="28" x2="42" y2="28" stroke="#93c5fd" stroke-width="1" opacity="0.6"/><line x1="26" y1="34" x2="42" y2="34" stroke="#93c5fd" stroke-width="1" opacity="0.6"/><line x1="26" y1="40" x2="42" y2="40" stroke="#93c5fd" stroke-width="1" opacity="0.6"/><line x1="34" y1="8" x2="34" y2="56" stroke="#1e40af" stroke-width="2.5"/><polygon points="46,56 50,56 50,62 48,60 46,62" fill="#dc2626"/>`
    ) },
  ];
  const ins = db.prepare('INSERT INTO items (name, type, svg_data, description) VALUES (?, ?, ?, ?)');
  for (const w of weapons) ins.run(w.name, w.type || 'weapon', w.svg, w.description || null);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS tips (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT    NOT NULL UNIQUE,
    type       TEXT    NOT NULL DEFAULT 'silly' CHECK(type IN ('real','silly')),
    active     INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS level_up_templates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    template   TEXT    NOT NULL UNIQUE,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS join_templates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    template   TEXT    NOT NULL UNIQUE,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS maintenance_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    message    TEXT    NOT NULL UNIQUE,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS taglines (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT    NOT NULL UNIQUE,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

if (db.prepare('SELECT COUNT(*) AS n FROM taglines').get().n === 0) {
  const taglines = [
    'Map every branch across all your playthroughs',
    'Every path charted. Every run remembered.',
    'Track every choice across every playthrough.',
    'Every branch mapped. Every death noted.',
    'Chart your way through every adventure.',
    'Your gamebook runs, mapped and remembered.',
    'Never lose your place in any gamebook.',
    'Map every choice. Track every death.',
    'Every section visited. Every path mapped.',
    'Track every branch across every book.',
    'Your runs, your map, your story.',
    'Every gamebook, fully explored.',
    'Chart every path through every book.',
    'Every branch. Every run. Every book.',
    'Every choice mapped. Every ending found.',
    'Track every path you\'ve ever taken.',
    'Map the branches. Find the endings.',
    'Every gamebook run, fully tracked.',
    'Map every section. Track every run.',
    'Follow every branch to its end.',
    'Track your progress through every book.',
    'Never forget a section again.',
    'Every path through every story, mapped.',
    'Map every branch. Win every book.',
    'Your gamebook journey, fully charted.',
    'Track every run. Map every section.',
    'Every path charted, every run saved.',
    'Every dead end mapped. Every win saved.',
    'Chart your runs. Find the hidden paths.',
    'Every section, every run, every book.',
    'Map the story. Track your progress.',
    'Your gamebook library, fully mapped.',
    'Explore every branch. Track every run.',
    'Map every gamebook you\'ve ever played.',
    'Every run tracked. Every branch mapped.',
    'Turn by turn. Path by path. All mapped.',
    'Map every choice. Miss nothing.',
    'Track your paths. Find the true ending.',
    'Every section charted. Every run saved.',
    'Map the branches. Track the runs.',
    'Follow every path to every ending.',
    'Map every branch. Never get lost again.',
    'Every path through every book, tracked.',
    'Chart every gamebook. Track every run.',
    'Map your paths. Track your victories.',
    'Every playthrough mapped. Every ending found.',
    'From section 1 to the end, fully mapped.',
    'Track the branches. Map the adventure.',
    'Every gamebook. Every run. Fully mapped.',
    'Your gamebook runs, tracked and mapped.',
    'Never lose track of where you\'ve been.',
    'Every choice, every path, every ending.',
    'Map the adventure. Remember every run.',
    'Your complete gamebook run history.',
    'Every branch explored. Every run saved.',
    'Track what you\'ve read. Map what\'s left.',
    'Map every path. Leave nothing uncharted.',
    'Every playthrough remembered.',
    'The last gamebook tracker you\'ll ever need.',
    'Every run. Every path. Every ending.',
    'Track every death. Find every victory.',
  ];
  const ins = db.prepare('INSERT OR IGNORE INTO taglines (text) VALUES (?)');
  for (const t of taglines) ins.run(t);
}

if (db.prepare('SELECT COUNT(*) AS n FROM join_templates').get().n === 0) {
  const joinTemplates = [
    'A new adventurer enters the fray - welcome, {name}.',
    'The story begins. {name} has opened the first page.',
    '{name} steps into the unknown. The adventure awaits.',
    'Turn to paragraph 1: {name} has arrived.',
    '{name} chose to play. The dice are cast.',
    'A new name is written in the book of adventurers: {name}.',
    '{name} has crossed the threshold. There is no going back.',
    'The map gains a new explorer - {name} joins the ranks.',
    '{name} picks up the book and begins to read...',
    'Somewhere, a door creaks open. {name} has entered.',
    '{name} is here. The pages rustle with anticipation.',
    'A tale begins anew. Welcome, {name}.',
    '{name} has arrived at the crossroads. Which path will they choose?',
    'Roll for initiative - {name} has joined the adventure.',
    'The torchlight flickers. {name} descends into the dungeon.',
    '{name} reads the first line and is hooked. The journey starts now.',
    'Another bold soul ventures forth - {name} is among us.',
    '{name} has found the hidden passage into this world.',
    'The stars align. {name} begins their quest.',
    '{name} answered the call. Let the adventure commence.',
    'The gate swings open. {name} steps through.',
    '{name} unfolds the map and studies the first path.',
    'A new chapter is written: {name} has arrived.',
    'Hark! {name} approaches. Stand ready.',
    '{name} has joined the fellowship of adventurers.',
    'The inn falls silent. {name} has just walked in.',
    '{name} draws their blade and faces the first page.',
    'The oracle foretold this moment. {name} is here.',
    'Smoke rises from the altar. {name} has entered the realm.',
    'The ledger of heroes gains a new entry: {name}.',
    '{name} clutches the lantern and steps into the dark.',
    'Fate has brought {name} to us. Welcome, traveller.',
    'A distant horn sounds - {name} has arrived at the gates.',
    'The pages turn on their own. {name} was expected.',
    '{name} signed the contract. The adventure is binding.',
    'Mark it well: {name} has chosen to begin.',
    'The world expands. {name} has taken the first step.',
    'Long was the road. {name} has finally arrived.',
    '{name} eyes the maze ahead and grins. The quest begins.',
    'A new set of footprints appears on the map - {name}.',
    'From the shadows, {name} emerges, ready to play.',
    'The door was unlocked all along. {name} finally tried the handle.',
    '{name} joins the ranks of those who dared to begin.',
    'The adventure log opens to a fresh page. Welcome, {name}.',
    '{name} has been chosen by the book. Or perhaps chose it.',
    'Something stirs in the depths. {name} has lit a torch.',
    'Somewhere, a narrator clears their throat. {name} has arrived.',
    'The first choice awaits. {name} stands at the fork in the road.',
    'No turning back now, {name}. The adventure has begun.',
    'The realm grows. {name} has stepped into the story.',
  ];
  const ins = db.prepare('INSERT OR IGNORE INTO join_templates (template) VALUES (?)');
  for (const t of joinTemplates) ins.run(t);
}

if (db.prepare('SELECT COUNT(*) AS n FROM maintenance_messages').get().n === 0) {
  const messages = [
    'Turn to section 503. The page is blank. You wait.',
    'The adventure is temporarily paused. The GM is consulting a very thick rulebook.',
    'You have reached a dead end. It is not a death - merely a detour. Return shortly.',
    'The dungeon is being rearranged. Please do not move the furniture.',
    'Your stamina holds. Your luck holds. The server, however, needed a moment.',
    'You rest at an inn. The proprietor says nothing. Time passes.',
    'The map has been rolled up for safekeeping. It will be unrolled shortly.',
    'A mysterious mist fills the corridor. You cannot proceed. You wait for it to clear.',
    'The oracle is unavailable. Try again after a short rest.',
    'You search the room. There is nothing here yet. Check back in a moment.',
    'The dice have been confiscated pending a recount. Normal service resumes shortly.',
    'You attempt to open the door. It is locked from the inside. Someone is clearly in there.',
    'The treasure chest is being restocked. Please do not pick the lock.',
    'The scribe is updating the records. The archive will reopen shortly.',
    'You encounter a notice pinned to the dungeon wall: Back in a moment - Management.',
    'The adventure continues on the other side of this door. The door is temporarily stuck.',
    'A sign reads: UNDER MAINTENANCE. Below it, in smaller writing: Yes, this happens even in dungeons.',
    'The realm is between saves. Your progress is safe. The realm is not going anywhere.',
    'You have stumbled into the one corridor with nothing in it. Remarkable timing.',
    'The wizards are arguing about something. You decide not to interrupt. You wait.',
    'A cryptic message appears: WE WILL RETURN. You have no reason to doubt it.',
    'The quest board is being updated. New adventures pending.',
  ];
  const ins = db.prepare('INSERT OR IGNORE INTO maintenance_messages (message) VALUES (?)');
  for (const m of messages) ins.run(m);
}

if (db.prepare('SELECT COUNT(*) AS n FROM level_up_templates').get().n === 0) {
  const templates = [
    '{name} the {title} has arisen at lvl {level}!',
    'Behold! {name} reaches lvl {level} - the {title} awakens!',
    'The realm trembles. {name} ascends to lvl {level}: {title}.',
    'Lvl {level} achieved. {name} has become the {title}.',
    '{name} strides forth as the {title} - lvl {level} and rising.',
    'A new {title} walks among us. {name}, lvl {level}.',
    '{name} has evolved. Lvl {level}. The {title} is unleashed.',
    'The {title} awakens. {name} has reached lvl {level}.',
    '{name} the {title} looms on the horizon - lvl {level} attained!',
    'Darkness trembles. {name} ascends: lvl {level}, the {title}.',
    '{name} has transcended - lvl {level}, now bearing the title of {title}.',
    'Against all odds, {name} has clawed their way to lvl {level}: the {title} emerges.',
    'The stars align. {name} the {title} rises to lvl {level}.',
    '{name} has been forged anew - lvl {level}, the {title}.',
    'It is done. {name}, lvl {level}: the {title} has awakened.',
  ];
  const ins = db.prepare('INSERT OR IGNORE INTO level_up_templates (template) VALUES (?)');
  for (const t of templates) ins.run(t);
}

// Seed tips if table is empty
if (db.prepare('SELECT COUNT(*) AS n FROM tips').get().n === 0) {
  const realTips = [
    'Click a book name in your list to open its public activity - see who else is tracking it.',
    'Right-click any node in the graph to mark it as a battle, set priority, or apply a colour.',
    'The trail panel shows your exact path through the current run - collapse it to free up graph space.',
    'Discovered but unvisited sections appear faded - follow them to fill in your map.',
    'Fast travel lets you jump to any previously visited section mid-run without breaking your path.',
    'Runs are private by default - share a single run publicly without exposing your others.',
    'Undo steps back in your current run; your graph keeps everything you\'ve already mapped.',
    'The character sheet records your starting stats - always visible for reference mid-run.',
    'Set Discoverable Sections on a book if you\'ve hit a dead end but the section count still shows unexplored.',
    'Anthologies group multiple stories under one cover - expand them to track each story individually.',
    'Assign a series and number to keep multi-volume books organised together in the list.',
    'Upload a cover and make a book public - others can find it and add it to their own library.',
    'Your first star rating on a book contributes to the community average shown to everyone.',
    'Making your profile public lets others see your completed runs and click through to the graph.',
    'You earn XP for almost everything - notes, covers, sharing runs, completing books.',
    'Gold Coins (1 GC per 1 000 XP) unlock extra undos, fast travels, or a permanent XP boost.',
    'Export your full library as a zip - all graph data, runs, and notes preserved.',
    'The covers wall on the left shows all public books - a good way to discover what others are playing.',
    'Priority flags on nodes help you plan which branches to revisit first on your next run.',
    'The Export button in your profile saves your entire library as a ZIP - graphs, runs, notes, everything. Back up before you experiment.',
  ];
  const sillyTips = [
    'If you die in section 400, you don\'t actually die in real life. Probably.',
    'Reading ahead is cheating. But it is.',
    'The dice don\'t care about your feelings.',
    'Section 14 is never good news. You know it. We know it.',
    'Your character sheet says Luck 7. The dice say otherwise.',
    'Some books have a winning path. Yours may not be one of them.',
    'Every death is just reconnaissance.',
    'The author knew exactly what they were doing when they put that trap there.',
    'Statistically, you have died more times than you have won. This is fine.',
    'No one has ever turned to section 1 voluntarily.',
    'If at first you don\'t succeed, blame the dice.',
    'Your graph is beautiful. Your survival rate is not.',
    'Fighting Fantasy was not designed to be fair. Surprise.',
    'The special item you needed was in the section you skipped two hours ago.',
    'Your Skill is 7. The cave troll\'s Skill is 11. Best of luck.',
    'Some paths loop back to section 1. That\'s not a bug, that\'s character development.',
    'The wizard who gave you that potion was definitely not trustworthy.',
    'You\'ve been to this section before. It didn\'t go well then either.',
    'Rolling snake eyes is not a metaphor. It just means you\'re dead.',
    'The treasure was in that room. You just didn\'t read the paragraph carefully enough.',
    'Your graph has 6 dead ends. 5 of them are you.',
    'The book said "turn to 278 if you trust him." You trusted him.',
    'Somewhere, the author is laughing.',
    'Death at section 3 is humbling but builds character.',
    'Your longest run ended at section 12. Growth.',
    'You\'ve been staring at the tips for way too long. Go and play a book!',
    'Your graph looks like a plate of spaghetti. This is correct.',
    'You have 47 nodes. 3 of them make sense.',
    'The graph is not wrong. The book is wrong.',
    'Zoom out far enough and your graph looks like modern art.',
    'Node overlap is a feature. The feature is chaos.',
    'Your graph has more dead ends than a hedge maze designed by a sadist.',
    'The graph remembers every bad decision you\'ve ever made. Every single one.',
    'The author gave you a sword in section 2 and took it away in section 3. No reason given.',
    'You needed the Blue Key. The author never mentioned a Blue Key. Curious.',
    'Section 199 sends you to section 200. Section 200 sends you back to 199. The author called this a puzzle.',
    'The author included 400 sections and a winning path that uses 11 of them.',
    'You were given a map. The map was wrong.',
    'The author playtested this exactly once, declared it fine, and went to lunch.',
    'The monster has Skill 12 and Stamina 20. The author had a bad day.',
    'You found the magic amulet! It does nothing. The author forgot about it.',
    'Three different sections send you to section 277. Section 277 kills you. The author thought this was funny.',
    'The dice are not broken. You are just unlucky.',
    'Rolling a 2 on two dice has a 1 in 36 chance. You\'ve done it four times today.',
    'The dice don\'t remember your last roll. Unfortunately, you do.',
    'Shaking the dice harder does not help. You will keep doing it anyway.',
    'You rolled a 12. The enemy also has 12 Skill. The dice will decide your fate with complete indifference.',
    'The dice are not cursed. Probably.',
    'You blew on the dice for luck. The dice did not care.',
    'Some people have good dice karma. You are building yours. Very slowly.',
    'A natural 2 is not a sign from the universe. It just feels like one.',
    'The dice giveth. The dice taketh away. Mostly they taketh away.',
    'You have rolled below a 7 six times in a row. The dice are working as intended.',
    'Switching dice mid-game doesn\'t help. But it feels good to blame the old ones.',
    'You trust the wizard. You always trust the wizard.',
    'Section 1 is always a fresh start. And a false promise.',
    'Your map is bigger than your survival rate suggests.',
    'The rules say you must fight. The rules were written by someone who wanted you to die.',
    'You have visited this section four times. It still doesn\'t end well.',
    'The final boss is optional. Surviving to reach him is not.',
    'Somewhere in this book there is a path that wins. It does not involve any of your choices so far.',
  ];
  const ins = db.prepare('INSERT OR IGNORE INTO tips (text, type) VALUES (?, ?)');
  const insertAll = db.transaction(() => {
    for (const t of realTips)  ins.run(t, 'real');
    for (const t of sillyTips) ins.run(t, 'silly');
  });
  insertAll();
}

function getTips() {
  const rows = db.prepare('SELECT text, type FROM tips WHERE active = 1').all();
  return { real: rows.filter(r => r.type === 'real').map(r => r.text), silly: rows.filter(r => r.type === 'silly').map(r => r.text) };
}

function getAllTipsAdmin() {
  return db.prepare('SELECT id, text, type, active, created_at FROM tips ORDER BY type, id').all();
}

function createTip(text, type) {
  try {
    const id = db.prepare('INSERT INTO tips (text, type) VALUES (?, ?)').run(text, type).lastInsertRowid;
    return { id, text, type, active: 1 };
  } catch (_) { return null; }
}

function updateTip(id, text, type, active) {
  const fields = [];
  const vals = [];
  if (text != null) { fields.push('text = ?'); vals.push(text.trim()); }
  if (type != null && ['real','silly'].includes(type)) { fields.push('type = ?'); vals.push(type); }
  if (active != null) { fields.push('active = ?'); vals.push(active ? 1 : 0); }
  if (!fields.length) return true;
  vals.push(id);
  return db.prepare(`UPDATE tips SET ${fields.join(', ')} WHERE id = ?`).run(...vals).changes > 0;
}

function deleteTip(id) {
  db.prepare('DELETE FROM tips WHERE id = ?').run(id);
}

function getAllLevelUpTemplatesAdmin() {
  return db.prepare('SELECT id, template, active, created_at FROM level_up_templates ORDER BY id').all();
}

function createLevelUpTemplate(template) {
  try {
    const id = db.prepare('INSERT INTO level_up_templates (template) VALUES (?)').run(template.trim()).lastInsertRowid;
    return { id, template: template.trim(), active: 1 };
  } catch (_) { return null; }
}

function updateLevelUpTemplate(id, template, active) {
  const fields = [], vals = [];
  if (template != null) { fields.push('template = ?'); vals.push(template.trim()); }
  if (active != null)   { fields.push('active = ?');   vals.push(active ? 1 : 0); }
  if (!fields.length) return true;
  vals.push(id);
  return db.prepare(`UPDATE level_up_templates SET ${fields.join(', ')} WHERE id = ?`).run(...vals).changes > 0;
}

function deleteLevelUpTemplate(id) {
  db.prepare('DELETE FROM level_up_templates WHERE id = ?').run(id);
}

// ── Items ─────────────────────────────────────────────────────────────────────

function getAllItemsAdmin() {
  return db.prepare('SELECT id, name, type, svg_data, description, active, created_at FROM items ORDER BY type, name').all();
}

function getActiveItems() {
  return db.prepare('SELECT id, name, type, svg_data, description FROM items WHERE active = 1 ORDER BY type, name').all();
}

function getActiveItemsMeta() {
  return db.prepare('SELECT id, name, type FROM items WHERE active = 1 ORDER BY name COLLATE NOCASE').all();
}

function getItemById(id) {
  return db.prepare('SELECT id, name, type, svg_data, description FROM items WHERE id = ? AND active = 1').get(id) || null;
}

function getItemsByIds(ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT id, name, type, svg_data, description FROM items WHERE id IN (${placeholders}) AND active = 1`).all(...ids);
}

function createItem(name, type, svgData, description) {
  try {
    const id = db.prepare('INSERT INTO items (name, type, svg_data, description) VALUES (?, ?, ?, ?)').run(name.trim(), type, svgData, description || null).lastInsertRowid;
    return { id, name: name.trim(), type, svg_data: svgData, description: description || null, active: 1 };
  } catch (_) { return null; }
}

function updateItem(id, { name, type, svg_data, description, active } = {}) {
  const sets = [], vals = [];
  if (name        != null) { sets.push('name = ?');        vals.push(name.trim()); }
  if (type        != null) { sets.push('type = ?');        vals.push(type); }
  if (svg_data    != null) { sets.push('svg_data = ?');    vals.push(svg_data); }
  if (description != null) { sets.push('description = ?'); vals.push(description); }
  if (active      != null) { sets.push('active = ?');      vals.push(active ? 1 : 0); }
  if (!sets.length) return true;
  vals.push(id);
  return db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).run(...vals).changes > 0;
}

function deleteItem(id) {
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
}

function getAllSeriesAdmin() {
  return db.prepare(`
    SELECT s.id, s.name, s.description, s.is_public, s.created_at,
           u.username AS created_by_username,
           COUNT(b.id) AS book_count
    FROM series s
    LEFT JOIN users u ON u.id = s.created_by
    LEFT JOIN books b ON b.series_id = s.id AND b.is_demo = 0
    GROUP BY s.id
  `).all().sort(_naturalCompareByName);
}

function getAllAnthologiesAdmin() {
  return db.prepare(`
    SELECT b.id, b.name, b.description, b.is_public, b.created_at,
           u.username AS created_by_username,
           COUNT(c.id) AS child_count
    FROM books b
    LEFT JOIN users u ON u.id = b.created_by
    LEFT JOIN books c ON c.parent_book_id = b.id AND c.is_demo = 0
    WHERE b.is_demo = 0 AND b.is_container = 1
    GROUP BY b.id
  `).all().sort(_naturalCompareByName);
}
function adminGetUser(userId) {
  const row = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.email, u.is_author, u.is_contributor, u.pdf_access, u.created_at, u.last_country, u.last_city,
           u.active_country, u.active_city, u.last_domain, u.failed_login_attempts, u.locked_until, u.is_protected,
           u.public_profile, u.hide_from_feed,
           COUNT(DISTINCT s.token) AS session_count
    FROM users u
    LEFT JOIN sessions s ON s.user_id = u.id
    WHERE u.id = ?
    GROUP BY u.id
  `).get(userId);
  if (!row) return null;
  return { ...row, ...getUserXpInfo(userId) };
}

function adminGetUserBooks(userId) {
  const rows = db.prepare(`
    SELECT b.id, b.name, b.total_sections, b.created_by, ub.created_at, ub.updated_at, ub.state_data
    FROM user_books ub JOIN books b ON b.id = ub.book_id
    WHERE ub.user_id = ? AND b.is_demo = 0
    ORDER BY ub.created_at ASC
  `).all(userId);
  return rows.map(b => {
    let mapped = 0, discovered = 0, playthroughs = 0, wins = 0, deaths = 0, battles = 0, last_run_at = null;
    try {
      const s = JSON.parse(b.state_data);
      mapped = Object.keys(s.graph || {}).filter(k => !s.graph[k]?.discovered).length;
      const seen = new Set(Object.keys(s.graph || {}).map(Number));
      for (const d of Object.values(s.graph || {}))
        for (const c of (d.choices || []))
          if (c !== -1 && c !== 0) seen.add(c);
      discovered   = seen.size;
      // Excludes untouched open-world series-run placeholders (startedAt: null) - a
      // book in a series carries one padding slot per series run so numbers line up
      // across books, but a slot the run never actually visited here isn't a real
      // playthrough of this book.
      const pts    = (s.playthroughs || []).filter(p => p.startedAt != null);
      playthroughs = pts.length;
      wins         = pts.filter(p => p.result === 'success').length;
      deaths       = pts.filter(p => p.result === 'death').length;
      battles      = pts.filter(p => p.result === 'battle').length;
      for (const pt of pts) {
        const ts = pt.completedAt || pt.lastActionAt || pt.startedAt || null;
        if (ts && (last_run_at === null || ts > last_run_at)) last_run_at = ts;
      }
    } catch {}
    return { id: b.id, name: b.name, total_sections: b.total_sections, created_by: b.created_by,
             created_at: b.created_at, updated_at: b.updated_at,
             mapped, discovered, playthroughs, wins, deaths, battles, last_run_at };
  });
}

function adminGetBookStats(bookId) {
  const book = db.prepare(
    `SELECT b.id, b.name, b.total_sections, b.isbn, b.issn, b.asin, b.pages, b.authors, b.description,
            b.is_public, b.cover_path, b.pdf_path, b.created_at, b.updated_at,
            b.series_id, b.series_number, b.is_container, b.parent_book_id, b.book_order,
            s.name AS series_name
     FROM books b LEFT JOIN series s ON s.id = b.series_id WHERE b.id = ?`
  ).get(bookId);
  if (!book) return null;

  const ubRows = db.prepare(`
    SELECT ub.state_data, u.id AS owner_id, u.username AS owner
    FROM user_books ub JOIN users u ON u.id = ub.user_id
    WHERE ub.book_id = ?
  `).all(bookId);

  let mapped = 0, discovered = 0, totalPts = 0, inProgress = 0, deaths = 0, victories = 0;
  let playthroughs = [];

  for (const ubRow of ubRows) {
    try {
      const s = JSON.parse(ubRow.state_data);
      const graphKeys = Object.keys(s.graph || {}).filter(k => !s.graph[k]?.discovered).length;
      if (graphKeys > mapped) {
        mapped = graphKeys;
        const seen = new Set(Object.keys(s.graph || {}).map(Number));
        for (const d of Object.values(s.graph || {}))
          for (const c of (d.choices || []))
            if (c !== -1 && c !== 0) seen.add(c);
        discovered = seen.size;
      }
      // Excludes untouched open-world series-run placeholders (startedAt: null) - see
      // adminGetUserBooks above for why.
      const pts = (s.playthroughs || []).filter(p => p.startedAt != null);
      totalPts   += pts.length;
      inProgress += pts.filter(p => !p.completed).length;
      deaths     += pts.filter(p => p.result === 'death').length;
      victories  += pts.filter(p => p.result === 'success').length;
      playthroughs.push(...pts.map((p, i) => ({
        index:        i + 1,
        username:     ubRow.owner,
        owner_id:     ubRow.owner_id,
        pathLength:   (p.path || []).length,
        lastSection:  p.path && p.path.length ? p.path[p.path.length - 1] : null,
        completed:    p.completed,
        result:       p.result,
        lastActionAt: p.completedAt || p.lastActionAt || null,
      })));
    } catch {}
  }

  const firstUb = db.prepare(`
    SELECT u.id AS owner_id, u.username AS owner
    FROM user_books ub JOIN users u ON u.id = ub.user_id
    WHERE ub.book_id = ? ORDER BY ub.created_at ASC LIMIT 1
  `).get(bookId);

  return { id: book.id, name: book.name, total_sections: book.total_sections,
           isbn: book.isbn, issn: book.issn, asin: book.asin,
           pages: book.pages, authors: book.authors, description: book.description,
           is_public: book.is_public, cover_path: book.cover_path, pdf_path: book.pdf_path, pdf_size: _getPdfSize(book.pdf_path),
           created_at: book.created_at, updated_at: book.updated_at,
           owner_id: firstUb?.owner_id || null, owner: firstUb?.owner || '-',
           mapped, discovered, totalPts, inProgress, deaths, victories, playthroughs };
}

function adminGetStats() {
  const users        = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const books        = db.prepare("SELECT COUNT(*) AS n FROM books WHERE is_demo = 0 AND parent_book_id IS NULL AND is_container = 0").get().n;
  const anthologies  = db.prepare("SELECT COUNT(*) AS n FROM books WHERE is_demo = 0 AND is_container = 1 AND parent_book_id IS NULL").get().n;
  const seriesCount  = db.prepare('SELECT COUNT(*) AS n FROM series').get().n;
  const sessions     = db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n;

  let totalSections      = 0;
  let mappedSections     = 0;
  let discoveredSections = 0;
  let playthroughs       = 0;
  let activePlaythroughs = 0;
  let finishedPlaythroughs = 0;
  let wins               = 0;
  let deaths             = 0;
  const bookRows = db.prepare('SELECT id, total_sections, is_container FROM books WHERE is_demo = 0 AND parent_book_id IS NULL').all();
  for (const book of bookRows) {
    if (book.is_container) {
      // Anthology: sections and gameplay live on child books
      const childRows = db.prepare('SELECT id, total_sections FROM books WHERE parent_book_id = ? AND is_demo = 0').all(book.id);
      for (const child of childRows) {
        totalSections += child.total_sections || 0;
        const ubRows = db.prepare('SELECT state_data FROM user_books WHERE book_id = ?').all(child.id);
        let bestMapped = 0, bestDiscovered = 0;
        for (const ub of ubRows) {
          try {
            const s = JSON.parse(ub.state_data);
            const m = Object.keys(s.graph || {}).filter(k => !s.graph[k]?.discovered).length;
            if (m > bestMapped) {
              bestMapped = m;
              const seen = new Set(Object.keys(s.graph || {}).map(Number));
              for (const d of Object.values(s.graph || {}))
                for (const c of (d.choices || []))
                  if (c !== -1 && c !== 0) seen.add(c);
              bestDiscovered = seen.size;
            }
            // Excludes untouched open-world series-run placeholders (startedAt: null) -
            // every book in a series carries one padding slot per series run so numbers
            // line up across books, but a slot the run never actually visited isn't a
            // real playthrough of this book and shouldn't inflate its counts.
            const pts = (s.playthroughs || []).filter(p => p.startedAt != null);
            playthroughs         += pts.length;
            activePlaythroughs   += pts.filter(p => !p.result).length;
            finishedPlaythroughs += pts.filter(p => !!p.result).length;
            wins   += pts.filter(p => p.result === 'success').length;
            deaths += pts.filter(p => p.result === 'death').length;
          } catch {}
        }
        mappedSections     += bestMapped;
        discoveredSections += bestDiscovered;
      }
      continue;
    }
    totalSections += book.total_sections || 0;
    const ubRows = db.prepare('SELECT state_data FROM user_books WHERE book_id = ?').all(book.id);
    // Graph stats: use the most complete graph among all users tracking this book
    let bestMapped = 0, bestDiscovered = 0;
    for (const ub of ubRows) {
      try {
        const s = JSON.parse(ub.state_data);
        const m = Object.keys(s.graph || {}).filter(k => !s.graph[k]?.discovered).length;
        if (m > bestMapped) {
          bestMapped = m;
          const seen = new Set(Object.keys(s.graph || {}).map(Number));
          for (const d of Object.values(s.graph || {}))
            for (const c of (d.choices || []))
              if (c !== -1 && c !== 0) seen.add(c);
          bestDiscovered = seen.size;
        }
        // Excludes untouched open-world series-run placeholders (startedAt: null) - see
        // the anthology branch above for why.
        const pts = (s.playthroughs || []).filter(p => p.startedAt != null);
        playthroughs         += pts.length;
        activePlaythroughs   += pts.filter(p => !p.result).length;
        finishedPlaythroughs += pts.filter(p => !!p.result).length;
        wins   += pts.filter(p => p.result === 'success').length;
        deaths += pts.filter(p => p.result === 'death').length;
      } catch {}
    }
    mappedSections     += bestMapped;
    discoveredSections += bestDiscovered;
  }

  const pageCount = db.prepare('PRAGMA page_count').get().page_count;
  const pageSize  = db.prepare('PRAGMA page_size').get().page_size;
  const dbSize    = pageCount * pageSize;

  const feedbackUnread = db.prepare('SELECT COALESCE(SUM(admin_unread), 0) AS n FROM feedback WHERE deleted_by_admin = 0').get()?.n ?? 0;
  const coinRow = db.prepare('SELECT SUM((xp/1000) + bonus_coins) AS earned, SUM(coins_spent) AS spent FROM users').get();
  const totalCoinsEarned    = coinRow?.earned || 0;
  const totalCoinsSpent     = coinRow?.spent  || 0;
  const totalCoinsAvailable = totalCoinsEarned - totalCoinsSpent;
  const pdfCount = db.prepare("SELECT COUNT(*) AS n FROM books WHERE pdf_path IS NOT NULL AND is_demo = 0").get().n;
  return { users, books, anthologies, series: seriesCount, sessions, totalSections, mappedSections, discoveredSections, playthroughs, activePlaythroughs, finishedPlaythroughs, wins, deaths, dbSize, feedbackUnread, totalCoinsEarned, totalCoinsSpent, totalCoinsAvailable, pdfCount };
}

function getSiteStats() {
  const base = adminGetStats();

  // User breakdown
  const admins         = db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1').get().n;
  const authors        = db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_author = 1').get().n;
  const contributors   = db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_contributor = 1').get().n;
  const { undosTotal, fastTravelsTotal } = db.prepare(`
    SELECT
      COALESCE(SUM(CAST(json_extract(pt.value, '$.undosUsed')        AS INTEGER)), 0) AS undosTotal,
      COALESCE(SUM(CAST(json_extract(pt.value, '$.fastTravelsUsed')  AS INTEGER)), 0) AS fastTravelsTotal
    FROM user_books, json_each(json_extract(state_data, '$.playthroughs')) AS pt
  `).get();
  const publicProfiles = db.prepare('SELECT COUNT(*) AS n FROM users WHERE public_profile = 1').get().n;
  const avatarUsers    = db.prepare('SELECT COUNT(*) AS n FROM users WHERE avatar_path IS NOT NULL').get().n;

  // Books: unique books in DB vs total user-library entries
  const uniqueBooks  = base.books; // COUNT(*) FROM standalone books WHERE is_demo=0
  const playableBooks = db.prepare(
    'SELECT COUNT(*) AS n FROM books WHERE is_demo = 0 AND is_container = 0'
  ).get().n;
  const totalUserBooks = db.prepare(
    'SELECT COUNT(*) AS n FROM user_books ub JOIN books b ON b.id = ub.book_id WHERE b.is_demo = 0 AND b.parent_book_id IS NULL AND b.is_container = 0'
  ).get().n;
  const publicBooks  = db.prepare("SELECT COUNT(*) AS n FROM books WHERE is_demo = 0 AND is_public = 1 AND parent_book_id IS NULL AND is_container = 0").get().n;
  const privateBooks = uniqueBooks - publicBooks;
  const uniqueSeries = db.prepare('SELECT COUNT(*) AS n FROM series').get().n;
  const totalUserSeries = db.prepare(
    'SELECT COUNT(*) AS n FROM user_series us JOIN series s ON s.id = us.series_id'
  ).get().n;
  const publicSeries = db.prepare('SELECT COUNT(*) AS n FROM series WHERE is_public = 1').get().n;
  const privateSeries = uniqueSeries - publicSeries;
  const uniqueAnthologies = db.prepare(
    'SELECT COUNT(*) AS n FROM books WHERE is_demo = 0 AND parent_book_id IS NULL AND is_container = 1'
  ).get().n;
  const totalUserAnthologies = db.prepare(
    'SELECT COUNT(*) AS n FROM user_books ub JOIN books b ON b.id = ub.book_id WHERE b.is_demo = 0 AND b.parent_book_id IS NULL AND b.is_container = 1'
  ).get().n;
  const publicAnthologies = db.prepare(
    'SELECT COUNT(*) AS n FROM books WHERE is_demo = 0 AND parent_book_id IS NULL AND is_container = 1 AND is_public = 1'
  ).get().n;
  const privateAnthologies = uniqueAnthologies - publicAnthologies;
  const uniqueAuthors = (() => {
    const rows = db.prepare("SELECT authors FROM books WHERE is_demo = 0 AND authors IS NOT NULL AND trim(authors) != ''").all();
    const seen = new Set();
    for (const row of rows) {
      for (const raw of String(row.authors || '').split(',')) {
        const name = raw.trim();
        if (name) seen.add(name);
      }
    }
    return seen.size;
  })();
  const avgSections  = playableBooks > 0 ? Math.round(base.totalSections / playableBooks) : 0;
  const pagesRow = db.prepare(
    'SELECT SUM(pages) AS total, COUNT(*) AS n FROM books WHERE is_demo = 0 AND is_container = 0 AND pages IS NOT NULL AND pages > 0'
  ).get();
  const totalPages = pagesRow?.total || 0;
  const avgPages   = pagesRow?.n > 0 ? Math.round(totalPages / pagesRow.n) : 0;

  // Gameplay extras
  let battleCount = 0;
  const allUb = db.prepare('SELECT state_data FROM user_books ub JOIN books b ON b.id = ub.book_id WHERE b.is_demo = 0').all();
  for (const row of allUb) {
    try {
      const s = JSON.parse(row.state_data);
      battleCount += (s.playthroughs || []).filter(p => p.result === 'battle').length;
    } catch {}
  }
  const winRate = base.finishedPlaythroughs > 0
    ? Math.round((base.wins / base.finishedPlaythroughs) * 100)
    : 0;

  // XP & levels
  const xpRow      = db.prepare('SELECT SUM(xp) AS total, AVG(xp) AS avg FROM users').get();
  const avgLevelRow = db.prepare(`
    SELECT AVG(
      CASE
        WHEN xp <= 0 THEN 0
        ELSE CAST(floor((-1 + sqrt(1 + 8.0 * xp / 1000.0)) / 2) AS INTEGER)
      END
    ) AS avg
    FROM users
  `).get();
  const totalXp    = xpRow?.total || 0;
  const avgXp      = xpRow?.avg   || 0;
  const appLevelScale = Math.max(1, (base.users || 0) * 1000);
  const appLevel   = totalXp <= 0 ? 0 : Math.floor((-1 + Math.sqrt(1 + 8 * totalXp / appLevelScale)) / 2);
  const appTitle   = getTitleForLevel(appLevel);
  const avgLevel   = Number(avgLevelRow?.avg || 0);
  const avgTitle   = getTitleForLevel(Math.floor(avgLevel));
  // A live sum of everyone's current level, NOT a count of 'level_up' xp_events -
  // that log is deduped per (user, level number) to stop the level-up coin bonus
  // being farmed by dropping and re-crossing the same level, so its count can fall
  // behind a user's current level after any XP correction/revoke. This should
  // always agree with getAppXpSummary()'s sumLevels, which the App-wide XP widget
  // shows as "N total levels" - computing it the same way here keeps them in sync.
  const levelUps   = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN xp <= 0 THEN 0 ELSE CAST(floor((-1 + sqrt(1 + 8.0 * xp / 1000.0)) / 2) AS INTEGER) END), 0) AS n
    FROM users
  `).get().n;
  const xpEvents      = db.prepare("SELECT COUNT(*) AS n FROM xp_events WHERE event != 'level_up' AND event != 'idle_heartbeat'").get().n;
  const xpEventTypes  = db.prepare("SELECT COUNT(DISTINCT event) AS n FROM xp_events WHERE event != 'level_up' AND event != 'idle_heartbeat'").get().n;
  const booksFullyVisited    = db.prepare("SELECT COUNT(DISTINCT CAST(ref AS INTEGER)) AS n FROM xp_events WHERE event = 'visit_all'").get().n;
  const booksFullyDiscovered = db.prepare("SELECT COUNT(DISTINCT CAST(ref AS INTEGER)) AS n FROM xp_events WHERE event = 'discover_all'").get().n;
  const liveHeartbeats   = db.prepare("SELECT COUNT(*) AS n FROM xp_events WHERE event = 'idle_heartbeat'").get().n;
  const bankedHeartbeats = db.prepare('SELECT COALESCE(SUM(heartbeat_minutes_banked), 0) AS n FROM users').get().n;
  const heartbeatMinutes = liveHeartbeats + bankedHeartbeats;
  const avgPlayMinutesPerPlayer = base.users > 0 ? (heartbeatMinutes / base.users) : 0;

  // Forum
  const forumCategories    = db.prepare('SELECT COUNT(*) AS n FROM forum_categories').get().n;
  const forumThreads       = db.prepare('SELECT COUNT(*) AS n FROM forum_threads').get().n;
  const forumPosts         = db.prepare('SELECT COUNT(*) AS n FROM forum_posts WHERE is_deleted = 0').get().n;
  const forumPinnedThreads = db.prepare('SELECT COUNT(*) AS n FROM forum_threads WHERE is_pinned = 1').get().n;

  // Shop upgrades purchased
  // xp_boost_pct stored in tenths-of-a-percent. Free boosts = 1 per level gained (=0.1%).
  // Purchased boosts (in tenths) = xp_boost_pct - level.
  const upgradeRow = db.prepare(
    'SELECT SUM(bonus_undos) AS undos, SUM(bonus_fast_travels) AS fts, SUM(bonus_heartbeat_xp) AS heartbeats, SUM(bonus_gc_chance_purchased) AS gcChances, SUM(coins_spent) AS spent FROM users'
  ).get();
  const upgradeUndos       = upgradeRow?.undos  || 0;
  const upgradeFastTravels = upgradeRow?.fts    || 0;
  const upgradeHeartbeatXp = upgradeRow?.heartbeats || 0;
  const upgradeGcChance    = upgradeRow?.gcChances || 0;
  const upgradeXpBoosts = db.prepare('SELECT xp, xp_boost_pct FROM users').all().reduce((sum, row) => {
    const level = computeLevel(row?.xp || 0);
    const bought = Math.max(0, (row?.xp_boost_pct || 0) - level);
    return sum + bought;
  }, 0);
  const totalUpgrades      = upgradeUndos + upgradeFastTravels + upgradeHeartbeatXp + upgradeGcChance + upgradeXpBoosts;

  // Ratings
  const bookRatingRow       = db.prepare('SELECT COUNT(*) AS n, AVG(rating) AS avg FROM user_books ub JOIN books b ON b.id = ub.book_id WHERE ub.rating IS NOT NULL AND b.is_container = 0').get();
  const anthologyRatingRow  = db.prepare('SELECT COUNT(*) AS n, AVG(rating) AS avg FROM user_books ub JOIN books b ON b.id = ub.book_id WHERE ub.rating IS NOT NULL AND b.is_container = 1 AND b.parent_book_id IS NULL').get();
  const seriesRatingRow     = db.prepare('SELECT COUNT(*) AS n, AVG(rating) AS avg FROM user_series WHERE rating IS NOT NULL').get();
  const ratingsTotal        = (bookRatingRow?.n || 0) + (anthologyRatingRow?.n || 0) + (seriesRatingRow?.n || 0);
  const bookRatingsCount    = bookRatingRow?.n || 0;
  const bookRatingsAvg      = bookRatingRow?.avg ?? null;
  const anthologyRatingsCount = anthologyRatingRow?.n || 0;
  const seriesRatingsCount  = seriesRatingRow?.n || 0;
  const ratingDist          = db.prepare(
    `SELECT ROUND(rating) AS star, COUNT(*) AS n FROM user_books WHERE rating IS NOT NULL GROUP BY ROUND(rating) ORDER BY star`
  ).all();

  // Feedback & misc
  const feedbackThreads = db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE deleted_by_admin = 0').get().n;
  const notifCount      = db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n;

  // Parties
  const partyTotal    = db.prepare('SELECT COUNT(*) AS n FROM book_parties').get().n;
  const partyActive   = db.prepare('SELECT COUNT(DISTINCT party_id) AS n FROM user_books WHERE party_id IS NOT NULL').get().n;
  const partyInviteRow = db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status='accepted' THEN 1 ELSE 0 END) AS accepted, SUM(CASE WHEN status='declined' THEN 1 ELSE 0 END) AS declined FROM party_invites").get();
  const partyInvites          = partyInviteRow?.total    || 0;
  const partyInvitesAccepted  = partyInviteRow?.accepted || 0;
  const partyInvitesDeclined  = partyInviteRow?.declined || 0;
  const partyUsersTotal = db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM user_books WHERE party_id IS NOT NULL').get().n;

  // Open world
  const owSeries       = db.prepare('SELECT COUNT(*) AS n FROM series WHERE is_open_world = 1').get().n;
  const owPublicSeries = db.prepare('SELECT COUNT(*) AS n FROM series WHERE is_open_world = 1 AND is_public = 1').get().n;
  const owBooksTotal   = db.prepare('SELECT COUNT(*) AS n FROM books b JOIN series s ON s.id = b.series_id WHERE s.is_open_world = 1 AND b.is_demo = 0').get().n;
  const owRunsRow      = db.prepare('SELECT COUNT(*) AS total, SUM(completed) AS completed, SUM(is_public) AS public FROM series_runs').get();
  const owRuns         = owRunsRow?.total    || 0;
  const owRunsCompleted = owRunsRow?.completed || 0;
  const owRunsPublic   = owRunsRow?.public   || 0;
  const owPortalsRow   = db.prepare(`
    SELECT COUNT(*) AS n
    FROM user_books ub, json_each(json_extract(ub.state_data, '$.graph')) AS node,
         json_each(json_extract(node.value, '$.portals')) AS portal
    WHERE json_extract(node.value, '$.portals') IS NOT NULL
  `).get();
  const owPortals      = owPortalsRow?.n || 0;
  const owPreSeriesRunsRow = db.prepare(`
    SELECT COALESCE(SUM(json_array_length(json_extract(state_data, '$.preSeriesRuns'))), 0) AS n
    FROM user_books
    WHERE json_extract(state_data, '$.preSeriesRuns') IS NOT NULL
  `).get();
  const owPreSeriesRuns = owPreSeriesRunsRow?.n || 0;

  return {
    // Users
    users: base.users, admins, authors, contributors, publicProfiles, avatarUsers, undosTotal, fastTravelsTotal,
    // Books
    uniqueBooks, uniqueAuthors, totalUserBooks, publicBooks, privateBooks,
    uniqueSeries, totalUserSeries, publicSeries, privateSeries,
    uniqueAnthologies, totalUserAnthologies, publicAnthologies, privateAnthologies,
    avgSections, totalPages, avgPages,
    // Sections
    totalSections: base.totalSections, mappedSections: base.mappedSections, discoveredSections: base.discoveredSections,
    // Gameplay
    playthroughs: base.playthroughs, activePlaythroughs: base.activePlaythroughs,
    finishedPlaythroughs: base.finishedPlaythroughs, wins: base.wins, deaths: base.deaths, battleCount, winRate,
    heartbeatMinutes, avgPlayMinutesPerPlayer,
    // XP & progression
    totalXp, appLevel, appTitle, avgLevel, avgTitle, levelUps, xpEvents, xpEventTypes, booksFullyVisited, booksFullyDiscovered,
    // Coins & shop
    totalCoinsEarned: base.totalCoinsEarned, totalCoinsSpent: base.totalCoinsSpent, totalCoinsAvailable: base.totalCoinsAvailable,
    totalUpgrades, upgradeUndos, upgradeFastTravels, upgradeHeartbeatXp, upgradeGcChance, upgradeXpBoosts,
    // Parties
    partyTotal, partyActive, partyInvites, partyInvitesAccepted, partyInvitesDeclined, partyUsersTotal,
    // Forum
    forumCategories, forumThreads, forumPosts, forumPinnedThreads,
    // Open world
    owSeries, owPublicSeries, owBooksTotal, owRuns, owRunsCompleted, owRunsPublic, owPortals, owPreSeriesRuns,
    // Ratings
    ratingsTotal, bookRatingsCount, bookRatingsAvg, anthologyRatingsCount, seriesRatingsCount, ratingDist,
    // Misc
    feedbackThreads, feedbackUnread: base.feedbackUnread, notifCount, dbSize: base.dbSize,
  };
}

// Admin-only "app-wide XP" summary - mirrors a single user's XP bar shape but
// aggregated across every account, scaled by user count so the app's level
// doesn't dwarf individual players' (same appLevelScale as _buildAdminStatsPayload).
function getAppXpSummary() {
  const row = db.prepare(
    `SELECT COUNT(*) AS users, COALESCE(SUM(xp), 0) AS totalXp,
            COALESCE(SUM(xp_from_boost), 0) AS totalXpFromBoost,
            COALESCE(SUM(xp_boost_pct), 0) AS totalXpBoostPct,
            COALESCE(SUM(bonus_heartbeat_xp), 0) AS totalBonusHeartbeatXp,
            COALESCE(SUM(
              MAX(0, CASE
                WHEN xp <= 0 THEN 0
                ELSE CAST(floor((-1 + sqrt(1 + 8.0 * xp / 1000.0)) / 2) AS INTEGER)
              END - 10)
            ), 0) AS totalFreeHeartbeat,
            COALESCE(SUM(CASE WHEN xp <= 0 THEN 0 ELSE CAST(floor((-1 + sqrt(1 + 8.0 * xp / 1000.0)) / 2) AS INTEGER) END), 0) AS sumLevels,
            COALESCE(MIN(CASE WHEN xp <= 0 THEN 0 ELSE CAST(floor((-1 + sqrt(1 + 8.0 * xp / 1000.0)) / 2) AS INTEGER) END), 0) AS minLevel,
            COALESCE(MAX(CASE WHEN xp <= 0 THEN 0 ELSE CAST(floor((-1 + sqrt(1 + 8.0 * xp / 1000.0)) / 2) AS INTEGER) END), 0) AS maxLevel
     FROM users`
  ).get();
  const users        = row.users || 0;
  const totalXp      = row.totalXp || 0;
  const scale        = Math.max(1, users * 1000);
  const level        = totalXp <= 0 ? 0 : Math.floor((-1 + Math.sqrt(1 + 8 * totalXp / scale)) / 2);
  const title        = getTitleForLevel(level);
  const levelXp       = scale * level * (level + 1) / 2;
  const nextLevelXp   = scale * (level + 1) * (level + 2) / 2;
  const totalXpFromBoost = row.totalXpFromBoost || 0;
  // Combined boost rate across every user's active boost (xp_boost_pct is stored in
  // tenths-of-a-percent), same "sum everyone's rate" shape as heartbeatRatePerMin below -
  // not a retrospective "% of XP earned via boost" fraction, since that's a different
  // question from "how much boost is the app running right now".
  const xpBoostPct   = Math.round(row.totalXpBoostPct) / 10;
  const heartbeatRatePerMin = users + (row.totalBonusHeartbeatXp + row.totalFreeHeartbeat) * 0.1;

  // Avg user level = average of each user's own level (not "level of the average xp" -
  // that's a different, more whale-skewed number, already covered by `level` above).
  const sumLevels    = row.sumLevels || 0;
  const avgLevel     = users > 0 ? sumLevels / users : 0;
  const avgLevelFloor = Math.floor(avgLevel);
  const avgLevelTitle = getTitleForLevel(avgLevelFloor);
  const avgLevelFraction = avgLevel - avgLevelFloor;
  const nextAvgThresholdSum = (avgLevelFloor + 1) * users;
  const levelsNeededForNextAvg = Math.max(0, nextAvgThresholdSum - sumLevels);

  return {
    users, level, title, xp: totalXp, levelXp, nextLevelXp, xpFromBoost: totalXpFromBoost, xpBoostPct, heartbeatRatePerMin,
    sumLevels, minLevel: row.minLevel || 0, maxLevel: row.maxLevel || 0,
    avgLevel: avgLevelFloor, avgLevelTitle, avgLevelFraction, levelsNeededForNextAvg,
  };
}

function adminGetUsers() {
  const users = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.is_author, u.is_contributor, u.created_at, u.last_country, u.last_city,
           u.active_country, u.active_city, u.last_domain, u.failed_login_attempts, u.locked_until, u.is_protected,
           COUNT(DISTINCT CASE WHEN b.is_demo = 0 AND b.parent_book_id IS NULL THEN b.id END) AS book_count,
           COUNT(DISTINCT s.token)   AS session_count,
           COALESCE(u.last_active_at, MAX(CASE WHEN b.is_demo = 0 THEN ub.updated_at ELSE NULL END), u.created_at) AS last_active
    FROM users u
    LEFT JOIN user_books ub ON ub.user_id = u.id
    LEFT JOIN books      b  ON b.id = ub.book_id
    LEFT JOIN sessions   s  ON s.user_id = u.id
    GROUP BY u.id
    ORDER BY last_active DESC, u.created_at DESC
  `).all();
  const allUb = db.prepare(`
    SELECT ub.user_id, ub.state_data FROM user_books ub
    JOIN books b ON b.id = ub.book_id WHERE b.is_demo = 0
  `).all();
  const byUser = {};
  for (const b of allUb) {
    if (!byUser[b.user_id]) byUser[b.user_id] = { runs: 0, wins: 0, deaths: 0, battles: 0, active: 0 };
    try {
      const s = JSON.parse(b.state_data || '{}');
      // preSeriesRuns holds runs that pre-date a book's series turning open-world
      // (migratePreSeriesRuns) - still real, played-out runs, counted alongside
      // playthroughs here too (matching getProfileStats() in server/db/feed.js).
      // Only playthroughs feeds "active" - an incomplete preSeriesRuns entry
      // isn't reachable via the normal continue flow (activePtIndex never
      // points into that array), so it isn't a "currently active" run in the
      // sense adminGetBookStats' activePlaythroughs means.
      for (const pt of (s.playthroughs || [])) {
        // Excludes untouched open-world series-run placeholders (startedAt: null) -
        // a book in a series carries one padding slot per series run so numbers line
        // up across books, but a slot the run never actually visited here isn't a
        // real active run of this book - it was inflating this admin count (and the
        // per-book/per-user ones above) by exactly the number of padding slots.
        if (pt.startedAt == null) continue;
        // Completed-only, matching getProfileStats() (server/db/feed.js) - an
        // in-progress run (no result yet) previously inflated this count relative
        // to what the user's own profile shows for the same thing.
        if (pt.result === 'success') { byUser[b.user_id].runs++; byUser[b.user_id].wins++; }
        else if (pt.result === 'death') { byUser[b.user_id].runs++; byUser[b.user_id].deaths++; }
        else if (pt.result === 'battle') { byUser[b.user_id].runs++; byUser[b.user_id].battles++; }
        else byUser[b.user_id].active++; // no result yet - matches adminGetBookStats' activePlaythroughs
      }
      for (const pt of (s.preSeriesRuns || [])) {
        if (pt.result === 'success') { byUser[b.user_id].runs++; byUser[b.user_id].wins++; }
        else if (pt.result === 'death') { byUser[b.user_id].runs++; byUser[b.user_id].deaths++; }
        else if (pt.result === 'battle') { byUser[b.user_id].runs++; byUser[b.user_id].battles++; }
      }
    } catch {}
  }
  return users.map(u => ({ ...u, ...(byUser[u.id] || { runs: 0, wins: 0, deaths: 0, battles: 0, active: 0 }), ...getUserXpInfo(u.id) }));
}

function updateUserGeo(userId, country, city) {
  db.prepare('UPDATE users SET last_country = ?, last_city = ? WHERE id = ?')
    .run(country || null, city || null, userId);
}

const ACTIVE_THROTTLE_S = 60; // 1 minute
function updateUserLastActive(userId) {
  const now = Math.floor(Date.now() / 1000);
  const row = db.prepare('SELECT last_active_at FROM users WHERE id = ?').get(userId);
  if (row?.last_active_at && (now - row.last_active_at) < ACTIVE_THROTTLE_S) return;
  db.prepare('UPDATE users SET last_active_at = ? WHERE id = ?').run(now, userId);
}

const ACTIVE_GEO_THROTTLE_S = 10 * 60; // 10 minutes
function updateUserActiveGeo(userId, country, city) {
  const row = db.prepare('SELECT active_country, active_city, active_loc_at FROM users WHERE id = ?').get(userId);
  const now = Math.floor(Date.now() / 1000);
  if (row?.active_loc_at && (now - row.active_loc_at) < ACTIVE_GEO_THROTTLE_S) return;
  const c = country || null, ci = city || null;
  if (row?.active_country === c && row?.active_city === ci) return;
  db.prepare('UPDATE users SET active_country = ?, active_city = ?, active_loc_at = ? WHERE id = ?')
    .run(c, ci, now, userId);
}

// No throttle needed (unlike geo) - domain essentially never changes mid-session, so
// the no-op guard below already skips the write on every request after the first.
function updateUserLastDomain(userId, domain) {
  if (!domain) return;
  const row = db.prepare('SELECT last_domain FROM users WHERE id = ?').get(userId);
  if (row?.last_domain === domain) return;
  db.prepare('UPDATE users SET last_domain = ? WHERE id = ?').run(domain, userId);
}

function adminLockUser(userId) {
  const user = db.prepare('SELECT is_protected FROM users WHERE id = ?').get(userId);
  if (!user || user.is_protected) return false;
  db.prepare('UPDATE users SET locked_until = -1 WHERE id = ?').run(userId);
  return true;
}

function adminUnlockUser(userId) {
  db.prepare('UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE id = ?').run(userId);
}

function adminDeleteUser(userId) {
  // Find books that will become orphaned when this user's user_books rows are deleted
  const orphanBookIds = db.prepare(`
    SELECT ub.book_id FROM user_books ub
    WHERE ub.user_id = ?
      AND (SELECT COUNT(*) FROM user_books ub2 WHERE ub2.book_id = ub.book_id) = 1
  `).all(userId).map(r => r.book_id);

  // Delete cover files for orphaned books
  for (const bookId of orphanBookIds) {
    const book = db.prepare('SELECT cover_path FROM books WHERE id = ?').get(bookId);
    if (book?.cover_path) {
      try { require('fs').unlinkSync(require('path').join(__dirname, '..', 'public', 'covers', book.cover_path)); } catch (_) {}
    }
  }

  // Cascade handles sessions, xp_events, user_books via FK ON DELETE CASCADE
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);

  // Delete orphaned book rows (no more trackers)
  for (const bookId of orphanBookIds) {
    db.prepare('DELETE FROM books WHERE id = ?').run(bookId);
  }

  return result.changes > 0;
}

function adminClearUserSessions(userId) {
  return db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId).changes;
}

function adminGetBooks() {
  // Anthology containers have no playthroughs of their own (wins/losses/battle
  // stats are meaningless for them) and are listed separately in the Anthologies
  // tab instead - see getAllAnthologiesAdmin().
  const books = db.prepare(`
    SELECT b.id, b.name, b.total_sections, b.created_at, b.updated_at, b.is_container
    FROM books b WHERE b.is_demo = 0 AND b.is_container = 0
    ORDER BY b.created_at ASC
  `).all();

  return books.map(book => {
    const ubRows = db.prepare(`
      SELECT ub.state_data, u.username
      FROM user_books ub JOIN users u ON u.id = ub.user_id
      WHERE ub.book_id = ?
    `).all(book.id);
    let wins = 0, deaths = 0, battles = 0;
    const owner = ubRows.length > 0 ? ubRows[0].username : '-';
    for (const ub of ubRows) {
      try {
        const s = JSON.parse(ub.state_data || '{}');
        for (const pt of (s.playthroughs || [])) {
          if (pt.result === 'success') wins++;
          else if (pt.result === 'death') deaths++;
          else if (pt.result === 'battle') battles++;
        }
      } catch (_) {}
    }
    return { ...book, owner, readers: ubRows.length, wins, deaths, battles };
  });
}

function adminDeleteBook(bookId) {
  // Refuse if any users still track this book - caller must resolve readers first
  const readerCount = db.prepare('SELECT COUNT(*) AS n FROM user_books WHERE book_id = ?').get(bookId).n;
  if (readerCount > 0) {
    const names = db.prepare(
      'SELECT u.username FROM user_books ub JOIN users u ON u.id = ub.user_id WHERE ub.book_id = ? LIMIT 10'
    ).all(bookId).map(r => r.username);
    return { error: 'has_readers', count: readerCount, names };
  }
  const book = db.prepare('SELECT cover_path FROM books WHERE id = ?').get(bookId);
  if (book?.cover_path) {
    try { require('fs').unlinkSync(require('path').join(__dirname, '..', 'public', 'covers', book.cover_path)); } catch (_) {}
  }
  return db.prepare('DELETE FROM books WHERE id = ?').run(bookId).changes > 0;
}

function adminGetBookRatings(bookId) {
  return db.prepare(`
    SELECT ub.id AS user_book_id, u.id AS user_id, u.username, ub.rating,
           b.id AS book_id, b.name AS book_name, ub.updated_at
    FROM user_books ub JOIN users u ON u.id = ub.user_id JOIN books b ON b.id = ub.book_id
    WHERE ub.book_id = ? AND ub.rating IS NOT NULL ORDER BY ub.updated_at DESC
  `).all(bookId);
}

function adminDeleteRating(userBookId) {
  return db.prepare('UPDATE user_books SET rating = NULL WHERE id = ?').run(userBookId).changes > 0;
}

function adminVacuum() {
  purgeExpiredSessions();
  db.exec('VACUUM');
}

// ── Admin settings ────────────────────────────────────────────────────────────

function getAdminSetting(key) {
  return db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key)?.value ?? null;
}

function setAdminSetting(key, value) {
  db.prepare('INSERT INTO admin_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

function getAllAdminSettings() {
  const rows = db.prepare('SELECT key, value FROM admin_settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

// ── Announcements ─────────────────────────────────────────────────────────────

function createAnnouncement(title, body) {
  const r = db.prepare(
    'INSERT INTO announcements (title, body, is_draft) VALUES (?, ?, 1)'
  ).run(title, body);
  return db.prepare('SELECT * FROM announcements WHERE id = ?').get(r.lastInsertRowid);
}

function updateAnnouncement(id, title, body) {
  const r = db.prepare(
    'UPDATE announcements SET title = ?, body = ? WHERE id = ?'
  ).run(title, body, id);
  if (r.changes === 0) return null;
  return db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
}

function publishAnnouncement(id) {
  const now = Math.floor(Date.now() / 1000);
  const r = db.prepare(
    'UPDATE announcements SET is_draft = 0, published_at = ? WHERE id = ?'
  ).run(now, id);
  if (r.changes === 0) return null;
  return db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
}

function unpublishAnnouncement(id) {
  const r = db.prepare(
    'UPDATE announcements SET is_draft = 1, published_at = NULL WHERE id = ?'
  ).run(id);
  if (r.changes === 0) return null;
  return db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
}

function deleteAnnouncement(id) {
  return db.prepare('DELETE FROM announcements WHERE id = ?').run(id).changes > 0;
}

function getAnnouncements() {
  return db.prepare(
    'SELECT * FROM announcements ORDER BY pinned DESC, COALESCE(published_at, created_at) DESC'
  ).all();
}

function getPinnedAnnouncement() {
  return db.prepare(
    'SELECT * FROM announcements WHERE pinned = 1 AND is_draft = 0 LIMIT 1'
  ).get() ?? null;
}

const _pinAnnouncementTx = db.transaction((id) => {
  db.prepare('UPDATE announcements SET pinned = 0').run();
  db.prepare('UPDATE announcements SET pinned = 1 WHERE id = ? AND is_draft = 0').run(id);
  return db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
});

function pinAnnouncement(id) {
  const row = _pinAnnouncementTx(id);
  return row?.pinned === 1 ? row : null;
}

function unpinAnnouncement(id) {
  const r = db.prepare('UPDATE announcements SET pinned = 0 WHERE id = ?').run(id);
  if (r.changes === 0) return null;
  return db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
}

// 1 purchase per 10 levels: level 0-10 -> 1, 11-20 -> 2, 21-30 -> 3, etc. Mirrored in
// public/js/shop.js for the "Max"/cap UI state - keep both in sync if this changes.
function undoFastTravelCap(level) {
  return Math.floor((Math.max(level, 1) - 1) / 10) + 1;
}

// ── Shop item config ─────────────────────────────────────────────────────────
// Same pattern as xp_config (xp.js): was a hardcoded object here, duplicated
// (different shape - id/cost/col/delta vs id/label/costFn/desc) in
// public/js/shop.js purely for client-side cost *display*. The server copy
// here is the one that actually enforces cost/effect on purchase, so it's
// the one worth making DB-editable; the client copy stays as-is since it's
// UI/i18n-bound presentation logic (translated labels, formatted descriptions)
// that can't cleanly become DB rows, and the server always re-validates the
// real cost on purchase regardless of what the client displayed.
db.prepare(`CREATE TABLE IF NOT EXISTS shop_items (
  id        TEXT PRIMARY KEY,
  cost      INTEGER NOT NULL,
  step_cost INTEGER DEFAULT NULL,
  col       TEXT NOT NULL,
  delta     INTEGER NOT NULL
)`).run();

const _shopItemDefaults = {
  xp_boost:     { cost: 0, col: 'xp_boost_pct',               delta: 1, stepCost: null },
  undo:         { cost: 3, col: 'bonus_undos',                delta: 1, stepCost: 3 },
  fast_travel:  { cost: 5, col: 'bonus_fast_travels',         delta: 1, stepCost: 5 },
  heartbeat_xp: { cost: 0, col: 'bonus_heartbeat_xp',         delta: 1, stepCost: null },
  gc_chance:    { cost: 0, col: 'bonus_gc_chance_purchased',  delta: 1, stepCost: null },
};
db.transaction(() => {
  const ins = db.prepare('INSERT OR IGNORE INTO shop_items (id, cost, step_cost, col, delta) VALUES (?, ?, ?, ?, ?)');
  for (const [id, d] of Object.entries(_shopItemDefaults)) ins.run(id, d.cost, d.stepCost, d.col, d.delta);
})();

function _loadShopItemsCache() {
  return new Map(db.prepare('SELECT id, cost, step_cost, col, delta FROM shop_items').all()
    .map(r => [r.id, { cost: r.cost, stepCost: r.step_cost ?? undefined, col: r.col, delta: r.delta }]));
}
let _shopItemsCache = _loadShopItemsCache();

function getShopItems() { return db.prepare('SELECT id, cost, step_cost, col, delta FROM shop_items ORDER BY id').all(); }
function setShopItemCost(id, cost, stepCost) {
  if (!_shopItemsCache.has(id)) return { error: 'invalid_item' };
  const def = _shopItemsCache.get(id);
  db.prepare('UPDATE shop_items SET cost = ?, step_cost = ? WHERE id = ?').run(cost, stepCost ?? null, id);
  _shopItemsCache.set(id, { ...def, cost, stepCost: stepCost ?? undefined });
  return { ok: true };
}

function purchaseShopItem(userId, item) {
  const def = _shopItemsCache.get(item);
  if (!def) return { error: 'invalid_item' };
  const row = db.prepare('SELECT xp, coins_spent, xp_boost_pct, bonus_undos, bonus_fast_travels, bonus_heartbeat_xp, bonus_gc_chance_purchased, bonus_coins FROM users WHERE id = ?').get(userId);
  if (!row) return { error: 'not_found' };
  const level = computeLevel(row.xp);
  let cost = def.cost;
  if (item === 'xp_boost') {
    const cap = level;
    const purchasedBoosts = Math.max(0, (row.xp_boost_pct || 0) - level);
    if (purchasedBoosts >= cap) return { error: 'cap_reached', cap, level, item };
    cost = purchasedBoosts + 1;
  }
  if (item === 'undo') {
    const cap = undoFastTravelCap(level);
    const purchased = row.bonus_undos || 0;
    if (purchased >= cap) return { error: 'cap_reached', cap, level, item };
    cost = (purchased + 1) * def.stepCost;
  }
  if (item === 'fast_travel') {
    const cap = undoFastTravelCap(level);
    const purchased = row.bonus_fast_travels || 0;
    if (purchased >= cap) return { error: 'cap_reached', cap, level, item };
    cost = (purchased + 1) * def.stepCost;
  }
  if (item === 'heartbeat_xp') {
    const cap = level;
    const purchased = row.bonus_heartbeat_xp || 0;
    if (purchased >= cap) return { error: 'cap_reached', cap, level, item };
    cost = purchased + 1;
  }
  if (item === 'gc_chance') {
    // Capped at `level` purchases so purchased bonus GC chance never exceeds
    // the level-based base chance (0.01% per level each) - see _rollBonusGc.
    const cap = level;
    const purchased = row.bonus_gc_chance_purchased || 0;
    if (purchased >= cap) return { error: 'cap_reached', cap, level, item };
    cost = purchased + 1;
  }
  const balance = Math.floor(row.xp / 1000) + (row.bonus_coins || 0) - (row.coins_spent || 0);
  if (balance < cost) return { error: 'insufficient_coins' };
  db.prepare(`UPDATE users SET coins_spent = coins_spent + ?, ${def.col} = ${def.col} + ? WHERE id = ?`)
    .run(cost, def.delta, userId);
  return { ok: true, newBalance: balance - cost };
}

function adminRefundShopItem(userId, item, all = false) {
  const def = _shopItemsCache.get(item);
  if (!def) return { error: 'invalid_item' };
  const row = db.prepare(`SELECT coins_spent, ${def.col} FROM users WHERE id = ?`).get(userId);
  if (!row) return { error: 'not_found' };
  const current = row[def.col] || 0;
  if (item !== 'xp_boost' && item !== 'heartbeat_xp' && item !== 'gc_chance' && current < def.delta) return { error: 'nothing_to_refund' };
  let refund;
  if (item === 'heartbeat_xp' || item === 'xp_boost' || item === 'gc_chance') {
    // All three use escalating cost (1st purchase = 1 GC, 2nd = 2 GC, etc.);
    // for xp_boost only, the column also carries free per-level boosts that
    // were never purchased, so only the portion above that counts.
    const freeBoosts = item === 'xp_boost' ? computeLevel(db.prepare('SELECT xp FROM users WHERE id = ?').get(userId)?.xp || 0) : 0;
    const purchased = Math.max(0, current - freeBoosts);
    if (purchased < def.delta) return { error: 'nothing_to_refund' };
    refund = all ? (purchased * (purchased + 1)) / 2 : purchased;
    if (all) {
      db.prepare(`UPDATE users SET coins_spent = MAX(0, coins_spent - ?), ${def.col} = ? WHERE id = ?`)
        .run(refund, freeBoosts, userId);
    } else {
      db.prepare(`UPDATE users SET coins_spent = MAX(0, coins_spent - ?), ${def.col} = ${def.col} - ? WHERE id = ?`)
        .run(refund, def.delta, userId);
    }
  } else if (all) {
    refund = def.stepCost ? def.stepCost * current * (current + 1) / 2 : current * def.cost;
    db.prepare(`UPDATE users SET coins_spent = MAX(0, coins_spent - ?), ${def.col} = 0 WHERE id = ?`)
      .run(refund, userId);
  } else {
    refund = def.stepCost ? def.stepCost * current : def.cost;
    db.prepare(`UPDATE users SET coins_spent = MAX(0, coins_spent - ?), ${def.col} = ${def.col} - ? WHERE id = ?`)
      .run(refund, def.delta, userId);
  }
  if (refund > 0) {
    const balance = getUserXpInfo(userId).coinsBalance;
    _insertNotif.run(userId, 'coin_gain', JSON.stringify({ amount: refund, balance, reason: 'shop_refund' }));
  }
  return { ok: true };
}

// One-time back-fill: grant 1% xp_boost_pct per level already earned
{
  const _bfDone = db.prepare("SELECT value FROM admin_settings WHERE key = 'level_boost_backfilled'").get();
  if (!_bfDone) {
    db.transaction(() => {
      const users = db.prepare('SELECT id, xp FROM users').all();
      const stmt  = db.prepare('UPDATE users SET xp_boost_pct = xp_boost_pct + ? WHERE id = ?');
      for (const u of users) {
        const lv = computeLevel(u.xp || 0);
        if (lv > 0) stmt.run(lv, u.id);
      }
      db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('level_boost_backfilled', '1')").run();
    })();
  }
}

// One-time back-fill: grant 1 GC for each already-earned 24h of tracked play time
{
  const _bfDone = db.prepare("SELECT value FROM admin_settings WHERE key = 'level_up_coin_backfilled'").get();
  if (!_bfDone) {
    db.transaction(() => {
      const users = db.prepare('SELECT id, xp FROM users').all();
      const insert = db.prepare('INSERT OR IGNORE INTO coin_events (user_id, event, ref, amount) VALUES (?, ?, ?, 1)');
      const addCoins = db.prepare('UPDATE users SET bonus_coins = bonus_coins + ? WHERE id = ?');
      for (const { id, xp } of users) {
        const level = computeLevel(xp || 0);
        let granted = 0;
        for (let lv = 1; lv <= level; lv++) {
          if (insert.run(id, 'level_up_coin', String(lv)).changes > 0) granted += 1;
        }
        if (granted > 0) addCoins.run(granted, id);
      }
      db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('level_up_coin_backfilled', '1')").run();
    })();
  }
}

// One-time back-fill: grant 1 GC for each already-earned 24h of tracked play time
{
  const _bfDone = db.prepare("SELECT value FROM admin_settings WHERE key = 'playtime_coin_backfilled'").get();
  if (!_bfDone) {
    db.transaction(() => {
      const users = db.prepare('SELECT id FROM users').all();
      const insert = db.prepare('INSERT OR IGNORE INTO coin_events (user_id, event, ref, amount) VALUES (?, ?, ?, 1)');
      const addCoins = db.prepare('UPDATE users SET bonus_coins = bonus_coins + ? WHERE id = ?');
      for (const { id } of users) {
        const heartbeats = db.prepare("SELECT COUNT(*) AS n FROM xp_events WHERE user_id = ? AND event = 'idle_heartbeat'").get(id)?.n || 0;
        const playDays = Math.floor(heartbeats / 1440);
        let granted = 0;
        for (let day = 1; day <= playDays; day++) {
          if (insert.run(id, 'playtime_24h', String(day)).changes > 0) granted += 1;
        }
        if (granted > 0) addCoins.run(granted, id);
      }
      db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('playtime_coin_backfilled', '1')").run();
    })();
  }
}

// One-time back-fill: grant 1 GC for books that were already fully visited
{
  const _bfDone = db.prepare("SELECT value FROM admin_settings WHERE key = 'book_complete_coin_backfilled'").get();
  if (!_bfDone) {
    db.transaction(() => {
      const rows = db.prepare("SELECT DISTINCT user_id, ref FROM xp_events WHERE event = 'visit_all'").all();
      const insert = db.prepare('INSERT OR IGNORE INTO coin_events (user_id, event, ref, amount) VALUES (?, ?, ?, 1)');
      const grantedByUser = new Map();
      for (const row of rows) {
        const ref = String(row.ref || '').trim();
        if (!/^[0-9]+$/.test(ref)) continue;
        if (insert.run(row.user_id, 'book_completed', ref).changes > 0) {
          grantedByUser.set(row.user_id, (grantedByUser.get(row.user_id) || 0) + 1);
        }
      }
      const addCoins = db.prepare('UPDATE users SET bonus_coins = bonus_coins + ? WHERE id = ?');
      for (const [userId, granted] of grantedByUser.entries()) addCoins.run(granted, userId);
      db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('book_complete_coin_backfilled', '1')").run();
    })();
  }
}

// One-time back-fill: grant coins for series/anthology already fully visited (visit_all_series / visit_all_anthology)
{
  const _bfDone = db.prepare("SELECT value FROM admin_settings WHERE key = 'group_complete_coin_backfilled'").get();
  if (!_bfDone) {
    db.transaction(() => {
      const insert     = db.prepare('INSERT OR IGNORE INTO coin_events (user_id, event, ref, amount) VALUES (?, ?, ?, ?)');
      const addCoins   = db.prepare('UPDATE users SET bonus_coins = bonus_coins + ? WHERE id = ?');
      const seriesRows = db.prepare("SELECT DISTINCT user_id, ref FROM xp_events WHERE event = 'visit_all_series'").all();
      const grantedByUser = new Map();
      for (const { user_id, ref } of seriesRows) {
        const total = db.prepare(
          'SELECT COUNT(*) AS n FROM books WHERE series_id = ? AND is_demo = 0 AND is_container = 0'
        ).get(Number(ref))?.n || 0;
        if (total > 0 && insert.run(user_id, 'visit_all_series', String(ref), total).changes > 0)
          grantedByUser.set(user_id, (grantedByUser.get(user_id) || 0) + total);
      }
      const anthologyRows = db.prepare("SELECT DISTINCT user_id, ref FROM xp_events WHERE event = 'visit_all_anthology'").all();
      for (const { user_id, ref } of anthologyRows) {
        const total = db.prepare(
          'SELECT COUNT(*) AS n FROM books WHERE parent_book_id = ? AND is_demo = 0'
        ).get(Number(ref))?.n || 0;
        if (total > 0 && insert.run(user_id, 'visit_all_anthology', String(ref), total).changes > 0)
          grantedByUser.set(user_id, (grantedByUser.get(user_id) || 0) + total);
      }
      for (const [userId, granted] of grantedByUser.entries()) addCoins.run(granted, userId);
      db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('group_complete_coin_backfilled', '1')").run();
    })();
  }
}

// One-time back-fill: grant 200 XP per user for books that already have a PDF
{
  const _bfDone = db.prepare("SELECT value FROM admin_settings WHERE key = 'pdf_xp_backfilled'").get();
  if (!_bfDone) {
    db.transaction(() => {
      const books = db.prepare('SELECT id FROM books WHERE pdf_path IS NOT NULL').all();
      for (const { id } of books) awardPdfXp(id);
      db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('pdf_xp_backfilled', '1')").run();
    })();
  }
}

// One-time back-fill: award XP for existing library additions (adder + creator)
{
  const _bfDone = db.prepare("SELECT value FROM admin_settings WHERE key = 'library_add_xp_backfilled'").get();
  if (!_bfDone) {
    db.transaction(() => {
      const rows = db.prepare(`
        SELECT ub.user_id, ub.book_id, b.created_by
        FROM user_books ub
        JOIN books b ON b.id = ub.book_id
        WHERE b.is_demo = 0 AND b.created_by IS NOT NULL AND b.created_by != ub.user_id
      `).all();
      for (const r of rows) {
        awardXp(r.user_id,    'add_to_library',    String(r.book_id));
        awardXp(r.created_by, 'book_added_by_other', String(r.book_id) + ':' + String(r.user_id));
      }
      db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('library_add_xp_backfilled', '1')").run();
    })();
  }
}

// One-time back-fill: award XP for existing public series and anthology attachments
{
  const _bfDone = db.prepare("SELECT value FROM admin_settings WHERE key = 'series_anthology_xp_backfilled'").get();
  if (!_bfDone) {
    db.transaction(() => {
      const publicSeries = db.prepare(`
        SELECT id, created_by
        FROM series
        WHERE is_public = 1 AND created_by IS NOT NULL
      `).all();
      for (const row of publicSeries) {
        awardXp(row.created_by, 'make_series_public', row.id);
      }

      const anthologyMembers = db.prepare(`
        SELECT id, created_by
        FROM books
        WHERE is_demo = 0 AND parent_book_id IS NOT NULL AND created_by IS NOT NULL
      `).all();
      for (const row of anthologyMembers) {
        awardXp(row.created_by, 'add_book_to_anthology', row.id);
      }

      db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('series_anthology_xp_backfilled', '1')").run();
    })();
  }
}

// One-time back-fill: award XP for accepted party joins and real multi-user party creation
{
  const _bfDone = db.prepare("SELECT value FROM admin_settings WHERE key = 'party_xp_backfilled'").get();
  if (!_bfDone) {
    db.transaction(() => {
      const acceptedInvites = db.prepare(`
        SELECT party_id, inviter_id, invitee_id, created_at, responded_at, id
        FROM party_invites
        WHERE status = 'accepted'
        ORDER BY party_id, COALESCE(responded_at, created_at), id
      `).all();

      const rewardedCreators = new Set();
      for (const row of acceptedInvites) {
        awardXp(row.invitee_id, 'join_party', `${row.party_id}:${row.invitee_id}`);
        if (!rewardedCreators.has(row.party_id)) {
          awardXp(row.inviter_id, 'create_party', row.party_id);
          rewardedCreators.add(row.party_id);
        }
      }

      db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('party_xp_backfilled', '1')").run();
    })();
  }
}

// One-time back-fill: award XP for existing series numbers and anthology order numbers
{
  const _bfDone = db.prepare("SELECT value FROM admin_settings WHERE key = 'book_numbering_xp_backfilled'").get();
  if (!_bfDone) {
    db.transaction(() => {
      const seriesNumbered = db.prepare(`
        SELECT id, created_by
        FROM books
        WHERE is_demo = 0
          AND created_by IS NOT NULL
          AND series_id IS NOT NULL
          AND series_number IS NOT NULL
          AND TRIM(series_number) != ''
      `).all();
      for (const row of seriesNumbered) {
        awardXp(row.created_by, 'add_series_number', row.id);
      }

      const anthologyOrdered = db.prepare(`
        SELECT id, created_by
        FROM books
        WHERE is_demo = 0
          AND created_by IS NOT NULL
          AND parent_book_id IS NOT NULL
          AND book_order IS NOT NULL
      `).all();
      for (const row of anthologyOrdered) {
        awardXp(row.created_by, 'add_anthology_order', row.id);
      }

      db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('book_numbering_xp_backfilled', '1')").run();
    })();
  }
}

// One-time back-fill: grant 1 GC per 100 completed runs milestone
{
  const _bfDone = db.prepare("SELECT value FROM admin_settings WHERE key = 'runs_milestone_coin_backfilled'").get();
  if (!_bfDone) {
    db.transaction(() => {
      const rows = db.prepare(
        "SELECT user_id, COUNT(*) AS n FROM xp_events WHERE event IN ('win_run','death_run','battle_run') GROUP BY user_id"
      ).all();
      for (const { user_id, n } of rows) {
        const milestones = Math.floor(n / 100);
        for (let m = 1; m <= milestones; m++) {
          awardCoins(user_id, 'runs_milestone', String(m * 100), 1);
        }
      }
      db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('runs_milestone_coin_backfilled', '1')").run();
    })();
  }
}

// Seed forum categories once
{
  const n = db.prepare('SELECT COUNT(*) AS n FROM forum_categories').get().n;
  if (n === 0) {
    db.exec(`INSERT INTO forum_categories (id, name, slug, description, sort_order) VALUES
      (1, 'General Discussion',      'general',         'Anything and everything gamebook-related',             1),
      (2, 'Book Recommendations',    'recommendations', 'Looking for something to read? Ask here',              2),
      (3, 'Playthroughs & Spoilers', 'playthroughs',    'Discuss specific books, routes, and endings',          3),
      (4, 'Site Feedback',           'feedback',        'Bugs, feature requests, and suggestions for the site', 4),
      (5, 'Off Topic',               'off-topic',       'Anything else',                                        5)`);
  }
}

function giftBook(bookId, sourceUserId, targetUserId) {
  // Verify book exists and target user exists
  const book = db.prepare('SELECT id, name, total_sections FROM books WHERE id = ?').get(bookId);
  if (!book) return { error: 'book_not_found' };
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
  if (!user) return { error: 'user_not_found' };
  // Check target doesn't already track this book
  const existing = db.prepare('SELECT id FROM user_books WHERE book_id = ? AND user_id = ?').get(bookId, targetUserId);
  if (existing) return { error: 'already_tracking' };

  // Copy source user's state if available, otherwise start fresh
  const sourceRow = sourceUserId
    ? db.prepare('SELECT state_data FROM user_books WHERE book_id = ? AND user_id = ?').get(bookId, sourceUserId)
    : null;
  let sourceState = {};
  let stateJson;
  if (sourceRow?.state_data) {
    try { sourceState = JSON.parse(sourceRow.state_data); } catch {}
    stateJson = sourceRow.state_data;
  } else {
    stateJson = JSON.stringify({
      bookName: book.name || '',
      totalSections: book.total_sections || 0,
      graph: {},
      playthroughs: [],
      activePtIndex: null,
      positions: {},
    });
  }

  db.prepare('INSERT INTO user_books (user_id, book_id, state_data) VALUES (?, ?, ?)').run(targetUserId, bookId, stateJson);
  // Award add_book XP to recipient
  awardXp(targetUserId, 'add_book', bookId);
  // Award all XP the source user earned from this book's state
  if (Object.keys(sourceState).length > 0) {
    processStateXp(targetUserId, bookId, {}, sourceState, book.total_sections || 0);
  }
  return { ok: true };
}


module.exports = {
  getTips, getAllTipsAdmin, createTip, updateTip, deleteTip,
  getAllLevelUpTemplatesAdmin, createLevelUpTemplate, updateLevelUpTemplate, deleteLevelUpTemplate,
  getAllItemsAdmin, getActiveItems, getActiveItemsMeta, getItemById, getItemsByIds, createItem, updateItem, deleteItem,
  getAllSeriesAdmin, getAllAnthologiesAdmin,
  adminGetUser, adminGetUserBooks, adminGetBookStats, adminGetStats, getSiteStats, getAppXpSummary, adminGetUsers,
  updateUserGeo, updateUserActiveGeo, updateUserLastDomain, updateUserLastActive,
  adminLockUser, adminUnlockUser, adminDeleteUser, adminClearUserSessions,
  adminGetBooks, adminDeleteBook, adminGetBookRatings, adminDeleteRating, adminVacuum,
  getAdminSetting, setAdminSetting, getAllAdminSettings,
  createAnnouncement, updateAnnouncement, publishAnnouncement, unpublishAnnouncement,
  deleteAnnouncement, getAnnouncements, getPinnedAnnouncement, pinAnnouncement, unpinAnnouncement,
  purchaseShopItem, adminRefundShopItem, giftBook,
  getShopItems, setShopItemCost,
};
