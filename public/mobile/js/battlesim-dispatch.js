// Mobile battle-sim dispatcher. Mirrors desktop's lazy loading: no battle sim
// module is imported until the reader opens the simulator for the current book.

import {prepareBattleSimLayout, simulatorOverlay} from '../../js/battlesim/layout.js';

const SUPPORTED_BATTLE_SIM_BOOKS = new Set([
  8, 78, 80, 82, 83, 86, 92, 107, 108, 114, 115, 118, 122, 123, 130, 135, 161,
  186, 193, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210,
  211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225,
  226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240,
  241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255,
  256, 257, 258, 259, 260, 263, 264, 267, 272, 273, 274, 275, 276, 278, 279,
  280, 286, 317, 318, 319, 320, 321, 322, 323, 324, 325, 370, 375, 376, 377,
  378, 397, 398, 399, 412, 414, 415, 416, 430, 431, 432, 433, 434, 435, 436, 437,
  438, 439, 440, 441, 462, 463, 464, 465, 468, 526, 541, 661, 696, 716, 734, 739,
  740, 753, 760, 772, 781, 829, 869, 871, 877, 881, 882, 400, 401, 402, 481,
491, 486, 521, 522, 523, 524, 527, 528, 529, 530, 531, 532, 533, 534, 535, 536, 537, 539, 548, 550, 555, 557, 570, 636, 644, 648, 654, 658, 663, 665, 671, 672, 674,
  675, 676, 677, 678, 679, 680, 689, 690, 700, 706, 710, 718, 722, 723, 724, 728, 735, 757, 768, 769, 773, 783, 797, 807, 808, 809, 810, 812, 817, 832, 833, 838, 856, 857, 860, 873, 891, 895, 896, 903, 904,
  906, 1285, 1286, 1287, 1288, 1290, 1291, 1292, 1293, 1294, 1295, 1296, 1297, 1298, 1299, 1300, 1301, 1302, 1303,
]);

const _initialized = new Set();

function _triggerButtonId(bookId) {
  if (bookId === 829) return 'battlesim-btn';
  if (bookId === 8) return 'sim8-btn';
  return `sim${bookId}-btn`;
}

export function hasSim(bookId) {
  return SUPPORTED_BATTLE_SIM_BOOKS.has(Number(bookId));
}

export async function openSimForBook(bookId) {
  const id = Number(bookId);
  if (!SUPPORTED_BATTLE_SIM_BOOKS.has(id)) return;

  if ([186, 200, 201, 205, 206, 207, 208, 210, 213, 214, 234, 236, 240, 267, 286, 397, 398, 399, 400, 401, 402, 412, 430, 431, 432, 433, 434, 435, 436, 437, 438, 439, 440, 441, 462, 464, 468, 521, 522, 523, 524, 527, 528, 529, 530, 531, 532, 533, 534, 535, 536, 537, 539, 548, 550, 555, 557, 570, 636, 644, 648, 654, 658, 663, 665, 671, 672, 674, 675, 676, 677, 678, 679, 680, 689, 690, 696, 700, 706, 710, 716, 718, 722, 723, 724, 728, 735, 753, 757, 760, 768, 769, 772, 773, 783, 797, 807, 808, 809, 810, 812, 817, 829, 832, 833, 838, 856, 857, 860, 869, 871, 873, 877, 881, 882, 891, 895, 896, 903, 904, 906].includes(id)) {
    const { prepareRosterData } = await import('../../js/battlesim/roster-data.js');
    await prepareRosterData(id);
  }
  const { loadBattleSimTranslations } = await import('../../js/i18n/battlesim.js');
  await loadBattleSimTranslations(id);
  const mod = await import(`../../js/battlesim/battlesim${id}.js`);
  await mod.loadData?.();
  if (!_initialized.has(id)) {
    const init = mod.init;
    if (typeof init !== 'function') throw new Error(`Battle sim ${id} has no mobile init export`);
    init();
    prepareBattleSimLayout(simulatorOverlay(document, id));
    _initialized.add(id);
  }
  document.getElementById(_triggerButtonId(id))?.click();
  // A journey may have arrived on desktop before this panel was ever opened.
  const core = await import('../../js/core/state.js');
  const run = core.currentPlaythrough();
  if (run?.openWorldPendingCharacter?.bookId === id) {
    const { applyPendingSimulatorCharacter } = await import('../../js/battlesim/travel-character.js');
    if (core.currentBookId === id && core.currentPlaythrough() === run && applyPendingSimulatorCharacter(run, id)) {
      mod.render?.();
      await core.saveState();
    }
  }
}
