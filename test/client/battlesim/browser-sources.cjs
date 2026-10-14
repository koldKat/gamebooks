// Include extracted book modules when fingerprinting simulator browser checks.
const fs = require('node:fs');
const path = require('node:path');

module.exports = function browserSources(files) {
  const result = new Set([...files, __filename]);
  for (const file of files) {
    const match = file.replaceAll('\\', '/').match(/(?:^|\/)public\/js\/battlesim\/battlesim(\d+)\.js$/);
    if (!match) continue;
    const directory = path.join(path.dirname(file), 'books', match[1]);
    if (!fs.existsSync(directory)) continue;
    for (const name of fs.readdirSync(directory)) {
      if (name.endsWith('.js')) result.add(path.join(directory, name));
    }
  }
  return [...result].sort();
};
