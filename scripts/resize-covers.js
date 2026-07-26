#!/usr/bin/env node
'use strict';

const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');

const COVERS_DIR = path.join(__dirname, '..', 'public', 'covers');
const MAX_BYTES  = 256 * 1024;
const MAX_DIM    = 900;

const files = fs.readdirSync(COVERS_DIR).filter(f => /\.(jpg|jpeg)$/i.test(f));
let shrunk = 0, skipped = 0;

for (const file of files) {
  const fp   = path.join(COVERS_DIR, file);
  const size = fs.statSync(fp).size;

  if (size <= MAX_BYTES) { skipped++; continue; }

  const sizeMb = (size / 1024 / 1024).toFixed(2);
  process.stdout.write(`  ${file}  (${sizeMb} MB) → `);

  try {
    // Resize to max 900×900 (only shrink), then reduce JPEG quality until under 256 KB.
    // ImageMagick's jpeg:extent handles the quality search automatically.
    execSync(
      `convert ${JSON.stringify(fp)} -resize ${MAX_DIM}x${MAX_DIM}\\> -define jpeg:extent=${MAX_BYTES} ${JSON.stringify(fp)}`,
      { stdio: 'pipe' }
    );
    const newSize = fs.statSync(fp).size;
    console.log(`${(newSize / 1024).toFixed(0)} KB`);
    shrunk++;
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
  }
}

console.log(`\nDone. ${shrunk} resized, ${skipped} already within limit.`);
