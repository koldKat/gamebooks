'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initializeCollectibles } = require('../server/db/collectibles');
const { initializeCompanionMarket, createCompanionMarket } = require('../server/db/companion-market');
const { createCollectibles } = require('../server/db/collectibles');
const { initializeRubies } = require('../server/db/rubies');
const { runInImpersonationContext } = require('../server/impersonation-context');

function fixture(t) {
  const db = new Database(':memory:'); t.after(() => db.close()); db.pragma('foreign_keys=ON');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,is_admin INTEGER,xp INTEGER,bonus_coins INTEGER DEFAULT 100,coins_spent INTEGER DEFAULT 0);
    INSERT INTO users(id,is_admin,xp) VALUES(1,1,40),(2,1,23),(3,1,0),(4,0,23),(5,1,17);
    INSERT INTO users(id,username,is_admin,xp) VALUES(6,'sashii',0,23);
    CREATE TABLE sale_rewards(user_id INTEGER,event TEXT,ref TEXT,amount INTEGER,UNIQUE(event,ref));`);
  initializeCollectibles(db); initializeCompanionMarket(db);
  db.prepare('INSERT INTO user_collectibles(user_id,item_id,seen_at,claimed_at,claims,quantity) VALUES(?,?,?,?,?,?)')
    .run(1, 'pumpkin', 123, 456, 2, 3);
  const options = {
    computeLevel: xp => xp,
    coinBalance: account => account.bonus_coins - account.coins_spent,
    now: () => 1000,
    awardCoins(id, event, ref, amount) {
      db.prepare('INSERT INTO sale_rewards VALUES(?,?,?,?)').run(id, event, ref, amount);
      db.prepare('UPDATE users SET bonus_coins=bonus_coins+? WHERE id=?').run(amount, id);
      return true;
    },
  };
  return { db, market: createCompanionMarket(db, options), options,
    quantity: id => db.prepare("SELECT quantity FROM user_collectibles WHERE user_id=? AND item_id='pumpkin'").get(id)?.quantity || 0 };
}

test('sashii can test trading and single-copy counts without administrator privileges', t => {
  const { db, market, quantity } = fixture(t);
  initializeRubies(db);
  const collection = createCollectibles(db);
  assert.equal(collection.canTestCompanions(6), true);
  assert.equal(collection.isAdmin(6), false);
  assert.equal(collection.canTestCompanions(4), false);
  const { listingId } = market.sell(1, 'pumpkin', 'sashii_listing_12345');
  assert.equal(market.buy(6, listingId, 23).ok, true);
  assert.equal(quantity(6), 1);
  assert.equal(market.sell(6, 'pumpkin', 'sashii_last_copy_123').error, 'last_copy');
  db.prepare("UPDATE user_collectibles SET quantity=2 WHERE user_id=6 AND item_id='pumpkin'").run();
  const spare = market.sell(6, 'pumpkin', 'sashii_spare_copy_123');
  assert.equal(spare.ok, true);
  assert.equal(quantity(6), 1);
  assert.equal(market.cancel(6, spare.listingId).ok, true);
  assert.equal(quantity(6), 2);
  runInImpersonationContext(true, () => assert.equal(market.snapshot(6).error, 'unavailable'));
  db.prepare('UPDATE users SET xp=0 WHERE id=6').run();
  const another = market.sell(1, 'pumpkin', 'sashii_level_zero_123');
  assert.equal(market.buy(6, another.listingId, 0).error, 'level_zero');
});

test('listing escrows only spare copies; withdrawal returns exactly one; retries are idempotent', t => {
  const { db, market, quantity } = fixture(t);
  const first = market.sell(1, 'pumpkin', 'first_listing_12345');
  assert.equal(first.ok, true); assert.equal(quantity(1), 2);
  assert.equal(market.sell(1, 'pumpkin', 'first_listing_12345').repeated, true);
  assert.equal(quantity(1), 2);
  const second = market.sell(1, 'pumpkin', 'second_listing_1234');
  assert.equal(quantity(1), 1);
  assert.equal(market.sell(1, 'pumpkin', 'third_listing_12345').error, 'last_copy');
  assert.deepEqual(market.snapshot(1).sellable, []);
  assert.equal(market.cancel(2, first.listingId).error, 'not_found');
  assert.equal(market.cancel(1, first.listingId).ok, true); assert.equal(quantity(1), 2);
  assert.equal(market.cancel(1, first.listingId).repeated, true); assert.equal(quantity(1), 2);
  assert.equal(market.cancel(1, second.listingId).ok, true); assert.equal(quantity(1), 3);
  assert.deepEqual(db.prepare('SELECT seen_at,claimed_at,claims FROM user_collectibles WHERE user_id=1').get(), { seen_at: 123, claimed_at: 456, claims: 2 });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sale_rewards').get().n, 0);
});

test('buyer pays their own current level, seller receives that gold, one listing sells once', t => {
  const { db, market, quantity } = fixture(t);
  const { listingId } = market.sell(1, 'pumpkin', 'first_listing_12345');
  assert.equal(market.snapshot(2).price, 23); assert.equal(market.snapshot(5).price, 17);
  assert.equal(market.buy(2, listingId, 22).error, 'price_changed');
  assert.equal(market.buy(1, listingId, 40).error, 'not_found');
  assert.equal(market.buy(2, listingId, 23).ok, true);
  assert.equal(quantity(1), 2); assert.equal(quantity(2), 1);
  assert.equal(market.snapshot(1).coinsBalance, 123); assert.equal(market.snapshot(2).coinsBalance, 77);
  assert.equal(market.buy(2, listingId, 23).repeated, true);
  assert.equal(market.buy(5, listingId, 17).error, 'unavailable');
  assert.equal(market.cancel(1, listingId).error, 'unavailable');
  assert.equal(market.snapshot(1).coinsBalance, 123); assert.equal(market.snapshot(5).coinsBalance, 100);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sale_rewards').get().n, 1);
});

test('level zero, non-admins and impersonation cannot trade; owned types never appear for purchase', t => {
  const { db, market, quantity } = fixture(t);
  const a = market.sell(1, 'pumpkin', 'first_listing_12345');
  assert.equal(market.buy(3, a.listingId, 0).error, 'level_zero');
  for (const result of [market.snapshot(4), market.sell(4, 'pumpkin', 'other_listing_12345'), market.buy(4, a.listingId, 23), market.cancel(4, a.listingId)])
    assert.equal(result.error, 'unavailable');
  runInImpersonationContext(true, () => {
    assert.equal(market.buy(2, a.listingId, 23).error, 'unavailable');
    assert.equal(market.sell(1, 'pumpkin', 'other_listing_12345').error, 'unavailable');
    assert.equal(market.cancel(1, a.listingId).error, 'unavailable');
  });
  market.buy(2, a.listingId, 23);
  const b = market.sell(1, 'pumpkin', 'second_listing_1234');
  assert.equal(market.snapshot(2).buying.length, 0);
  assert.equal(market.buy(2, b.listingId, 23).error, 'already_owned');
  db.prepare('UPDATE users SET bonus_coins=0 WHERE id=5').run();
  assert.equal(market.buy(5, b.listingId, 17).error, 'insufficient_coins');
  assert.equal(quantity(1), 1); assert.equal(quantity(5), 0);
});

test('failed seller payment rolls ownership, listing and buyer balance back together', t => {
  const { db, market, options, quantity } = fixture(t);
  const { listingId } = market.sell(1, 'pumpkin', 'first_listing_12345');
  const failed = createCompanionMarket(db, { ...options, awardCoins: () => false });
  assert.throws(() => failed.buy(2, listingId, 23), /payment failed/);
  assert.equal(quantity(2), 0); assert.equal(market.snapshot(2).coinsBalance, 100);
  assert.equal(market.snapshot(2).buying.length, 1);
  assert.equal(market.snapshot(1).coinsBalance, 100);
  db.exec("CREATE TRIGGER fail_listing BEFORE INSERT ON companion_listings BEGIN SELECT RAISE(ABORT,'test'); END;");
  assert.throws(() => market.sell(1, 'pumpkin', 'second_listing_1234'), /test/);
  assert.equal(quantity(1), 2);
});

test('invalid requests and stale prices cannot manipulate stock or charges', t => {
  const { db, market, quantity } = fixture(t);
  for (const item of ['__proto__', 'constructor', 'missing']) assert.equal(market.sell(1, item, 'first_listing_12345').error, 'invalid_request');
  assert.equal(market.sell(1, 'pumpkin', 'short').error, 'invalid_request');
  const { listingId } = market.sell(1, 'pumpkin', 'first_listing_12345');
  assert.equal(market.sell(1, 'mummy', 'first_listing_12345').error, 'invalid_request');
  db.prepare('UPDATE users SET xp=24 WHERE id=2').run();
  assert.equal(market.buy(2, listingId, 23).error, 'price_changed');
  assert.equal(market.buy(2, listingId, 24).ok, true);
  assert.equal(market.snapshot(1).coinsBalance, 124);
  assert.equal(quantity(1) + quantity(2), 3);
});

test('purchased companions retain ordinary annual diamond claims without resetting an existing cooldown', t => {
  const { db, market } = fixture(t);
  initializeRubies(db);
  let timestamp = Date.parse('2026-11-17T12:00:00Z');
  const collection = createCollectibles(db, { now: () => timestamp });
  const first = market.sell(1, 'pumpkin', 'first_listing_12345');
  assert.equal(market.buy(2, first.listingId, 23).ok, true);
  assert.equal(collection.claim(2, 'pumpkin'), true);
  assert.equal(collection.claim(2, 'pumpkin'), false);
  timestamp = Date.parse('2027-11-17T11:59:59Z');
  assert.equal(collection.claim(2, 'pumpkin'), false);
  timestamp = Date.parse('2027-11-17T12:00:00Z');
  assert.equal(collection.claim(2, 'pumpkin'), true);
  db.prepare('INSERT INTO user_collectibles(user_id,item_id,seen_at,claimed_at,claims,quantity) VALUES(?,?,?,?,?,0)')
    .run(5, 'pumpkin', timestamp - 1000, timestamp - 1000, 1);
  const second = market.sell(1, 'pumpkin', 'second_listing_1234');
  assert.equal(market.buy(5, second.listingId, 17).ok, true);
  assert.equal(collection.claim(5, 'pumpkin'), false);
  assert.equal(db.prepare("SELECT claimed_at FROM user_collectibles WHERE user_id=5 AND item_id='pumpkin'").get().claimed_at, timestamp - 1000);
});
