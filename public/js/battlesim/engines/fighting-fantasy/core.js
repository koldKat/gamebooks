import {die, rollDice, damageWithLuck} from '../sorcery/core.js';
import {validateOpponents} from '../../opponents.js';

const copy = value => structuredClone(value);
export function integer(value, min = 0, max = 10000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
}
export function validateCharacter(character, alive = false) {
  if (!character) throw new RangeError('No character');
  for (const stat of ['skill', 'stamina', 'luck']) {
    integer(character[stat + 'Initial'], 1);
    integer(character[stat], alive && stat === 'stamina' ? 1 : 0, character[stat + 'Initial']);
  }
  for (const key of ['gold', 'provisions']) integer(character[key]);
  integer(character.attackModifier, -1000, 1000);
  integer(character.nextFightPenalty, -1000, 0);
  integer(character.potionUses, 0, 1);
  if (!['skill', 'strength', 'fortune'].includes(character.potion)) throw new RangeError('Invalid potion');
  if (!character.items || typeof character.items !== 'object' || Object.values(character.items).some(value => typeof value !== 'boolean')) throw new RangeError('Invalid item selection');
  return character;
}
export function newCharacter(defaults, roll) {
  const skill = die(roll) + 6, stamina = rollDice(roll) + 12, luck = die(roll) + 6;
  return {skill, skillInitial:skill, stamina, staminaInitial:stamina, luck, luckInitial:luck,
    gold:defaults.gold, provisions:defaults.provisions, potion:'skill', potionUses:1,
    attackModifier:0, nextFightPenalty:0, items:{}};
}
function requireFight(fight) {
  if (!fight || fight.rulesVersion !== 1 || fight.status !== 'active') throw new RangeError('No active fight');
  validateCharacter(fight.character, true);
}
function finish(fight, status, destination = null) {
  fight.status = status; fight.destination = destination;
  fight.events.push({kind:'outcome', status, destination});
}
function settle(fight) {
  if (fight.pending) return;
  if (!fight.character.stamina) { finish(fight, 'loss'); return; }
  const rule = fight.config;
  if (rule.consecutiveLoss && fight.consecutiveLost >= rule.consecutiveLoss.count) {
    finish(fight, 'routed', rule.consecutiveLoss.destination); return;
  }
  if (rule.surviveRounds && fight.round >= rule.surviveRounds) {
    finish(fight, 'win', rule.win); return;
  }
  while (fight.target < fight.enemies.length && !fight.enemies[fight.target].stamina) fight.target++;
  if (fight.target === fight.enemies.length) {
    const destination = rule.cleanWin && !fight.roundsLost ? rule.cleanWin : rule.win;
    finish(fight, 'win', destination);
  }
}
export function startFight(character, entry, {applyEntry = true, opponents} = {}, roll) {
  validateCharacter(character, true);
  if (typeof applyEntry !== 'boolean') throw new RangeError('Invalid entry setting');
  const config = copy(entry ?? {section:'0', label:'Custom fight', win:null});
  const enemies = validateOpponents(opponents ?? entry?.enemies,
    [{key:'skill',max:10000},{key:'stamina',min:1,max:10000}]).map(enemy => ({...enemy, initialStamina:enemy.stamina}));
  if (entry && enemies.length !== entry.enemies.length) throw new RangeError('Invalid preset group size');
  const fight = {rulesVersion:1, config, enemies, character:copy(character), target:0, round:0,
    roundsLost:0, consecutiveLost:0, lastRoundWon:false, pending:null, events:[], status:'active', destination:null,
    nextFightPenalty:character.nextFightPenalty};
  fight.character.nextFightPenalty = 0;
  if (applyEntry && config.consumeItem) {
    if (!fight.character.items[config.consumeItem]) throw new RangeError('Required potion is unavailable');
    fight.character.items[config.consumeItem] = false;
  }
  if (applyEntry && config.entry) {
    const damage = (config.entry.stamina ?? 0) + (config.entry.dice ? die(roll) : 0);
    fight.character.stamina = Math.max(0, fight.character.stamina - damage);
    fight.character.luck = Math.max(0, fight.character.luck - (config.entry.luck ?? 0));
    fight.events.push({kind:'entry', damage, luck:config.entry.luck ?? 0});
  }
  settle(fight);
  return fight;
}
export function attackModifier(fight, items) {
  const {character, config, round} = fight;
  let modifier = character.attackModifier + fight.nextFightPenalty + (config.attackModifier ?? 0);
  if (round <= (config.openingRounds ?? 0)) modifier += config.openingModifier ?? 0;
  // Weapon alternatives never stack. Encounter-specific weapon rules replace
  // the selected weapon's normal modifier rather than counting it twice.
  const selected = items.filter(item => character.items[item.key] && (!item.onlySection || item.onlySection === config.section)
    && !(config.weaponsDisabled && item.slot === 'weapon'));
  const weaponBonuses = selected.filter(item => item.slot === 'weapon').map(item => item.attackModifier ?? 0);
  if (weaponBonuses.length > 1) throw new RangeError('Choose one weapon');
  modifier += weaponBonuses.length ? Math.max(...weaponBonuses) : 0;
  modifier += selected.filter(item => item.slot !== 'weapon').reduce((sum,item) => sum + (item.attackModifier ?? 0), 0);
  for (const rule of config.itemModifiers ?? []) {
    if (character.items[rule.key]) modifier += rule.openingRounds && round <= rule.openingRounds ? rule.opening : rule.modifier;
  }
  return modifier;
}
function finishRound(fight, roll) {
  if (fight.config.roundDamageDice) {
    const damage = die(roll);
    fight.character.stamina = Math.max(0, fight.character.stamina - damage);
    fight.events.push({kind:'extraDamage', damage});
  }
  settle(fight);
}
export function roundFight(previous, items, roll) {
  requireFight(previous);
  if (previous.pending) throw new RangeError('Resolve the wound first');
  const fight = copy(previous); fight.events = []; fight.round++;
  const enemy = fight.enemies[fight.target];
  const enemyAttack = enemy.skill + rollDice(roll);
  const playerAttack = fight.character.skill + attackModifier(fight, items) + rollDice(roll);
  fight.lastRoundWon = playerAttack > enemyAttack;
  const direction = playerAttack > enemyAttack ? 'outgoing' : playerAttack < enemyAttack ? 'incoming' : null;
  fight.consecutiveLost = direction === 'incoming' ? fight.consecutiveLost + 1 : 0;
  if (direction === 'incoming') fight.roundsLost++;
  fight.events.push({kind:'attack', enemy:enemy.displayName || enemy.name, playerAttack, enemyAttack});
  if (direction) fight.pending = {direction, enemy:fight.target};
  else finishRound(fight, roll);
  return fight;
}
export function resolveWound(previous, useLuck = false, roll) {
  requireFight(previous);
  if (!previous.pending || typeof useLuck !== 'boolean') throw new RangeError('No pending wound');
  const fight = copy(previous); fight.events = [];
  const {direction, enemy} = fight.pending;
  let lucky = null;
  if (useLuck) {
    const total = rollDice(roll); lucky = total <= fight.character.luck;
    fight.character.luck = Math.max(0, fight.character.luck - 1);
    fight.events.push({kind:'luck', total, lucky});
  }
  const damage = damageWithLuck(direction, 2, lucky);
  const target = direction === 'outgoing' ? fight.enemies[enemy] : fight.character;
  target.stamina = Math.max(0, target.stamina - damage);
  fight.events.push({kind:'damage', target:direction === 'outgoing' ? target.displayName || target.name : 'player', damage});
  fight.pending = null;
  finishRound(fight, roll);
  return fight;
}
export function canEscape(fight) {
  const rule = fight?.config.escape;
  return Boolean(fight?.status === 'active' && !fight.pending && rule && fight.round >= (rule.afterRounds ?? 0)
    && fight.target >= (rule.afterEnemies ?? 0) && (!rule.afterWinningRound || fight.lastRoundWon));
}
export function escapeFight(previous) {
  requireFight(previous);
  if (!canEscape(previous)) throw new RangeError('Cannot escape');
  const fight = copy(previous); fight.events = [];
  const damage = fight.config.escape.damage;
  fight.character.stamina = Math.max(0, fight.character.stamina - damage);
  fight.events.push({kind:'damage', target:'player', damage});
  finish(fight, fight.character.stamina ? 'escaped' : 'loss', fight.character.stamina ? fight.config.escape.destination : null);
  return fight;
}
export function bypassFight(previous) {
  requireFight(previous);
  if (previous.round || previous.pending || !previous.config.bypass) throw new RangeError('Cannot bypass');
  const fight = copy(previous); fight.events = [];
  fight.character.nextFightPenalty = fight.nextFightPenalty;
  finish(fight, 'bypassed', fight.config.bypass.destination);
  return fight;
}
export function useProjectile(previous, item) {
  requireFight(previous);
  if (previous.pending || !item || !Number.isSafeInteger(item.damage) || item.damage < 1 || !previous.character.items[item.key]) throw new RangeError('Projectile is unavailable');
  const fight = copy(previous); fight.events = [];
  fight.character.items[item.key] = false;
  const enemy = fight.enemies[fight.target]; enemy.stamina = Math.max(0, enemy.stamina - item.damage);
  fight.events.push({kind:'damage', target:enemy.displayName || enemy.name, damage:item.damage});
  settle(fight); return fight;
}
export function recover(previous, method) {
  validateCharacter(previous, true);
  const character = copy(previous);
  if (method === 'provision') {
    if (!character.provisions) throw new RangeError('No provisions');
    character.provisions--; character.stamina = Math.min(character.staminaInitial, character.stamina + 4);
  } else if (method === 'potion') {
    if (!character.potionUses) throw new RangeError('No potion');
    character.potionUses--;
    const stat = {skill:'skill',strength:'stamina',fortune:'luck'}[character.potion];
    if (stat === 'luck') character.luckInitial++;
    character[stat] = character[stat + 'Initial'];
  } else throw new RangeError('Invalid recovery');
  return character;
}
export function testLuck(previous, roll) {
  validateCharacter(previous, true);
  const character = copy(previous), total = rollDice(roll), lucky = total <= character.luck;
  character.luck = Math.max(0, character.luck - 1);
  return {character,total,lucky};
}
