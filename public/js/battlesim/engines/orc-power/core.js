const copy = value => structuredClone(value);
const attackKinds = new Set(['melee', 'shoot', 'throw']);
const markers = new Set(['none', 'sword', 'shield', 'crossbow', 'axe', 'life', 'star', 'death']);

function marker(value) {
  if (!markers.has(value)) throw new RangeError('Invalid map marker');
  return value;
}

function integer(value, minimum = 0, maximum = 1000000) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError('Invalid combat value');
  }
  return value;
}

export function orcStat(value) {
  if (typeof value === 'number') return { base: integer(value), sides: 0 };
  if (!value || typeof value !== 'object') throw new RangeError('A resolved stat is required');
  const base = integer(value.base), sides = integer(value.sides, 0, 10);
  if (![0, 6, 8, 10].includes(sides)) throw new RangeError('Unsupported source die');
  return { base, sides };
}

export function rollOrcStat(value, roll = sides => Math.floor(Math.random() * sides) + 1) {
  const stat = orcStat(value);
  return stat.base + (stat.sides ? integer(roll(stat.sides), 1, stat.sides) : 0);
}

export function createOrcFigure(value, roll) {
  if (!value || typeof value.id !== 'string' || !value.id.trim()
      || !['player', 'enemy'].includes(value.side)) throw new RangeError('Invalid figure');
  const result = { id: value.id, side: value.side,
    attack: orcStat(value.attack), defence: orcStat(value.defence), shooting: orcStat(value.shooting),
    damage: rollOrcStat(value.damage, roll), maxLife: rollOrcStat(value.life, roll),
    armour: integer(value.armour ?? 0, -1000000), weaponAttack: integer(value.weaponAttack ?? 0, -1000000),
    weaponShooting: integer(value.weaponShooting ?? 0, -1000000),
    weaponDamage: integer(value.weaponDamage ?? 0),
    magicPower: orcStat(value.magicPower === undefined ? 0 : value.magicPower),
    magicDamage: rollOrcStat(value.magicDamage === undefined ? 0 : value.magicDamage, roll),
    thrown: false, removed: false, petrified: false, exchanges: 0, struckTargets: [], elemental: !!value.elemental };
  integer(result.maxLife, 1);
  result.life = value.currentLife === undefined ? result.maxLife : integer(value.currentLife, 0, result.maxLife);
  return result;
}

function alive(figure) { return figure.life > 0 && !figure.removed; }
function finish(fight) {
  if (!fight.figures.some(figure => figure.side === 'player' && alive(figure))) fight.status = 'loss';
  else if (!fight.figures.some(figure => figure.side === 'enemy' && alive(figure))) fight.status = 'win';
  return fight;
}

export function startOrcFight(figures, firstId, { mode = 'tactical' } = {}) {
  if (!Array.isArray(figures) || figures.length < 2 || figures.length > 100) throw new RangeError('Invalid figures');
  if (!['strategic', 'tactical'].includes(mode)) throw new RangeError('Invalid combat mode');
  const fighters = copy(figures);
  if (new Set(fighters.map(figure => figure.id)).size !== fighters.length) throw new RangeError('Duplicate figure');
  for (const figure of fighters) {
    orcStat(figure.attack); orcStat(figure.defence); orcStat(figure.shooting); orcStat(figure.magicPower);
    integer(figure.damage); integer(figure.magicDamage); integer(figure.maxLife, 1);
    integer(figure.life, 0, figure.maxLife); integer(figure.armour, -1000000);
    integer(figure.weaponAttack, -1000000); integer(figure.weaponShooting, -1000000);
    integer(figure.weaponDamage);
    integer(figure.exchanges);
    if (!['player', 'enemy'].includes(figure.side)) throw new RangeError('Invalid side');
    figure.exchanges = 0; figure.struckTargets = [];
  }
  if (!fighters.some(figure => figure.id === firstId && alive(figure))) throw new RangeError('Invalid first actor');
  // Figures arrive with game-initialized damage and endurance; starting combat never rerolls them.
  const fight = finish({ rulesVersion: 1, mode, figures: fighters, actorId: firstId,
    actionsLeft: mode === 'strategic' ? 1 : 2, status: 'fighting', turn: 1,
    round: 1, actedIds: [], opponentTemplates: fighters.filter(figure => figure.side === 'enemy')
      .map(figure => figure.template ?? figure.id) });
  if (fight.status !== 'fighting') throw new RangeError('Both sides need surviving figures');
  return fight;
}

