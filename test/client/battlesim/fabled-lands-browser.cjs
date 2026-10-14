const fs = require('node:fs'), Module = require('node:module');
let source = fs.readFileSync(__dirname + '/sword-of-samurai-browser.cjs', 'utf8')
  .replaceAll('sword-of-samurai', 'fabled-lands').replaceAll('672', '674')
  .replace("['panel', 'core', 'character', 'roster']", "['panel', 'core', 'character', 'roster', 'navigation']");
if (process.argv.includes('--cities-of-gold')) {
  source = source.replaceAll('674', '675')
    .replace('fabled-lands-integration.fixture', 'cities-of-gold-integration.fixture')
    .replace("'roster', 'navigation'", "'roster', 'navigation', 'cities-of-gold'");
}
if (process.argv.includes('--blood-dark-sea')) {
  source = source.replaceAll('674', '676')
    .replace('fabled-lands-integration.fixture', 'blood-dark-sea-integration.fixture')
    .replace("'roster', 'navigation'", "'roster', 'navigation', 'blood-dark-sea'");
}
if (process.argv.includes('--howling-darkness')) {
  source = source.replaceAll('674', '677')
    .replace('fabled-lands-integration.fixture', 'howling-darkness-integration.fixture')
    .replace("'roster', 'navigation'", "'roster', 'navigation', 'howling-darkness', 'blood-dark-sea'");
}
if (process.argv.includes('--hidden-faces')) {
  source = source.replaceAll('674', '678')
    .replace('fabled-lands-integration.fixture', 'hidden-faces-integration.fixture')
    .replace("'roster', 'navigation'", "'roster', 'navigation', 'hidden-faces'");
}
if (process.argv.includes('--rising-sun')) {
  source = source.replaceAll('674', '679')
    .replace('fabled-lands-integration.fixture', 'rising-sun-integration.fixture')
    .replace("'roster', 'navigation'", "'roster', 'navigation', 'rising-sun'");
}
const child = new Module(__filename, module);
child.filename = __filename; child.paths = module.paths; child._compile(source, __filename);
