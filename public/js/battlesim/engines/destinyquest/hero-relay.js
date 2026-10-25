// A source-defined ally fights first. The player's combat snapshot stays separate
// until takeover or victory; enemy wounds and the historical fight remain intact.
export function beginDestinyHeroRelay(fight, hero, settings) {
  const baseEncounter = structuredClone(fight.encounter);
  const primary = structuredClone({hero:fight.hero, abilities:fight.abilities,
    equipment:fight.equipment, used:fight.used, restoreOnVictory:fight.restoreOnVictory});
  fight.hero = structuredClone(hero);
  fight.abilities = structuredClone(settings.abilities || {});
  fight.equipment = {};
  fight.used = {};
  fight.restoreOnVictory = false;
  Object.assign(fight.encounter, structuredClone(settings.rules || {}));
  fight.encounter.heroRelay = {id:settings.id, active:true, primary, baseEncounter};
  fight.encounter.disableBackpack = true;
}

export function restoreDestinyPrimaryHero(fight, {fallen = false} = {}) {
  const relay = fight.encounter?.heroRelay;
  if (!relay?.active) return false;
  relay.allyHealth = fight.hero.health;
  relay.active = false;
  relay.fallen = fallen;
  Object.assign(fight, structuredClone(relay.primary));
  fight.encounter = {...structuredClone(relay.baseEncounter), heroRelay:relay};
  fight.effects = [];
  fight.usedBookActions = {};
  if (fight.character) {
    fight.character.companions ??= {};
    fight.character.companions[relay.id] = {...fight.character.companions[relay.id], alive:!fallen};
  }
  for (const key of ['chargedAttacks','sacrificedSummons','lastHealthHitRound','nextHeroSpeedDice']) delete fight[key];
  fight.history.push({type:'companion-outcome', companion:relay.id, fallen, health:relay.allyHealth});
  return true;
}
