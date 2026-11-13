// Resolve Shadow Chaser encounters without changing campaign progress or inventory.
import {createCombatRules} from '../../engines/usborne-adventure/combat.js';

const rules = createCombatRules({attacks:[7, 9, 11], advanced:true, unarmedDamage:0});
const number = (value, min, max = 10000) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid encounter value');
  return value;
};
const die = roll => number(roll(), 1, 6);

export function normalizeEncounter(input) {
  if (!input || typeof input !== 'object') throw new RangeError('Missing encounter');
  const mode = input.mode ?? 'combat';
  if (!['combat', 'archery', 'wowl'].includes(mode)) throw new RangeError('Unknown encounter');
  const profiles = (input.profiles ?? []).map(profile => ({name:String(profile.name ?? profile.displayName ?? '').slice(0, 200),
    hp:number(profile.hp, 1), rounds:number(profile.rounds, 1), injury:number(profile.injury, 0)}));
  if (mode === 'combat' && (!profiles.length || profiles.length > 100)) throw new RangeError('Missing opponents');
  const config = structuredClone(input.rules ?? {});
  for (const key of ['win', 'loss', 'rescueRoute']) if (config[key] != null) number(config[key], 1, 435);
  return {key:String(input.key ?? ''), name:String(input.name ?? profiles.map(row => row.name).join(', ')).slice(0, 300),
    section:String(input.section ?? ''), mode, profiles, rules:config, sourceNotes:(input.sourceNotes ?? []).map(String)};
}

export function startFight(player, input, options = {}) {
  const encounter = normalizeEncounter(input), hp = number(player.hp, 1, 12);
  const fight = {rulesVersion:1, mode:encounter.mode, revision:0, status:'fighting', round:0,
    player:{hp, maxHp:12}, opponent:{name:encounter.name, section:encounter.section},
    encounter, destination:null, events:[]};
  if (fight.mode === 'combat') {
    fight.core = rules.startFight(hp, encounter.profiles, encounter.rules, number(options.modifier ?? 0, -100, 100),
      false, options.equipment ?? {});
  } else if (fight.mode === 'archery') {
    fight.arrows = number(options.arrows ?? encounter.rules.arrows, 1, 100);
    fight.skill = number(options.skill ?? 3, 0, 100);
    fight.skillThreshold = number(encounter.rules.skillThreshold, 1, 100);
    if (!encounter.profiles.length || encounter.profiles.length > 100) throw new RangeError('Missing archery targets');
    fight.targets = encounter.profiles.map(profile => ({name:profile.name, hp:2}));
  } else {
    fight.remaining = number(options.remaining ?? 3, 1, 3);
    fight.bites = 0;
  }
  return validateFight(fight);
}

export function validateFight(fight) {
  if (!fight || fight.rulesVersion !== 1 || !['combat', 'archery', 'wowl'].includes(fight.mode)
      || !['fighting', 'win', 'loss'].includes(fight.status) || typeof fight.opponent?.name !== 'string') {
    throw new RangeError('Invalid saved encounter');
  }
  number(fight.player?.hp, 0, 12); number(fight.revision, 0); number(fight.round, 0);
  if (!Array.isArray(fight.events)) throw new RangeError('Invalid encounter log');
  if (fight.mode === 'combat') {
    if (fight.core?.rulesVersion !== 1 || !Array.isArray(fight.core.enemies) || !fight.core.enemies.length) throw new RangeError('Invalid combat');
    number(fight.core.hp, 0, 12);
    for (const enemy of fight.core.enemies) {number(enemy.hp, 0); number(enemy.rounds, 0); number(enemy.injury, 0);}
  } else if (fight.mode === 'archery') {
    number(fight.arrows, 0, 100); number(fight.skill, 0, 100); number(fight.skillThreshold, 1, 100);
    if (!Array.isArray(fight.targets) || !fight.targets.length) throw new RangeError('Invalid targets');
    for (const target of fight.targets) number(target.hp, 0, 2);
  } else {number(fight.remaining, 0, 3); number(fight.bites, 0, 3);}
  return fight;
}

export function combatAction(original, action, roll = () => Math.floor(Math.random() * 6) + 1) {
  validateFight(original);
  if (original.status !== 'fighting' || action.expectedRevision !== original.revision) throw new RangeError('Stale combat action');
  const fight = structuredClone(original);
  if (fight.mode === 'combat') {
    if (action.kind !== 'attack') throw new RangeError('Choose an attack');
    fight.core = rules.round(fight.core, action.target, action.attack, roll);
    fight.player.hp = fight.core.hp; fight.status = fight.core.outcome ?? 'fighting';
    fight.events = fight.core.events.map(event => ({kind:'attack', ...event}));
    fight.round = fight.core.rounds; fight.destination = fight.core.destination;
  } else if (fight.mode === 'archery') {
    if (action.kind !== 'shoot' || fight.arrows < 1) throw new RangeError('No shot available');
    const index = number(action.target, 0, fight.targets.length - 1), target = fight.targets[index];
    if (!target.hp) throw new RangeError('Target already defeated');
    const rolled = die(roll), total = rolled + (fight.skill >= fight.skillThreshold ? 1 : 0);
    const loss = total >= 6 ? target.hp : total >= 4 ? 1 : 0;
    target.hp -= loss; fight.arrows--; fight.round++;
    fight.events = [{kind:'shot', name:target.name, die:rolled, total, loss, remaining:target.hp, arrows:fight.arrows}];
    if (fight.targets.every(row => row.hp === 0)) fight.status = 'win';
    else if (!fight.arrows) fight.status = 'loss';
  } else {
    if (action.kind !== 'defend') throw new RangeError('Choose Wowl’s defense');
    const rolled = die(roll), killed = rolled % 2 === 0;
    if (killed) fight.remaining--; else fight.bites++;
    fight.round++; fight.events = [{kind:'wowl', die:rolled, killed, remaining:fight.remaining, bites:fight.bites}];
    if (!fight.remaining) fight.status = 'win';
    else if (fight.bites === 3) fight.status = 'loss';
  }
  if (fight.status !== 'fighting' && fight.mode !== 'combat') fight.destination = fight.encounter.rules[fight.status] ?? null;
  fight.revision++;
  return validateFight(fight);
}
