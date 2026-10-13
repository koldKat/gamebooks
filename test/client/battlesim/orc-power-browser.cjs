const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const root = process.env.TMPDIR;
assert.ok(root && root !== '/tmp', 'Set TMPDIR to the external audit scratch directory');
const chromium = process.env.CHROMIUM;
assert.ok(chromium && fs.existsSync(chromium), 'Set CHROMIUM to a headless Chromium binary');
const scratch = fs.mkdtempSync(path.join(root, 'orc-power-panel-'));
const css = ['equipment','battlesim'].map(name => fs.readFileSync('public/css/' + name + '.css', 'utf8')).join('\n');
const source = fs.readFileSync(__dirname + '/orc-power-panel.fixture', 'utf8').replaceAll('REPO', 'file://' + process.cwd());
try {
  const file = path.join(scratch, 'panel.html');
  fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${css}body{margin:0;background:#111827;color:#ddd}</style><div id="buttons"></div><script type="module">${source}</script>`);
  const results = [];
  for (const width of [320,390,1100]) {
    const output = execFileSync('nice', ['-n','10',chromium,'--no-sandbox','--disable-gpu',
      '--allow-file-access-from-files','--user-data-dir=' + path.join(scratch, 'profile'),
      '--window-size=' + width + ',900','--virtual-time-budget=10000','--dump-dom','file://' + file],
    { encoding:'utf8', maxBuffer:2 * 1024 * 1024, stdio:['ignore','pipe','pipe'] });
    const match = output.match(/data-test="([^"]+)"/);
    assert.ok(match, output.match(/data-failure="([^"]+)"/)?.[1] ?? 'Browser failed without a receipt');
    results.push(JSON.parse(match[1].replaceAll('&quot;', '"')));
  }
  const paths = ['core','game','fields','roster','panel'].map(name => 'public/js/battlesim/engines/orc-power/' + name + '.js')
    .concat(['public/js/i18n/en/battlesim/battlesim654.js','public/js/i18n/bg/battlesim/battlesim654.js','public/css/battlesim.css']);
  const hashes = Object.fromEntries(paths.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  if (process.env.RECEIPT) fs.writeFileSync(process.env.RECEIPT, JSON.stringify({ status:'isolated-draft-panel-check', hashes, results }, null, 2));
  console.log(JSON.stringify(results));
} finally { fs.rmSync(scratch, { recursive:true, force:true }); }
