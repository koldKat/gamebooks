'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

test('source and size jobs wait for readiness and share one worker through complete exit', async () => {
  const workers = [];
  class FakeWorker extends EventEmitter {
    constructor(file, options) { super(); this.options = options; workers.push(this); }
  }
  const filename = require.resolve('../server/background-stats');
  const context = { module: { exports: {} }, __dirname: path.dirname(filename),
    require: name => name === 'node:worker_threads' ? { Worker: FakeWorker } : require(name) };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context);
  const queue = context.module.exports;
  const first = queue.scan({ kind: 'code' }), second = queue.scan({ kind: 'size' });
  assert.equal(workers.length, 0);
  queue.start(); queue.start();
  assert.equal(workers.length, 1);
  workers[0].emit('message', { linesOfCode: 1 });
  assert.equal(workers.length, 1, 'a result must not start another worker until exit');
  workers[0].emit('exit', 0);
  assert.equal(workers.length, 2);
  assert.equal(workers[1].options.workerData.kind, 'size');
  workers[1].emit('message', 123); workers[1].emit('exit', 0);
  assert.deepEqual(await first, { linesOfCode: 1 });
  assert.equal(await second, 123);
  const failed = queue.scan({ kind: 'code' });
  const recovered = queue.scan({ kind: 'size' });
  const rejected = assert.rejects(failed, /disk failure/);
  workers[2].emit('error', new Error('disk failure')); workers[2].emit('exit', 1);
  workers[3].emit('message', 456); workers[3].emit('exit', 0);
  await rejected; assert.equal(await recovered, 456);
});
