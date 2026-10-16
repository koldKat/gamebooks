import { ENCOUNTERS } from './definition.js';
import { die, integer, startFight, testLuck, validateCharacter } from '../../engines/space-assassin/core.js';

export function prepareEncounter(character, section, options = {}, roll = die) {
  integer(section, 0, 400);
  const preset = section === 0 && options.opponents ? {requiresModeChoice: true, requiresEnemyWeaponChoice: true}
    : ENCOUNTERS.find(entry => entry.section === section);
  if (!preset) throw new RangeError('Unknown encounter');
  validateCharacter(character, true);
  const mode = preset.mode ?? options.mode;
  if (!['melee', 'gunfire'].includes(mode) || preset.mode && options.mode && options.mode !== preset.mode) {
    throw new RangeError('Choose a valid encounter mode');
  }
  if (!['blaster', 'lash', 'unarmed'].includes(options.weapon)) throw new RangeError('Choose a player weapon');
  for (const key of ['knowledge', 'ballBearings', 'openingHit']) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new RangeError('Invalid encounter option');
  }
  if (options.knowledge && !preset.knowledgeBonus || options.ballBearings && !preset.ballBearingPenalty
      || options.openingHit && !preset.optionalOpeningArmourLoss) {
    throw new RangeError('Modifier does not apply to this encounter');
  }
  const source = preset.enemies ?? options.opponents;
  if (options.opponents && options.opponents.length !== source.length) throw new RangeError('Invalid opponent count');
  const enemies = source.map((enemy, index) => {
    const override = options.opponents?.[index];
    return override ? {...structuredClone(enemy), name: override.displayName || enemy.name || 'Противник',
      skill: override.skill, stamina: override.stamina} : structuredClone(enemy);
  });
  if (preset.requiresEnemyWeaponChoice && mode === 'gunfire') {
    if (!['blaster', 'lash', 'unarmed', 'none'].includes(options.enemyWeapon)) throw new RangeError('Choose the enemy weapon');
    for (const enemy of enemies) {
      enemy.weapon = options.enemyWeapon === 'none' ? 'unarmed' : options.enemyWeapon;
      if (options.enemyWeapon === 'none') enemy.shots = 0;
    }
  }
  if (options.ballBearings) {
    for (const enemy of enemies) enemy.skill = Math.max(0, enemy.skill - preset.ballBearingPenalty);
  }
  let player = structuredClone(character), openingShots = 0, luck;
  if (preset.openingLuckTest) {
    luck = testLuck(player, roll);
    player = luck.player;
    if (preset.luckAvoidsFight && luck.lucky) {
      return { player, fight: null, outcome: 'avoided', destination: preset.luckDestination,
        events: [{ kind: 'luck', roll: luck.roll, before: luck.before, lucky: true }] };
    }
    openingShots = (luck.lucky ? preset.openingShotsIfLucky : preset.openingShotsIfUnlucky) ?? 0;
  }
  const fight = startFight(player, enemies, { ...preset, mode, weapon: options.weapon, openingShots,
    initialArmourLoss: (preset.initialArmourLoss ?? 0) + (options.openingHit ? preset.optionalOpeningArmourLoss : 0),
    playerDamageBonus: options.knowledge ? preset.knowledgeBonus : 0 });
  fight.encounterSection = section;
  fight.winDestination = preset.win;
  if (luck) fight.events.unshift({ kind: 'luck', roll: luck.roll, before: luck.before, lucky: luck.lucky });
  return { player: fight.player, fight, outcome: null, destination: null };
}
