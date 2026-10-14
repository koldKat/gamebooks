const fs = require('node:fs'), Module = require('node:module');
let source = fs.readFileSync(__dirname + '/sword-of-samurai-browser.cjs', 'utf8')
  .replaceAll('sword-of-samurai', 'fabled-lands').replaceAll('672', '674')
  .replace("['panel', 'core', 'character', 'roster']", "['panel', 'core', 'character', 'roster', 'navigation']");
const child = new Module(__filename, module);
child.filename = __filename; child.paths = module.paths; child._compile(source, __filename);
