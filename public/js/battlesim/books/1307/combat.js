// Resolve Mochila's alternating attacks, ammunition and printed encounter exceptions.
const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};
const loadedAmmo = player => player.weapon === 'silverGun' ? player.silverAmmo : player.ammo;
export const canReroll = fight => fight.phase === 'resolve' && !fight.pending.hit
  && !fight.pending.instant && fight.player.bandana && !fight.player.bandanaUsed;
export function parseRange(value) {
  const parts = String(value).trim().split(/[,;]/).map(part => part.trim());
  const values = new Set();
  for (const part of parts) {
    if (!/^\d+(?:\s*[-–]\s*\d+)?$/.test(part)) throw new RangeError('Invalid hit range');
    const [a, b = a] = part.split(/[-–]/).map(Number);
    integer(a, 2, 12); integer(b, a, 12);
    for (let n = a; n <= b; n++) values.add(n);
  }
  return [...values].sort((a, b) => a - b);
}
export function startFight(player, opponent) {
  const p = structuredClone(player), e = structuredClone(opponent);
  integer(p.hp, 1, 1000000); integer(p.attackMin, 2, 12); integer(p.ammo, 0, 6);
  p.silverAmmo ??= 0;
  integer(p.silverAmmo, 0, 6);
  integer(p.reserve, 0, 1000000); integer(e.hp, 1, 1000000); integer(e.damage, 0, 1000000);
  e.hits = parseRange(e.range);
  if (!['gun', 'silverGun', 'knife'].includes(p.weapon)) throw new RangeError('Invalid weapon');
  if (e.knifeOnly) p.weapon = 'knife';
  return {version:1, player:p, opponent:e, round:1, shots:0, phase:'attack', status:'fighting', log:[]};
}
export function validateFight(fight) {
  if (fight?.version !== 1 || !['fighting', 'win', 'loss'].includes(fight.status)
      || !['attack', 'resolve', 'fan', 'enemySetup', 'ended'].includes(fight.phase)) throw new RangeError('Invalid saved combat');
  return fight;
}
function finish(fight, status) {fight.status = status; fight.phase = 'ended'; delete fight.pending;}
function rollDice(roll) {return [integer(roll(), 1, 6), integer(roll(), 1, 6)];}
function playerRoll(fight, roll) {
  const dice = rollDice(roll), total = dice[0] + dice[1], gun = fight.player.weapon !== 'knife';
  const threshold = fight.player.attackMin + (gun ? fight.shots - 1 : 0);
  const instant = gun && !fight.opponent.noInstant && total >= (fight.player.marksman ? 11 : 12);
  fight.pending = {dice, total, hit:total >= threshold, instant, gun};
  fight.phase = 'resolve';
}
function enemyTurn(fight, roll) {
  if (fight.status !== 'fighting') return;
  const e = fight.opponent;
  const melee = e.ammo === 0;
  if (melee && !e.meleeRange) {fight.phase = 'enemySetup'; return;}
  const dice = rollDice(roll), total = dice[0] + dice[1];
  const hits = melee ? parseRange(e.meleeRange ?? e.range) : e.hits;
  const hit = hits.includes(total);
  const damage = hit ? Math.max(0, (melee ? (e.meleeDamage ?? e.damage) : e.damage)
    - (e.supernatural && fight.player.necklace ? 1 : 0)) : 0;
  if (Number.isInteger(e.ammo) && e.ammo > 0) e.ammo--;
  fight.player.hp = Math.max(0, fight.player.hp - damage);
  fight.log.push({side:'enemy', dice, hit, damage, round:fight.round});
  if (!fight.player.hp) finish(fight, 'loss');
  else if (e.maxRounds && fight.round >= e.maxRounds) finish(fight, 'win');
  else {fight.round++; fight.shots = 0; fight.phase = 'attack';}
}
export function combatAction(original, kind, roll = () => 1 + Math.floor(Math.random() * 6), values = {}) {
  const f = structuredClone(validateFight(original));
  if (f.status !== 'fighting') throw new RangeError('Combat ended');
  if (kind === 'setEnemyMelee') {
    if (f.phase !== 'enemySetup') throw new RangeError('Melee setup unavailable');
    parseRange(values.range); integer(values.damage, 0, 1000000);
    f.opponent.meleeRange = values.range; f.opponent.meleeDamage = values.damage;
    enemyTurn(f, roll);
  } else if (kind === 'knife' || kind === 'weapon') {
    if (f.phase !== 'attack' && f.phase !== 'fan') throw new RangeError('Resolve attack first');
    const weapon = kind === 'knife' ? 'knife' : values.weapon;
    if (!['gun', 'silverGun', 'knife'].includes(weapon)) throw new RangeError('Invalid weapon');
    if (f.opponent.knifeOnly && weapon !== 'knife') throw new RangeError('Knife only');
    if (weapon !== 'knife' && !loadedAmmo({...f.player, weapon})) throw new RangeError('No loaded ammunition');
    if (weapon === f.player.weapon) return f;
    f.player.weapon = weapon;
    // Changing weapons after a shot ends this attack, rather than granting another knife strike.
    if (f.phase === 'fan') enemyTurn(f, roll);
  } else if (kind === 'attack') {
    if (!['attack', 'fan'].includes(f.phase)) throw new RangeError('Attack not available');
    if (f.phase === 'fan' && (!f.player.fanning || f.shots >= 3 || !loadedAmmo(f.player))) throw new RangeError('No further shot');
    if (f.player.weapon !== 'knife') {
      if (!loadedAmmo(f.player)) throw new RangeError('No loaded ammunition');
      if (f.player.weapon === 'silverGun') f.player.silverAmmo--;
      else f.player.ammo--;
      f.shots++;
    }
    playerRoll(f, roll);
  } else if (kind === 'reroll') {
    if (f.phase !== 'resolve' || f.pending.hit || f.pending.instant || !f.player.bandana || f.player.bandanaUsed) throw new RangeError('Reroll unavailable');
    f.player.bandanaUsed = true;
    playerRoll(f, roll);
  } else if (kind === 'resolve') {
    if (f.phase !== 'resolve') throw new RangeError('No pending attack');
    const p = f.pending, damage = p.instant ? f.opponent.hp : p.hit ? (p.gun ? f.player.weapon === 'silverGun' ? 9 : 5 : 2) : 0;
    f.opponent.hp = Math.max(0, f.opponent.hp - damage);
    f.log.push({side:'player', dice:p.dice, hit:p.hit || p.instant, damage, instant:p.instant, round:f.round});
    delete f.pending;
    if (f.opponent.hp <= (f.opponent.stopHp ?? 0)) finish(f, 'win');
    else if (p.gun && f.player.fanning && f.shots < 3 && loadedAmmo(f.player)) f.phase = 'fan';
    else {
      enemyTurn(f, roll);
    }
  } else if (kind === 'endTurn') {
    if (f.phase !== 'fan') throw new RangeError('No optional shot');
    enemyTurn(f, roll);
  } else throw new RangeError('Unknown combat action');
  f.log = f.log.slice(-100);
  return f;
}

// Pause only when the player can choose a bandana reroll, including saved fights.
export function playCombatAction(original, kind, roll, values) {
  const next = combatAction(original, kind, roll, values);
  return next.phase === 'resolve' && !canReroll(next)
    ? combatAction(next, 'resolve', roll) : next;
}
