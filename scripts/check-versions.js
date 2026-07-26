#!/usr/bin/env node
// Run from project root: node check-versions.js
// Scans public/js/*.js for versioned imports and reports any module
// imported at more than one version (split-module bug waiting to happen).

const fs   = require('fs');
const path = require('path');

const dir   = path.join(__dirname, '..', 'public/js');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

// module name → Map<version, Set<importer>>
const seen = new Map();

for (const file of files) {
  const src = fs.readFileSync(path.join(dir, file), 'utf8');
  for (const m of src.matchAll(/from\s+['"]\.\/([^'"?]+\.js)\?v=(\d+)['"]/g)) {
    const [, mod, ver] = m;
    if (!seen.has(mod)) seen.set(mod, new Map());
    const vmap = seen.get(mod);
    if (!vmap.has(ver)) vmap.set(ver, new Set());
    vmap.get(ver).add(file);
  }
}

let ok = true;
for (const [mod, vmap] of [...seen].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (vmap.size > 1) {
    ok = false;
    console.log(`\nMISMATCH: ${mod}`);
    for (const [ver, importers] of [...vmap].sort((a, b) => Number(a[0]) - Number(b[0]))) {
      console.log(`  v${ver}: ${[...importers].join(', ')}`);
    }
  }
}

if (ok) {
  console.log('All versioned imports are consistent.');
} else {
  process.exit(1);
}
