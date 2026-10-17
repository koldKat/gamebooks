// Lazy battle simulator loader. Keep battle sim modules out of the landing
// bundle; load only the simulator for the book currently opened in play view.

import {prepareBattleSimLayout, simulatorOverlay} from './layout.js';

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
  675, 676, 677, 678, 679, 680, 689, 690, 700, 706, 710, 718, 722, 723, 724, 728, 735, 757, 768, 769, 773, 783, 797, 807, 808, 809, 810, 812, 817, 832, 833, 838, 856,
]);

const _loaded = new Map();
const _loading = new Map();
let _active = null;
let _showSeq = 0;

function _hideActiveBattleSimOnly() {
  _active?.setVisible(false);
  _active = null;
}

async function _loadBattleSim(id) {
  const numericId = Number(id);
  if (!SUPPORTED_BATTLE_SIM_BOOKS.has(numericId)) return null;
  if (_loaded.has(numericId)) return _loaded.get(numericId);
  if (_loading.has(numericId)) return _loading.get(numericId);

  // Concurrent requests must share initialization, not just the module import.
  const pending = (async () => {
    const { loadBattleSimTranslations } = await import('../i18n/battlesim.js');
    await loadBattleSimTranslations(numericId);
    const mod = await import(`./battlesim${numericId}.js`);
    const sim = { init: mod.init, render: mod.render, setVisible: mod.setVisible };
    if (typeof sim.init !== 'function' ||
        typeof sim.render !== 'function' ||
        typeof sim.setVisible !== 'function') {
      throw new Error(`Battle sim ${numericId} has an invalid export shape`);
    }
    sim.init();
    prepareBattleSimLayout(simulatorOverlay(document, numericId));
    _loaded.set(numericId, sim);
    return sim;
  })();
  _loading.set(numericId, pending);
  try {
    return await pending;
  } finally {
    _loading.delete(numericId);
  }
}

export function hideActiveBattleSim() {
  _showSeq++;
  _hideActiveBattleSimOnly();
}

export async function showBattleSimForBook(bookId) {
  const seq = ++_showSeq;
  const numericId = Number(bookId);
  if (_active?.id !== numericId) _hideActiveBattleSimOnly();
  let sim = null;
  try {
    sim = await _loadBattleSim(numericId);
  } catch (err) {
    console.warn(`Battle sim ${numericId} failed to load`, err);
    return;
  }
  if (seq !== _showSeq) return;
  if (!sim) return;
  sim.id = numericId;
  _active = sim;
  sim.setVisible(true);
  sim.render();
}

export function renderActiveBattleSim() {
  _active?.render();
}
