const fs = require('node:fs'), Module = require('node:module');
let source = fs.readFileSync(__dirname + '/sword-of-samurai-browser.cjs', 'utf8')
  .replaceAll('sword-of-samurai', 'fabled-lands').replaceAll('672', '674')
  .replace("['panel', 'core', 'character', 'roster']", "['panel', 'core', 'character', 'roster', 'navigation']");
if (process.argv.includes('--cities-of-gold')) {
  source = source.replaceAll('674', '675')
    .replace('fabled-lands-integration.fixture', 'cities-of-gold-integration.fixture')
    .replace("'roster', 'navigation'", "'roster', 'navigation', 'cities-of-gold'");
}
const child = new Module(__filename, module);
child.filename = __filename; child.paths = module.paths; child._compile(source, __filename);
