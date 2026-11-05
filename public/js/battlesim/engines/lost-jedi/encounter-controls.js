// Bind the optional controls required by printed Lost Jedi encounter exceptions.
import {beginWeaponGrab,joinFight} from './combat-phases.js';

export function createEncounterControls({el,preset,store,act,die,tk,escape,onContinue}) {
  function sides(select,actors,observe) {
    const old=select.value;
    const factions=new Map(actors.filter(a=>a.id!=='havet').map(a=>[a.faction ?? a.team,a.name]));
    select.innerHTML=(observe?`<option value="observe">${escape(tk('observe'))}</option>`:'')+
      [...factions].map(([side,name])=>`<option value="${escape(side)}">${escape(name)}</option>`).join('');
    if ([...select.options].some(o=>o.value===old)) select.value=old;
  }
  function setup() {
    const selected=preset(),rules=selected?.rules ?? {};
    el('oneFewerImperial').closest('label').hidden=!rules.oneFewerImperialOption;
    el('extraRebels').closest('label').hidden=!rules.optionalAllies;
    el('extraRebelSkill').closest('label').hidden=!rules.optionalAllies || !el('extraRebels').checked;
    el('participation').closest('label').hidden=!rules.chooseParticipation;
    if (rules.chooseParticipation) sides(el('participation'),selected.actors,true);
    const continuation=!!rules.continuationOf && store.read()?.fight?.section!==rules.continuationOf;
    for(const key of ['survivingGuards','survivingRebels'])el(key).closest('label').hidden=!continuation;
  }
  function render(fight,active,turn) {
    setup();
    const playerTurn=active&&!fight.pending&&turn?.actor.id==='havet',rules=fight?.rules ?? {};
    el('eweb').hidden=!playerTurn || !rules.ewebAvailable || fight.player.weapon==='eweb';
    el('blockGunRack').hidden=!playerTurn || !rules.blockGunRackAvailable || fight.round>2 || fight.gunRackBlocked;
    el('retreat').hidden=!playerTurn || !rules.retreat;
    el('grabControls').hidden=!playerTurn || !rules.weaponGrabTest;
    const observing=active&&!fight.pending&&rules.chooseParticipation&&rules.thirdPartyOnly;
    el('joinControls').hidden=!observing;
    if (observing) sides(el('joinSide'),fight.actors,false);
    el('continueCombat').hidden=fight?.outcome!=='phase' || !rules.combatContinuation;
  }
  function bind() {
    for (const action of ['eweb','blockGunRack','retreat']) el(action).addEventListener('click',()=>act(f=>onContinue.action(f,action)));
    el('grabPoints').value='0';
    el('grabWeapon').addEventListener('click',()=>{
      act(f=>beginWeaponGrab(f,el('grabPoints').value,die()));el('adjustment').value='0';
      el('adjustment').dispatchEvent(new Event('input'));
    });
    el('joinCombat').addEventListener('click',()=>act(f=>joinFight(f,el('joinSide').value)));
    el('continueCombat').addEventListener('click',()=>onContinue.phase());
  }
  return {setup,render,bind};
}
