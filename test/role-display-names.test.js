'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function source(file) {
  return fs.readFileSync(file, 'utf8').replace(/^import .*;\n/gm, '').replace(/\bexport /g, '');
}
test('player and admin badges show only the gamebook role names', () => {
  const player = vm.createContext({ getUsername: () => 'Tester' });
  vm.runInContext(source('public/js/account/user.js'), player);
  player.registerAuthor('Tester', true); player.registerContributor('Tester', true); player.registerModerator('Tester', true);
  const admin = vm.createContext({ document: { getElementById: () => ({ addEventListener() {} }), addEventListener() {} } }); vm.runInContext(source('admin/js/core.js'), admin);
  for (const [fn, role] of [['adminBadge', 'Game Master'], ['moderatorBadge', 'Lorekeeper'], ['contributorBadge', 'Pathmaker'], ['authorBadge', 'Fateweaver']]) {
    for (const html of [player[fn](fn === 'adminBadge' ? true : 'Tester'), admin[fn](true)]) {
      assert.ok(html.includes(`data-tooltip="${role}"`));
      assert.doesNotMatch(html, /data-tooltip="(?:Admin|Moderator|Contributor|Author)"/);
    }
  }
});
test('historical role notifications render current names instead of stored legacy labels', () => {
  const elements = new Map();
  const getElementById = id => {
    if (!elements.has(id)) elements.set(id, { style: {}, innerHTML: '', classList: { remove() {} } });
    return elements.get(id);
  };
  const context = vm.createContext({ document: { getElementById }, window: { innerWidth: 1000 },
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  });
  vm.runInContext(source('public/js/community/notif.js'), context);
  const roles = [['admin', 'Game Master'], ['moderator', 'Lorekeeper'], ['contributor', 'Pathmaker'], ['author', 'Fateweaver']];
  context._openNotifDropdown({ getBoundingClientRect: () => ({ bottom: 10, right: 20 }) }, {
    unseen: 0, items: roles.map(([role]) => ({ type: 'role_assigned', seen: true, createdAt: Date.now(), payload: { role, label: role[0].toUpperCase() + role.slice(1) } })),
  });
  const html = getElementById('notif-list').innerHTML;
  for (const [, label] of roles) assert.ok(html.includes(`<strong>${label}</strong>`));
  assert.doesNotMatch(html, /<strong>(Admin|Moderator|Contributor|Author)<\/strong>/);
});
