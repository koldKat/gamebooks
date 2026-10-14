import { legendaryCompanionAttack, legendaryCompanionCanAct, legendaryReleaseHero,
  legendaryChooseStunned, legendaryChooseVulnerable, legendaryMoveHero,
  legendaryLeaveHorror, legendaryTakeFallenWeapon } from './combat.js';
import { legendaryArmyChooseScheduled } from './army.js';
import { legendarySurrenderCargo } from './naval.js';
import { legendaryEscape } from './party-form.js';

export function mountCrownActions(api) {
  const {document,ID,el,number,tk,button,select,options,selectedIndices,action,report,render} = api;
  const container = document.createElement('div');
  container.id = ID+'-crownActions';
  container.innerHTML = select('releaseMember')+button('releaseMemberAction')+
    select('stunnedMembers')+button('chooseStunned')+
    select('vulnerableMember')+button('chooseVulnerable')+
    button('companionAttack')+button('takeFallenWeapon')+
    select('movingMember')+select('moveDestination',[
      ['pool',tk('pool')],['walkway',tk('walkway')],
    ])+button('moveHero')+button('leaveHorror')+button('alliedArmySpell')+button('surrenderCargo')+
    `<div id="${ID}-armourAllocation"></div>`;
  el('personalActions').after(container);
  el('stunnedMembers').multiple = true;
  el('stunnedMembers').size = 4;
  const update = (kind, fn) => action(game => {
    if (game.fight?.status !== 'active' || game.fight.kind !== kind) return;
    report(game,fn(game.fight),kind);
  });
  const bind = (id,kind,fn) => el(id).addEventListener('click',() => update(kind,fn));
  bind('releaseMemberAction','personal',fight => legendaryReleaseHero(fight,number('releaseMember')));
  bind('chooseStunned','personal',fight => legendaryChooseStunned(fight,selectedIndices('stunnedMembers')));
  bind('chooseVulnerable','personal',fight => legendaryChooseVulnerable(fight,number('vulnerableMember')));
  bind('companionAttack','personal',fight => legendaryCompanionAttack(fight,number('target')));
  bind('takeFallenWeapon','personal',fight => legendaryTakeFallenWeapon(fight,number('movingMember')));
  bind('moveHero','personal',fight => legendaryMoveHero(fight,number('movingMember'),el('moveDestination').value));
  bind('leaveHorror','personal',legendaryLeaveHorror);
  bind('alliedArmySpell','army',fight => legendaryArmyChooseScheduled(fight,number('armyTarget'),number('armyPosition')));
  bind('surrenderCargo','naval',legendarySurrenderCargo);
  el('sameRecipient').addEventListener('change',render);
  const show = (id,visible) => {
    const node = el(id);
    (node.tagName === 'SELECT' ? node.closest('label') : node).hidden = !visible;
  };
  function allocation(fight) {
    const host = el('armourAllocation');
    const pending = fight?.pending;
    const index = Number(el('recipient').value);
    const parts = fight?.rules?.armourParts?.[index];
    host.hidden = !fight?.rules?.armourErosion || !pending || !parts;
    if (host.hidden) {host.replaceChildren();delete host.dataset.key;return;}
    const counts = {...parts,spell:fight.armourBonuses[index]};
    const size = Math.min(pending.hits,Object.values(counts).reduce((sum,value) => sum+value,0));
    const key = [fight.round,fight.log.length,index,pending.hits,JSON.stringify(counts)].join(':');
    if (host.dataset.key === key) return;
    const defaults = Object.entries(counts).flatMap(([type,count]) => Array(Math.min(size,count)).fill(type));
    host.innerHTML = `<p>${legendaryEscape(tk('armourAllocationNote'))}</p>`+
      Array.from({length:size},(_,die) => `<label class="inv-edit-row"><span class="inv-edit-label">`+
        legendaryEscape(tk('armourDie',{number:die+1}))+`</span><select class="inv-edit-input" id="${ID}-armourDie-${die}">`+
        Object.entries(counts).filter(([,count]) => count > 0).map(([type,count]) =>
          `<option value="${type}">${legendaryEscape(tk('armourPart.'+type)+' ('+count+')')}</option>`).join('')+'</select></label>').join('');
    for (let die=0;die<size;die++) el('armourDie-'+die).value = defaults[die];
    host.dataset.key = key;
  }
  return {
    render(game) {
      const fight = game.fight;
      const active = fight?.status === 'active';
      const personal = active && fight.kind === 'personal';
      const alive = personal ? fight.participants.filter(index => fight.party[index].health > 0 &&
        !(fight.rules.controlledMember === index && fight.enemies[fight.rules.controllerIndex].health > 0)) : [];
      const rows = indices => indices.map(index => [index,game.party[index].name]);
      options('movingMember',rows(alive));
      options('releaseMember',rows(alive.filter(index => fight.grappled?.includes(index))));
      options('stunnedMembers',rows(alive));
      options('vulnerableMember',rows(fight?.pendingChoice?.candidates ?? []));
      const release = personal && fight.phase === 'release';
      show('releaseMember',release);show('releaseMemberAction',release);
      const stun = personal && !!fight.pendingChoice?.chooseStun;
      show('stunnedMembers',stun);show('chooseStunned',stun);
      const vulnerability = personal && !!fight.pendingChoice?.chooseVulnerability;
      show('vulnerableMember',vulnerability);show('chooseVulnerable',vulnerability);
      show('companionAttack',personal && legendaryCompanionCanAct(fight));
      const pickup = personal && fight.phase === 'player' && fight.rules.pickupWeapon && !fight.weaponTaken &&
        fight.enemies[fight.rules.pickupWeapon.enemyIndex].health === 0;
      show('takeFallenWeapon',pickup);
      const movement = personal && fight.phase === 'player' && !!fight.rules.locationBattle;
      show('movingMember',movement || pickup);show('moveDestination',movement);show('moveHero',movement);
      show('leaveHorror',movement && fight.rules.locationBattle === 'walkway');
      show('alliedArmySpell',active && fight.kind === 'army' && !!fight.pendingArmySpell);
      show('surrenderCargo',active && fight.kind === 'naval' && !!fight.rules.cargoSurrender);
      if (personal && fight.pending) {
        const pending = fight.pending;
        const groupKey = typeof pending.distinctGroup === 'string' ? pending.distinctGroup : pending.enemyIndex;
        const eligible = alive.filter(index => (fight.rules.heroArrivalRounds?.[index] ?? 1) <= fight.round &&
          (pending.forcedMember === undefined || pending.forcedMember === index) &&
          (!pending.allowedMembers || pending.allowedMembers.includes(index)) &&
          (!fight.rules.distinctRoundRecipients || !fight.roundRecipients.includes(index)) &&
          (!pending.distinct || el('sameRecipient').checked || fight.enemyRecipients[pending.enemyIndex] !== index) &&
          (!pending.distinctGroup || el('sameRecipient').checked || !fight.enemyRecipientGroups?.[groupKey]?.includes(index)));
        const recipients = rows(eligible);
        if (fight.companion && !fight.companion.injured && pending.forcedMember === undefined &&
            !pending.unpreventable && !pending.stunOnly) recipients.push(['companion',fight.companion.name]);
        options('recipient',recipients);
        el('potion').disabled ||= el('recipient').value === 'companion';
      }
      allocation(personal ? fight : null);
      if (release) el('phase').textContent = tk('releasePrompt');
      if (stun) el('phase').textContent = tk('stunPrompt',{count:fight.pendingChoice.count});
      if (vulnerability) el('phase').textContent = tk('vulnerabilityPrompt');
      if (active && fight.kind === 'army' && fight.pendingArmySpell)
        el('phase').textContent = tk('alliedSpellPrompt',{spell:tk('spell.'+fight.pendingArmySpell.effect)});
    },
  };
}

export function readCrownRecipient({el,number}) {
  return el('recipient').value === 'companion' ? 'companion' : number('recipient');
}

export function readCrownArmourAllocation({el}) {
  return {armourSaveOrder:[...el('armourAllocation').querySelectorAll('select')].map(input => input.value)};
}
