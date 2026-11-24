import shared from './battlesim1608.js';

const prefix = 'battlesim1610.';
export default {
  ...Object.fromEntries(Object.entries(shared).map(([key, value]) => [key.replace('battlesim1608.', prefix), value])),
  ...Object.fromEntries(Object.entries({
    title:'Roman Quest: Combat',
    rules:'Enter your current combat stats and choose a preset or custom fight. A loaded short bow grants the opening attack when initiative would normally be rolled.',
    unknownHp:'Cassius’s Life Points are unprinted. You can play the survival bout with that field blank.',
    'weapon.unarmed':'Unarmed',
    'weapon.magicBow':'Magic bow',
    'phase.magicBow':'Shoot one magic arrow. No attack roll is needed.',
    'phase.enemy':'{name} attacks: roll two dice.',
    shootMagicBow:'Shoot one magic arrow',
    magicBowArrows:'Magic arrows',
    ammo:'Short-bow arrows',
    'context.hasNet':'Carry the gladiator’s net',
    castNet:'Cast the net (two dice)',
    'action.net':'Net cast',
    enemyUnprintedHp:'{name}: Life Points unprinted.',
    survivalRounds:'Rounds survived: {rounds} / {goal}',
    playerNetted:'You are caught in the net for {rounds} more rounds.',
    opponentNetted:'Your opponent is caught in the net for {rounds} more rounds.',
    toolsTotals:'Magic arrows: {magicBowArrows} · Medicine: {potionUses} · Full heals: {fullHealUses}',
    manualStory:'Take item rewards and make travel and story choices in the reader.',
  }).map(([key,value]) => [prefix+key,value])),
};
