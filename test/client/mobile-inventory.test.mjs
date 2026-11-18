import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../public/mobile/js/items/model.js', import.meta.url), 'utf8');
const { addMobileItem, moveMobileItem, inventorySlots, equipmentSlot } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('mobile additions merge matching stacks without overwriting desktop labels or visibility', () => {
  const run = { inventory: [{ itemId: 1, qty: 2, label: 'My sword', note: 'enchanted', visible: true }] };
  assert.ok(addMobileItem(run, 1));
  assert.ok(addMobileItem(run, 1));
  assert.equal(run.inventory[0].qty, 2);
  assert.equal(run.inventory[0].label, 'My sword');
  assert.equal(run.inventory[1].qty, 2);
  assert.equal(run.inventory[1].visible, false);
});

test('equipping swaps whole stacks and retains each item metadata and visibility', () => {
  const run = {
    inventory: [{ itemId: 1, qty: 3, label: 'Arrows', note: 'silver', visible: true }],
    equipment: { primary: { itemId: 2, qty: 2, label: 'Bow', note: 'oak' } },
    equipmentVisible: { primary: false }, path: [1, 2], completed: false,
  };
  assert.ok(moveMobileItem(run, { kind: 'inventory', index: 0 }, { kind: 'equipment', key: 'primary' }));
  assert.deepEqual(run.equipment.primary, { itemId: 1, qty: 3, label: 'Arrows', note: 'silver' });
  assert.equal(run.equipmentVisible.primary, true);
  assert.equal(run.inventory[0].itemId, 2);
  assert.equal(run.inventory[0].qty, 2);
  assert.equal(run.inventory[0].visible, false);
  assert.deepEqual(run.path, [1, 2]);
});

test('full inventory safely rejects unequipping, while a full-inventory equipment swap succeeds', () => {
  const run = { inventory: Array.from({ length: 40 }, (_, i) => i + 1), equipment: { head: 90 }, equipmentVisible: { head: true } };
  const before = JSON.stringify(run);
  assert.equal(moveMobileItem(run, { kind: 'equipment', key: 'head' }, { kind: 'inventory', index: 0 }), false);
  assert.equal(JSON.stringify(run), before);
  assert.equal(addMobileItem(run, 91), false);
  assert.equal(JSON.stringify(run), before);
  assert.ok(moveMobileItem(run, { kind: 'inventory', index: 0 }, { kind: 'equipment', key: 'head' }));
  assert.equal(run.inventory.length, 40);
  assert.equal(run.equipment.head.itemId, 1);
  assert.equal(run.inventory.at(-1).itemId, 90);
});

test('equipment swaps, unequipping and inventory reordering preserve all item counts', () => {
  const run = { inventory: [3, 4], equipment: { head: 1, chest: 2 }, equipmentVisible: { head: true } };
  assert.ok(moveMobileItem(run, { kind: 'equipment', key: 'head' }, { kind: 'equipment', key: 'chest' }));
  assert.equal(equipmentSlot(run, 'chest').itemId, 1);
  assert.equal(equipmentSlot(run, 'chest').visible, true);
  assert.equal(equipmentSlot(run, 'head').itemId, 2);
  assert.ok(moveMobileItem(run, { kind: 'equipment', key: 'chest' }, { kind: 'inventory', index: 1 }));
  assert.deepEqual(inventorySlots(run).map(item => item.itemId), [3, 1, 4]);
  assert.ok(moveMobileItem(run, { kind: 'inventory', index: 2 }, { kind: 'inventory', index: 0 }));
  assert.deepEqual(inventorySlots(run).map(item => item.itemId), [4, 3, 1]);
  assert.equal(equipmentSlot(run, 'chest'), null);
});

test('completed runs cannot be altered by mobile inventory controls', () => {
  const run = { completed: true, inventory: [1], equipment: { head: 2 } };
  const before = JSON.stringify(run);
  assert.equal(addMobileItem(run, 1), false);
  assert.equal(moveMobileItem(run, { kind: 'inventory', index: 0 }, { kind: 'equipment', key: 'head' }), false);
  assert.equal(moveMobileItem(run, { kind: 'inventory', index: 0 }, { kind: 'trash' }), false);
  assert.equal(JSON.stringify(run), before);
});

test('mobile inventory trash removes only the dragged stack and preserves equipped gear', () => {
  const run = { inventory: [{ itemId: 1, qty: 3, label: 'Arrows', note: 'silver', visible: true }, 2], equipment: { head: 3 }, equipmentVisible: { head: true } };
  const before = JSON.stringify(run);
  assert.equal(moveMobileItem(run, { kind: 'equipment', key: 'head' }, { kind: 'trash' }), false);
  assert.equal(JSON.stringify(run), before);
  assert.ok(moveMobileItem(run, { kind: 'inventory', index: 0 }, { kind: 'trash' }));
  assert.deepEqual(inventorySlots(run).map(item => item.itemId), [2]);
  assert.deepEqual(run.equipment, { head: 3 });
  assert.deepEqual(run.equipmentVisible, { head: true });
});
