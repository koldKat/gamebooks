// battlesim-dispatch.js - Mobile's bookId -> battle-sim lookup.
//
// Every battlesim*.js module already exports an init function that builds
// its own overlay + a trigger button (id "simNNN-btn", or "battlesim-btn"/
// "sim8-btn" for the two oldest ones) via getPlayBtnRow() - see charsheet.js,
// which now falls back to #m-sim-btn-row (a hidden sink in mobile/index.html)
// when #main-screen doesn't exist. Rather than needing each file's actual
// "open" function name (not perfectly uniform across the 21 files), this
// just clicks that already-wired trigger button once init has run - same
// click path the desktop button itself uses, guaranteed to match.
//
// One entry per book that has a sim. Add one line here when a new
// battlesim*.js ships - nothing else on the mobile side needs touching.
const SIMS = {
  8:   { path: '../../js/battlesim/battlesim8.js?v=1462',   init: 'initBattleSim8', btn: 'sim8-btn' },
  186: { path: '../../js/battlesim/battlesim186.js?v=1462',  init: 'initSim186',     btn: 'sim186-btn' },
  198: { path: '../../js/battlesim/battlesim198.js?v=1462',  init: 'initSim198',     btn: 'sim198-btn' },
  199: { path: '../../js/battlesim/battlesim199.js?v=1462',  init: 'initSim199',     btn: 'sim199-btn' },
  200: { path: '../../js/battlesim/battlesim200.js?v=1462',  init: 'initSim200',     btn: 'sim200-btn' },
  201: { path: '../../js/battlesim/battlesim201.js?v=1462',  init: 'initSim201',     btn: 'sim201-btn' },
  202: { path: '../../js/battlesim/battlesim202.js?v=1462',  init: 'initSim202',     btn: 'sim202-btn' },
  203: { path: '../../js/battlesim/battlesim203.js?v=1462',  init: 'initSim203',     btn: 'sim203-btn' },
  204: { path: '../../js/battlesim/battlesim204.js?v=1462',  init: 'initSim204',     btn: 'sim204-btn' },
  205: { path: '../../js/battlesim/battlesim205.js?v=1462',  init: 'initSim205',     btn: 'sim205-btn' },
  206: { path: '../../js/battlesim/battlesim206.js?v=1462',  init: 'initSim206',     btn: 'sim206-btn' },
  207: { path: '../../js/battlesim/battlesim207.js?v=1462',  init: 'initSim207',     btn: 'sim207-btn' },
  208: { path: '../../js/battlesim/battlesim208.js?v=1462',  init: 'initSim208',     btn: 'sim208-btn' },
  209: { path: '../../js/battlesim/battlesim209.js?v=1462',  init: 'initSim209',     btn: 'sim209-btn' },
  210: { path: '../../js/battlesim/battlesim210.js?v=1462',  init: 'initSim210',     btn: 'sim210-btn' },
  211: { path: '../../js/battlesim/battlesim211.js?v=1462',  init: 'initSim211',     btn: 'sim211-btn' },
  212: { path: '../../js/battlesim/battlesim212.js?v=1462',  init: 'initSim212',     btn: 'sim212-btn' },
  213: { path: '../../js/battlesim/battlesim213.js?v=1462',  init: 'initSim213',     btn: 'sim213-btn' },
  214: { path: '../../js/battlesim/battlesim214.js?v=1462',   init: 'initSim214',     btn: 'sim214-btn' },
  215: { path: '../../js/battlesim/battlesim215.js?v=1462',   init: 'initSim215',     btn: 'sim215-btn' },
  286: { path: '../../js/battlesim/battlesim286.js?v=1462',  init: 'initSim286',     btn: 'sim286-btn' },
  829: { path: '../../js/battlesim/battlesim829.js?v=1462', init: 'initBattleSim',  btn: 'battlesim-btn' },
};

export function hasSim(bookId) {
  return Object.prototype.hasOwnProperty.call(SIMS, bookId);
}

const _initialized = new Set();

export async function openSimForBook(bookId) {
  const entry = SIMS[bookId];
  if (!entry) return;
  const mod = await import(entry.path);
  if (!_initialized.has(bookId)) {
    mod[entry.init]();
    _initialized.add(bookId);
  }
  document.getElementById(entry.btn)?.click();
}
