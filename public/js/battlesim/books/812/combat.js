import { ENCOUNTERS, RULES_REVISION, FOREST_RULES } from './definition.js';

const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};
export const rollDie = () => Math.floor(Math.random() * 6) + 1;
export const newCharacter = () => ({attack: 0, defence: 0, life: 10, maximum: 10, items: 2, axe: true, shield: true, helmet: false, ring: false});
export function validateCharacter(character) {
  if (!character) throw new RangeError('Missing character');
  integer(character.attack, 0, 1000); integer(character.defence, 0, 1000);
  integer(character.life, 0, 10000); integer(character.maximum, Math.max(1, character.life), 10000);
  integer(character.items, 0, 1000);
  return structuredClone(character);
}
export function ratings(character, encounter) {
  return {attack: character.attack + Number(Boolean(character.axe && !encounter.unarmed))
      + Number(Boolean(encounter.gloves)) + (encounter.werewolf && character.ring ? 2 : 0),
    defence: character.defence + Number(Boolean(character.shield && !encounter.unarmed))
      + Number(Boolean(character.helmet)) + Number(Boolean(character.ring))};
}
function finish(fight, outcome) {
  fight.outcome = outcome; fight.phase = 'finished';
  fight.destination = outcome === 'win' ? fight.encounter.destination : outcome === 'loss' ? fight.encounter.lossDestination : null;
  fight.events.push({kind: outcome, destination: fight.destination});
  return fight;
}
export function startFight(character, opponent, section, mode = 'player', matchLife = true) {
  const encounter = ENCOUNTERS.find(row => row.section === Number(section));
  const player = validateCharacter(character);
  if (!encounter || !['player', 'reader'].includes(mode) || !opponent?.displayName?.trim() || player.life <= 0) throw new RangeError('Invalid fight');
  if (encounter.unarmed && mode === 'player' && player.life <= FOREST_RULES.knockout) throw new RangeError('Already at knockout threshold');
  const enemy = {...opponent, attack: integer(opponent.attack, 0, 1000), defence: integer(opponent.defence, 0, 1000),
    life: encounter.dynamicLife && matchLife ? player.life : integer(opponent.life, encounter.unarmed ? FOREST_RULES.knockout + 1 : 1, 10000)};
  const fight = {rulesRevision: RULES_REVISION, encounter, character: player, enemy, name: enemy.displayName,
    mode, phase: mode === 'reader' ? 'reader' : 'player', turns: 0, rounds: 0, outcome: null,
    ratings: ratings(player, encounter), events: [{kind: 'start', section: encounter.section}]};
  if (mode === 'player' && encounter.entryDamage) {
    player.life = Math.max(0, player.life - encounter.entryDamage);
    fight.events.push({kind: 'entryDamage', damage: encounter.entryDamage, life: player.life});
    if (!player.life) return finish(fight, 'loss');
  }
  return fight;
}
function fresh(fight) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome) throw new RangeError('Fight inactive');
  const next = structuredClone(fight); next.events = []; return next;
}
export function turn(fight, attackDie = rollDie(), defenceDie = rollDie()) {
  const next = fresh(fight);
  if (next.mode !== 'player') throw new RangeError('Reader fight has no dice');
  integer(attackDie, 1, 6); integer(defenceDie, 1, 6);
  const playerAttack = next.phase === 'player';
  const attack = (playerAttack ? next.ratings.attack : next.enemy.attack) + attackDie;
  const defence = (playerAttack ? next.enemy.defence : next.ratings.defence) + defenceDie;
  const damage = Math.max(0, attack - defence), target = playerAttack ? next.enemy : next.character;
  const threshold = next.encounter.unarmed ? FOREST_RULES.knockout : 0;
  target.life = Math.max(threshold, target.life - damage);
  next.turns++;
  if (playerAttack) next.rounds++;
  next.events.push({kind: playerAttack ? 'playerTurn' : 'enemyTurn', attackDie, defenceDie, attack, defence, damage});
  if (next.character.life <= threshold) return finish(next, 'loss');
  if (next.enemy.life <= threshold) return finish(next, 'win');
  next.phase = playerAttack ? 'enemy' : 'player';
  return next;
}
export function resolveReader(fight) {
  const next = fresh(fight);
  if (next.mode !== 'reader') throw new RangeError('Not a reader fight');
  const damage = Math.max(0, next.encounter.readerDamage - next.character.items);
  next.character.life = Math.max(0, next.character.life - damage);
  next.events.push({kind: 'readerDamage', damage, life: next.character.life});
  return finish(next, next.character.life > 0 ? 'win' : 'loss');
}
export function cancelFight(fight) { return finish(fresh(fight), 'cancelled'); }
