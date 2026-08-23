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
  8:   { path: '../../js/battlesim/battlesim8.js?v=1467',   init: 'initBattleSim8', btn: 'sim8-btn' },
  186: { path: '../../js/battlesim/battlesim186.js?v=1467',  init: 'initSim186',     btn: 'sim186-btn' },
  198: { path: '../../js/battlesim/battlesim198.js?v=1467',  init: 'initSim198',     btn: 'sim198-btn' },
  199: { path: '../../js/battlesim/battlesim199.js?v=1467',  init: 'initSim199',     btn: 'sim199-btn' },
  200: { path: '../../js/battlesim/battlesim200.js?v=1467',  init: 'initSim200',     btn: 'sim200-btn' },
  201: { path: '../../js/battlesim/battlesim201.js?v=1467',  init: 'initSim201',     btn: 'sim201-btn' },
  202: { path: '../../js/battlesim/battlesim202.js?v=1467',  init: 'initSim202',     btn: 'sim202-btn' },
  203: { path: '../../js/battlesim/battlesim203.js?v=1467',  init: 'initSim203',     btn: 'sim203-btn' },
  204: { path: '../../js/battlesim/battlesim204.js?v=1467',  init: 'initSim204',     btn: 'sim204-btn' },
  205: { path: '../../js/battlesim/battlesim205.js?v=1467',  init: 'initSim205',     btn: 'sim205-btn' },
  206: { path: '../../js/battlesim/battlesim206.js?v=1467',  init: 'initSim206',     btn: 'sim206-btn' },
  207: { path: '../../js/battlesim/battlesim207.js?v=1467',  init: 'initSim207',     btn: 'sim207-btn' },
  208: { path: '../../js/battlesim/battlesim208.js?v=1467',  init: 'initSim208',     btn: 'sim208-btn' },
  209: { path: '../../js/battlesim/battlesim209.js?v=1467',  init: 'initSim209',     btn: 'sim209-btn' },
  210: { path: '../../js/battlesim/battlesim210.js?v=1467',  init: 'initSim210',     btn: 'sim210-btn' },
  211: { path: '../../js/battlesim/battlesim211.js?v=1467',  init: 'initSim211',     btn: 'sim211-btn' },
  212: { path: '../../js/battlesim/battlesim212.js?v=1467',  init: 'initSim212',     btn: 'sim212-btn' },
  213: { path: '../../js/battlesim/battlesim213.js?v=1467',  init: 'initSim213',     btn: 'sim213-btn' },
  214: { path: '../../js/battlesim/battlesim214.js?v=1467',   init: 'initSim214',     btn: 'sim214-btn' },
  215: { path: '../../js/battlesim/battlesim215.js?v=1467',   init: 'initSim215',     btn: 'sim215-btn' },
  286: { path: '../../js/battlesim/battlesim286.js?v=1467',  init: 'initSim286',     btn: 'sim286-btn' },
  829: { path: '../../js/battlesim/battlesim829.js?v=1467', init: 'initBattleSim',  btn: 'battlesim-btn' },
  80:  { path: '../../js/battlesim/battlesim80.js?v=1467',  init: 'initSim80',      btn: 'sim80-btn' },
  82:  { path: '../../js/battlesim/battlesim82.js?v=1467',  init: 'initSim82',      btn: 'sim82-btn' },
  83:  { path: '../../js/battlesim/battlesim83.js?v=1467',  init: 'initSim83',      btn: 'sim83-btn' },
  86:  { path: '../../js/battlesim/battlesim86.js?v=1467',  init: 'initSim86',      btn: 'sim86-btn' },
  92:  { path: '../../js/battlesim/battlesim92.js?v=1467',  init: 'initSim92',      btn: 'sim92-btn' },
  108: { path: '../../js/battlesim/battlesim108.js?v=1467', init: 'initSim108',     btn: 'sim108-btn' },
  114: { path: '../../js/battlesim/battlesim114.js?v=1467', init: 'initSim114',     btn: 'sim114-btn' },
  115: { path: '../../js/battlesim/battlesim115.js?v=1467', init: 'initSim115',     btn: 'sim115-btn' },
  118: { path: '../../js/battlesim/battlesim118.js?v=1467', init: 'initSim118',     btn: 'sim118-btn' },
  122: { path: '../../js/battlesim/battlesim122.js?v=1467', init: 'initSim122',     btn: 'sim122-btn' },
  123: { path: '../../js/battlesim/battlesim123.js?v=1467', init: 'initSim123',     btn: 'sim123-btn' },
  130: { path: '../../js/battlesim/battlesim130.js?v=1467', init: 'initSim130',     btn: 'sim130-btn' },
  193: { path: '../../js/battlesim/battlesim193.js?v=1467', init: 'initSim193',     btn: 'sim193-btn' },
  216: { path: '../../js/battlesim/battlesim216.js?v=1467', init: 'initSim216',     btn: 'sim216-btn' },
  217: { path: '../../js/battlesim/battlesim217.js?v=1467', init: 'initSim217',     btn: 'sim217-btn' },
  218: { path: '../../js/battlesim/battlesim218.js?v=1467', init: 'initSim218',     btn: 'sim218-btn' },
  322: { path: '../../js/battlesim/battlesim322.js?v=1467', init: 'initSim322',     btn: 'sim322-btn' },
  323: { path: '../../js/battlesim/battlesim323.js?v=1467', init: 'initSim323',     btn: 'sim323-btn' },
  324: { path: '../../js/battlesim/battlesim324.js?v=1467', init: 'initSim324',     btn: 'sim324-btn' },
  325: { path: '../../js/battlesim/battlesim325.js?v=1467', init: 'initSim325',     btn: 'sim325-btn' },
  430: { path: '../../js/battlesim/battlesim430.js?v=1467', init: 'initSim430',     btn: 'sim430-btn' },
  526: { path: '../../js/battlesim/battlesim526.js?v=1467', init: 'initSim526',     btn: 'sim526-btn' },
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
