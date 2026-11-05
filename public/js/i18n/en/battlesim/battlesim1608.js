// English controls for Egyptian Quest's independent Kingfisher encounters.
import shared from './battlesim1607.js';
const prefix = 'battlesim1608.';
export default {
  ...Object.fromEntries(Object.entries(shared).map(([key,value]) => [key.replace('battlesim1607.',prefix),value])),
  ...Object.fromEntries(Object.entries({
    title:'Egyptian Quest: Combat',
    rules:'Enter your current stats and choose an optional preset or custom opponent. Roll initiative, then alternate attacks. Choose the active opponent when fighting a group.',
    unknownHp:'Unprinted stats stay blank. Enter them before fighting. One-hit mummies and a charged-flail scorpion duel do not need invented Life Points. Roll the ambush count yourself.',
    magicUses:'Instant-kill weapon charges', potionUses:'Healing potion doses (two dice)', fullHealUses:'Full-healing charges',
    sleepUses:'Amethyst rod charges', orbUses:'Purple orb charges', heavyBonus:'Heavy club bonus',
    playerRollModifier:'Your dice-score adjustment', enemyRollModifier:'Opponent dice-score adjustment',
    'weapon.magic':'Charged instant-kill weapon', 'weapon.heavy':'Heavy club',
    'weapon.poison':'Venomous strike',
    wait:'Wait this turn', sleep:'Use amethyst rod', orb:'Use purple orb (one die)', potion:'Drink healing potion (two dice)', fullHeal:'Use full healing',
    totals:'Life Points: {hp} / {maxHp} · EXP: {experience} · Ammo: {ammo}',
    toolsTotals:'Charges: weapon {magicUses} · sleep {sleepUses} · orb {orbUses} · potion {potionUses} · full healing {fullHealUses}',
    enemyOneHitTotals:'{name}: one successful hit · {count} remaining',
    eventOneHit:'{action} · {name} · {dice} · single-hit defeat · your LP {hp}',
    'phase.initiative':'Roll one die for the first attack.',
    'action.wait':'Waited', 'action.sleep':'Amethyst rod', 'action.orb':'Purple orb', 'action.potion':'Healing potion', 'action.fullHeal':'Full healing',
    manualStory:'Apply story instructions, inventory availability and the curse in the reader. Dice-score adjustments are manual. Each instant-kill attack spends a charge, including a miss. The heavy club needs another turn between uses.',
  }).map(([key,value]) => [prefix+key,value])),
};