function actor(fight, id = fight.actorId) {
  const value = fight.figures.find(figure => figure.id === id);
  if (!value || !alive(value) || value.petrified) throw new RangeError('Unavailable figure');
  return value;
}

function active(fight) {
  if (fight?.rulesVersion !== 1 || fight.status !== 'fighting') throw new RangeError('No active fight');
  integer(fight.actionsLeft, 1, fight.mode === 'strategic' ? 1 : 2);
}

function spend(fight, count) {
  if (fight.actionsLeft < count) throw new RangeError('Not enough actions');
  fight.actionsLeft -= count;
  return finish(fight);
}

export function orcAttack(fight, targetId, { kind = 'melee', legal = false, weaponAvailable = false,
  attackerMarker = 'none', defenderMarker = 'none' } = {}, roll) {
  active(fight);
  marker(attackerMarker); marker(defenderMarker);
  if (!attackKinds.has(kind) || legal !== true || (kind !== 'melee' && !weaponAvailable)) {
    throw new RangeError('Resolve map reach, line of sight and weapon eligibility first');
  }
  const next = copy(fight), attacker = actor(next), defender = actor(next, targetId);
  if (attacker.side === defender.side || (kind === 'throw' && attacker.thrown)) throw new RangeError('Invalid target or weapon');
  if (attacker.elemental && kind !== 'melee') throw new RangeError('Elemental cards have no ranged weapons');
  const attack = rollOrcStat(kind === 'melee' ? attacker.attack : attacker.shooting, roll)
    + (kind === 'melee' ? attacker.weaponAttack : attacker.weaponShooting);
  const terrainDefence = defenderMarker === 'shield' ? 4
    : defenderMarker === 'crossbow' && kind !== 'melee' ? 2 : 0;
  const defence = rollOrcStat(defender.defence, roll) + defender.armour + terrainDefence;
  const hit = attack >= defence, damage = hit ? attacker.damage + attacker.weaponDamage
    + (attackerMarker === 'axe' ? 2 : 0) : 0;
  defender.life = Math.max(0, defender.life - damage);
  attacker.exchanges++; defender.exchanges++;
  if (!attacker.struckTargets.includes(defender.id)) attacker.struckTargets.push(defender.id);
  if (kind === 'throw') {
    attacker.thrownLoadout = { weaponAttack: attacker.weaponAttack,
      weaponShooting: attacker.weaponShooting, weaponDamage: attacker.weaponDamage };
    attacker.thrown = true;
    attacker.weaponAttack = 0; attacker.weaponShooting = 0; attacker.weaponDamage = 0;
  }
  spend(next, 1);
  return { fight: next, attack, defence, hit, damage };
}

export function recoverOrcWeapons(fight) {
  if (fight?.rulesVersion !== 1 || fight.status !== 'win') throw new RangeError('Recover weapons only after victory');
  const next = copy(fight);
  for (const figure of next.figures) {
    if (figure.side !== 'player' || !figure.thrownLoadout) continue;
    const equipment = figure.thrownLoadout;
    figure.weaponAttack = integer(equipment.weaponAttack, -1000000);
    figure.weaponShooting = integer(equipment.weaponShooting, -1000000);
    figure.weaponDamage = integer(equipment.weaponDamage);
    figure.thrown = false;
    delete figure.thrownLoadout;
  }
  return next;
}

export function orcMove(fight, { legal = false, leave = false } = {}) {
  active(fight);
  if (legal !== true || fight.mode === 'strategic') throw new RangeError('Movement requires a legal tactical map action');
  const next = copy(fight), figure = actor(next);
  if (figure.elemental) throw new RangeError('An elemental card remains on its original map fields');
  if (leave && next.figures.some(enemy => enemy.side !== figure.side && alive(enemy)
      && enemy.elemental && (!enemy.struckTargets.includes(figure.id)
        || !figure.struckTargets.includes(enemy.id)))) throw new RangeError('Exchange blows with the elemental before escaping');
  if (leave) figure.removed = true;
  return spend(next, 1);
}

