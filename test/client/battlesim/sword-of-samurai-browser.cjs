const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = process.env.TMPDIR, chromium = process.env.CHROMIUM;
if (!root || !fs.existsSync(root) || !chromium || !fs.existsSync(chromium)) {
  throw Error('Set TMPDIR to the audit scratch directory and CHROMIUM to a headless Chromium executable');
}
const checkBrowser = require('./browser-harness.cjs');
const repo = process.cwd();
const fixturePath = 'test/client/battlesim/sword-of-samurai-integration.fixture';
const styles = ['style', 'charsheet', 'equipment', 'battlesim', 'confirm'];
const files = [fixturePath, __filename, 'test/client/battlesim/browser-harness.cjs', 'public/js/battlesim/loader.js', 'public/mobile/js/battlesim-dispatch.js',
  'public/js/battlesim/battlesim672.js', 'public/js/core/state.js', 'public/js/core/util.js',
  ...['panel', 'core', 'character', 'roster'].map(name => 'public/js/battlesim/engines/sword-of-samurai/' + name + '.js'),
  'public/js/i18n/en/battlesim/battlesim672.js', ...styles.map(name => 'public/css/' + name + '.css')];
const hashes = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const receipt = root + '/672-integrated-browser-verification.json';
if (fs.existsSync(receipt) && JSON.stringify(JSON.parse(fs.readFileSync(receipt)).hashes) === JSON.stringify(hashes)) {
  console.log(JSON.stringify({ cached: true, bookId: 672 })); process.exit(0);
}
const scratch = fs.mkdtempSync(path.join(root, '672-integration-'));
(async () => {
  try {
    const results = [];
    for (const mode of ['desktop', 'mobile']) {
      const file = path.join(scratch, mode + '.html');
      const fixture = fs.readFileSync(fixturePath, 'utf8').replaceAll('REPO', 'file://' + repo).replaceAll('MODE', mode);
      const links = styles.map(name => `<link rel="stylesheet" href="file://${repo}/public/css/${name}.css">`).join('');
      fs.writeFileSync(file, `<!doctype html><meta charset="utf-8">${links}<div id="${mode === 'mobile' ? 'm-sim-btn-row' : 'main-screen'}"></div><div id="inv-overlay"></div><script>addEventListener('error',e=>document.body.setAttribute('data-failure',e.message));addEventListener('unhandledrejection',e=>document.body.setAttribute('data-failure',String(e.reason)));</script><script type="module">${fixture}</script>`);
      for (const width of [320, 390, 1100]) {
        const result = await checkBrowser({ file, profile: path.join(scratch, mode + '-' + width), root, width, chromium });
        results.push(result); console.log(JSON.stringify(result));
      }
    }
    fs.writeFileSync(receipt, JSON.stringify({ bookId: 672, status: 'REAL-MODULE-INTEGRATION-PASSED-STATE-API-INTERCEPTED-NOT-LIVE-API', hashes, results, productionWrites: 0 }, null, 2) + '\n');
  } finally { fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
