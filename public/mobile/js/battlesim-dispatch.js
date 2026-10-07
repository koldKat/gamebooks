// Mobile battle-sim dispatcher. Mirrors desktop's lazy loading: no battle sim
// module is imported until the reader opens the simulator for the current book.

const SUPPORTED_BATTLE_SIM_BOOKS = new Set([
  8, 78, 80, 82, 83, 86, 92, 107, 108, 114, 115, 118, 122, 123, 130, 135, 161,
  186, 193, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210,
  211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225,
  226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240,
  241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255,
  256, 257, 258, 259, 260, 263, 264, 267, 272, 273, 274, 275, 276, 278, 279,
  280, 286, 317, 318, 319, 320, 321, 322, 323, 324, 325, 370, 375, 376, 377,
  378, 397, 398, 399, 412, 414, 415, 416, 430, 431, 432, 433, 434, 435, 436, 437,
  438, 439, 440, 441, 462, 464, 465, 468, 526, 541, 661, 696, 716, 734, 739,
  740, 753, 760, 772, 781, 829, 869, 871, 877, 881, 882, 400, 401, 402, 481,
  491, 486, 521,
]);

const _initialized = new Set();

function _initExportName(bookId) {
  if (bookId === 829) return 'initBattleSim';
  if (bookId === 8) return 'initBattleSim8';
  return `initSim${bookId}`;
}

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

  const { loadBattleSimTranslations } = await import('../../js/i18n/battlesim.js');
  await loadBattleSimTranslations(id);
  const mod = await import(`../../js/battlesim/battlesim${id}.js`);
  if (!_initialized.has(id)) {
    const init = mod[_initExportName(id)];
    if (typeof init !== 'function') throw new Error(`Battle sim ${id} has no mobile init export`);
    init();
    _initialized.add(id);
  }
  document.getElementById(_triggerButtonId(id))?.click();
}
