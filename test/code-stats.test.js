'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('all code metrics exclude tests and HTML guides', () => {
  const source = fs.readFileSync('server/runtime-state.js', 'utf8');
  const start = source.indexOf('let _codeStats =');
  const end = source.indexOf('function getCodeStats()', start);
  const read = [];
  const context = {
    Buffer,
    fs: {
      readdirSync(dir, options) {
        assert.doesNotMatch(dir, /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)/);
        const entries = fs.readdirSync(dir, options);
        if (dir === 'server') {
          for (const name of ['test', 'tests', '__tests__', 'example.test.js', 'example.spec.mjs']) {
            entries.push({ name, isDirectory: () => !name.includes('.') });
          }
        }
        return entries;
      },
      readFileSync(file, encoding) {
        assert.doesNotMatch(file, /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\./);
        assert.ok(!['public/guide.html', 'admin/admin-guide.html', 'admin/technical.html'].includes(file));
        const content = fs.readFileSync(file, encoding);
        read.push({ file, content });
        return content;
      },
    },
  };
  const stats = vm.runInNewContext(source.slice(start, end) + '\n_codeStats;', context);
  assert.ok(stats.linesOfCode > 0 && stats.codeBytes > 0 && stats.jsModules > 0);
  assert.equal(stats.linesOfCode, read.reduce((n, row) => n + row.content.split('\n').length, 0));
  assert.equal(stats.codeBytes, read.reduce((n, row) => n + Buffer.byteLength(row.content), 0));
  assert.equal(stats.jsModules, read.filter(row => /\.(?:m?js)$/.test(row.file)).length);
  assert.equal(new Set(read.map(row => row.file)).size, read.length);
});
