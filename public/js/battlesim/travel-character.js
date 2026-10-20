// Transfer persistent simulator characters between compatible rules, preserving local combat.
const containers = ['player', 'character', 'party', 'crew'];
const rootStats = ['combatSkill', 'combatSkillInitial', 'endurance', 'enduranceInitial',
  'strength', 'strengthInitial', 'life', 'lifeInitial', 'offensive', 'defensive', 'interactive',
  'hitReq', 'damageBonus', 'armour', 'hasHealingPotion', 'healingPotionUsed', 'silver'];
const localPlayerFields = new Set(['playerWoundDamage', 'blockPenaltyPending', 'invisibilityActive',
  'paralyzeThreshold', 'attackModifier', 'invulnerable', 'routed']);
const portableKey = key => !/^(?:enemy|pending|rounds|battle|fight|log|history|setup|opponent)|This(?:Fight|Battle)$/i.test(key)
  && !localPlayerFields.has(key);
const clone = value => structuredClone(value);
const familyKey = definition => !definition.family || definition.family === 'standalone' ? `book:${definition.id}` : definition.family;
function portableObject(value) {
  const result = Object.fromEntries(Object.entries(value).filter(([name]) => portableKey(name)).map(([name, v]) => [name, clone(v)]));
  for (const key of ['invulnerable', 'routed']) if (Object.hasOwn(value, key)) result[key] = false;
  return result;
}

export function captureSimulatorCharacter(simulator, includeUnrolled = false) {
  if (!simulator || simulator.rolled === false && !includeUnrolled) return null;
  const character = {};
  for (const key of containers) {
    const value = simulator[key];
    if (value && typeof value === 'object') {
      character[key] = Array.isArray(value) ? value.map(member => member && typeof member === 'object' ? portableObject(member) : member)
        : portableObject(value);
    }
  }
  for (const key of rootStats) if (Object.hasOwn(simulator, key)) character[key] = clone(simulator[key]);
  if (!Object.keys(character).length) return null;
  if (typeof simulator.rolled === 'boolean') character.rolled = simulator.rolled;
  return character;
}

export async function addSimulatorTraveler(traveler, run, sourceBookId, targetBookId, supports) {
  if (!traveler) return traveler;
  traveler.openWorldCharacters = clone(run.openWorldCharacters || {});
  const definitionFor = async id => supports(id)
    ? (await import(`./books/${Number(id)}/definition.js`)).definition : null;
  const [source, target] = await Promise.all([definitionFor(sourceBookId), definitionFor(targetBookId)]);
  // A player can pass through a book without opening its simulator. Until its
  // pending character is applied, that book's old local stats are not current.
  if (source && run.openWorldPendingCharacter?.bookId !== Number(sourceBookId)) {
    const character = captureSimulatorCharacter(run[source.stateKey]);
    if (character) {
      const family = familyKey(source), previous = traveler.openWorldCharacters[family] || {};
      const combined = { ...previous, ...character };
      for (const key of containers) {
        if (character[key] && !Array.isArray(character[key])) combined[key] = { ...(previous[key] || {}), ...character[key] };
      }
      traveler.openWorldCharacters[family] = combined;
    }
  }
  traveler.openWorldPendingCharacter = target && traveler.openWorldCharacters[familyKey(target)]
    ? { bookId: Number(targetBookId), stateKey: target.stateKey, family: familyKey(target) } : null;
  return traveler;
}

function mergeKnown(target, source) {
  if (!target || typeof target !== 'object' || !source || typeof source !== 'object') return;
  for (const key of Object.keys(target)) {
    if (portableKey(key) && Object.hasOwn(source, key)) target[key] = clone(source[key]);
  }
}

const memberKey = member => member && typeof member === 'object'
  ? member.uid ?? member.profileId ?? member.id ?? member.name : null;

function mergeMembers(target, source) {
  for (const member of target) {
    const key = memberKey(member);
    if (key == null) continue;
    const matches = source.filter(other => memberKey(other) === key);
    if (matches.length === 1) mergeKnown(member, matches[0]);
  }
}

function fabledDefence(character, fight, bookId) {
  if (!character) return null;
  if (bookId !== 680) return character.combat + character.rank + character.armour;
  const base = key => character['base' + key[0].toUpperCase() + key.slice(1)] ?? character[key];
  if (!fight.config?.spiritual) return base('combat') + character.rank + character.armour;
  const penalty = fight.mentalPenalty ? 1 : 0;
  return (character.nahual ?? 0) + Math.max(1, base('magic') - penalty, base('sanctity') - penalty)
    + (character.spiritualArmour ?? 0) + (character.pacharaCirclet ? 2 : 0);
}

export function applyPendingSimulatorCharacter(run, bookId) {
  const pending = run?.openWorldPendingCharacter;
  if (!pending || pending.bookId !== Number(bookId)) return false;
  const character = run.openWorldCharacters?.[pending.family];
  const simulator = run[pending.stateKey];
  // The normal simulator render initializes its own book-specific defaults first.
  if (!character || !simulator) return false;
  const oldCombatSkill = simulator.combatSkill;
  const oldDefence = pending.family === 'fabled-lands' && simulator.fight
    ? fabledDefence(simulator.character, simulator.fight, pending.bookId) : null;
  run.openWorldLocalCharacters ||= {};
  if (!Object.hasOwn(run.openWorldLocalCharacters, pending.stateKey)) {
    run.openWorldLocalCharacters[pending.stateKey] = captureSimulatorCharacter(simulator, true);
  }
  for (const key of containers) {
    if (!Object.hasOwn(character, key) || !Object.hasOwn(simulator, key)) continue;
    if (Array.isArray(character[key]) && Array.isArray(simulator[key]) && simulator[key].length) {
      // A local encounter may index its existing roster. Match persistent members
      // by identity rather than swapping people or rearranging combatants.
      mergeMembers(simulator[key], character[key]);
    } else if (Array.isArray(character[key]) || simulator[key] == null) simulator[key] = clone(character[key]);
    else mergeKnown(simulator[key], character[key]);
  }
  for (const key of [...rootStats, 'rolled']) {
    if (Object.hasOwn(character, key) && Object.hasOwn(simulator, key)) simulator[key] = clone(character[key]);
  }
  // A previously paused local fight keeps its enemies, rounds and history, while
  // its player snapshot reflects the arriving character's current stats.
  mergeKnown(simulator.fight?.player, simulator.player || simulator.character);
  mergeKnown(simulator.fight?.character, simulator.character || simulator.player);
  if (pending.family === 'legendary-kingdoms' && simulator.fight) {
    const fight = simulator.fight;
    if (Array.isArray(fight.party) && Array.isArray(simulator.party)) mergeMembers(fight.party, simulator.party);
  }
  if (pending.family === 'lone-wolf' && Number.isFinite(simulator.ratio)
      && Number.isFinite(oldCombatSkill) && Number.isFinite(simulator.combatSkill)) {
    simulator.ratio += simulator.combatSkill - oldCombatSkill;
  }
  if (pending.family === 'fabled-lands' && simulator.fight) {
    const defence = fabledDefence(simulator.character, simulator.fight, pending.bookId);
    if (Number.isFinite(oldDefence) && Number.isFinite(defence) && Number.isFinite(simulator.fight.defence)) {
      simulator.fight.defence = Math.max(1, simulator.fight.defence + defence - oldDefence);
    }
    if (Object.hasOwn(simulator.fight, 'staminaBefore')) simulator.fight.staminaBefore = simulator.character.stamina;
  }
  delete run.openWorldPendingCharacter;
  return true;
}