export function nextOrcTurn(fight, id) {
  const previous = fight?.figures?.find(figure => figure.id === fight.actorId);
  if (fight?.rulesVersion !== 1 || fight.status !== 'fighting'
      || (fight.actionsLeft !== 0 && previous && alive(previous) && !previous.petrified)) {
    throw new RangeError('Finish both actions before changing actor');
  }
  const next = copy(fight);
  actor(next, id);
  const acted = new Set(next.actedIds);
  acted.add(next.actorId);
  const eligible = next.figures.filter(figure => alive(figure) && !figure.petrified);
  if (eligible.every(figure => acted.has(figure.id))) {
    acted.clear(); next.round++;
  }
  if (acted.has(id)) throw new RangeError('This figure has already acted in this round');
  next.actedIds = [...acted];
  next.actorId = id; next.actionsLeft = next.mode === 'strategic' ? 1 : 2; next.turn++;
  return next;
}

export function orcMagic(fight, targets, { modifier, damage, legal = false, targetMarkers = {} } = {}, roll) {
  active(fight);
  const cost = fight.mode === 'strategic' ? 1 : 2;
  if (fight.actionsLeft !== cost || legal !== true || !Array.isArray(targets) || !targets.length
      || new Set(targets).size !== targets.length) throw new RangeError('Resolve eligible spell targets and both actions first');
  integer(modifier, -1000000); integer(damage);
  if (!targetMarkers || Array.isArray(targetMarkers)
      || Object.keys(targetMarkers).some(id => !targets.includes(id))) throw new RangeError('Invalid spell markers');
  Object.values(targetMarkers).forEach(marker);
  const next = copy(fight), caster = actor(next);
  const power = rollOrcStat(caster.magicPower, roll) + modifier;
  const results = targets.map(id => {
    const target = next.figures.find(figure => figure.id === id);
    if (!target || !alive(target)) throw new RangeError('Invalid spell target');
    const defence = rollOrcStat(target.defence, roll) + target.armour
      + (targetMarkers[id] === 'crossbow' ? 2 : 0);
    const hit = power > defence;
    if (hit) target.life = Math.max(0, target.life - damage);
    return { id, power, defence, hit, damage: hit ? damage : 0 };
  });
  // Area spells affect allies too. Non-damage spell effects require their own explicit operation.
  spend(next, cost);
  return { fight: next, results };
}

export function adjustOrcFigure(figure, changes) {
  const stats = new Set(['attack', 'defence', 'shooting', 'magicPower']);
  const numbers = new Set(['damage', 'magicDamage', 'life', 'maxLife', 'armour',
    'weaponAttack', 'weaponShooting', 'weaponDamage']);
  const flags = new Set(['petrified', 'removed']);
  if (!changes || Array.isArray(changes) || typeof changes !== 'object') throw new RangeError('Invalid adjustment');
  const next = copy(figure);
  for (const [key, value] of Object.entries(changes)) {
    if (stats.has(key)) next[key] = orcStat(value);
    else if (numbers.has(key)) next[key] = integer(value,
      ['armour', 'weaponAttack', 'weaponShooting'].includes(key) ? -1000000 : key === 'maxLife' ? 1 : 0);
    else if (flags.has(key) && typeof value === 'boolean') next[key] = value;
    else if (key === 'side' && ['player', 'enemy'].includes(value)) next.side = value;
    else throw new RangeError('Invalid adjustment field');
  }
  integer(next.life, 0, next.maxLife);
  return next;
}

// Map/card effects are entered explicitly where the scan does not resolve their implementation.
export function adjustOrcFightFigure(fight, id, changes) {
  if (fight?.rulesVersion !== 1 || fight.status !== 'fighting') throw new RangeError('No active fight');
  const next = copy(fight), index = next.figures.findIndex(figure => figure.id === id);
  if (index === -1) throw new RangeError('Unknown figure');
  next.figures[index] = adjustOrcFigure(next.figures[index], changes);
  return finish(next);
}
