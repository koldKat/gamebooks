import {destinyTeamHero,switchDestinyTeamHero} from './team-state.js';
import {hasDestinyAbility,isDestinyOpponentActive,destinyPassiveEffects} from './effects.js';

// DOM controls only. Actor changes and attack ownership remain native session
// actions; displaying a different hero never mutates that hero's snapshot.
export function createDestinyTeamPanel({tk,escape,title,select,button,el,integer,apply}){
  const name=(fight,id)=>destinyTeamHero(fight,id).hero.name||tk(id===0?'hero':'secondHero');
  function nextAction(fight){
    if(!fight.team)return undefined;
    if(fight.turn?.pendingAbility||['encounter-setup','encounter-start','encounter-orbs','between-combats'].includes(fight.phase))return undefined;
    if(!fight.team.stage||fight.team.stage==='start')return 'start-round';
    if(['speed','speed-choice'].includes(fight.team.stage))return null;
    if(fight.team.stage==='damage'){
      const actor=destinyTeamHero(fight,fight.team.roundWinner);
      return {damage:'roll-damage','damage-rolled':'resolve-damage','ability-rolled':'resolve-ability',end:'end-round'}[actor.phase]??null;
    }
    if(fight.team.stage==='end')return 'end-round';
    return undefined;
  }
  function fields(fight){
    if(!fight.team||fight.status!=='active')return '';
    const pending=!!fight.turn?.pendingAbility,ids=fight.team.order;
    let html=`<fieldset class="bsim-side"><legend>${escape(tk('team'))}</legend>`;
    if(!pending)html+=select('teamActor',ids.map(id=>[id,name(fight,id)]),fight.team.active,tk('selectedHero'))+button('team-select',tk('selectHero'));
    if(fight.phase==='start'&&(!fight.team.stage||fight.team.stage==='start')){
      for(const id of ids){
        const living=destinyTeamHero(fight,id).hero.health>0;
        const paired=fight.encounter?.pairedTeam&&!fight.team.pairing?.resolved;
        const stunned=(fight.team.stunnedUntil?.[id]??-1)>=fight.round+1;
        const roles=!living?['fallen']:paired?['attack']:stunned?['support']:['attack','support'];
        html+=select('teamRole-'+id,roles.map(role=>[role,tk('role.'+role)]),roles.includes(fight.team.roles?.[id])?fight.team.roles[id]:roles[0],name(fight,id));
        if(fight.encounter?.siegeTeam){
          const rule=fight.encounter.siegeTeam;
          html+=select('teamTarget-'+id,[rule.bossTarget,...rule.freeTargets].filter(index=>isDestinyOpponentActive(fight,index)).map(index=>[index,fight.opponents[index].name]),rule.bossTarget,tk('target'));
        }
      }
    }
    if(!pending&&fight.team.stage==='speed'){
      const remaining=ids.filter(id=>fight.team.roles[id]==='attack'&&destinyTeamHero(fight,id).hero.health>0&&!fight.team.independentRound?.done.includes(id)&&!fight.team.rolled.includes(id));
      const automatic=remaining.filter(id=>fight.encounter?.siegeTeam?.freeTargets.includes(fight.team.targetsByActor[id]));
      const rollable=remaining.filter(id=>!automatic.includes(id));
      if(rollable.length)html+=select('teamRollActor',rollable.map(id=>[id,name(fight,id)]),rollable.includes(fight.team.active)?fight.team.active:rollable[0],tk('attacker'))+button('team-roll-speed',tk('roll-speed'));
      const ready=fight.team.independentRound?
        ids.filter(id=>!fight.team.independentRound.done.includes(id)&&(fight.team.rolled.includes(id)||automatic.includes(id))):remaining.length?[]:ids;
      if(ready.length){
        if(fight.team.independentRound)html+=select('teamResolveActor',ready.map(id=>[id,name(fight,id)]),ready[0],tk('attacker'));
        html+=button('team-resolve-speed',tk('resolve-speed'));
      }
    }
    if(!pending&&fight.team.stage==='speed-choice')html+=select('teamWinner',fight.team.speedChoices.map(id=>[id,name(fight,id)]),fight.team.speedChoices[0],tk('winningHero'))+button('team-resolve-speed',tk('resolve-speed'));
    // Defender acts on the other hero's attack without first switching away
    // from its pending dice, which the engine deliberately forbids.
    const defenders=ids.filter(id=>{const actor=destinyTeamHero(fight,id);return actor.hero.health>0&&hasDestinyAbility(actor,'defender')&&!actor.used.defender;});
    const event=fight.phase==='ability-rolled'&&fight.turn?.pendingAbility?.type==='encounter'&&fight.turn.pendingAbility.event.kind==='enemy-dice-damage';
    const score=fight.team.stage==='damage'&&fight.turn?.winner==='opponent'&&['damage','damage-rolled'].includes(fight.phase);
    const eligible=defenders.filter(id=>id!==(event?fight.team.active:fight.team.roundWinner));
    if((event||score)&&eligible.length)html+=select('defenderActor',eligible.map(id=>[id,name(fight,id)]),eligible[0],tk('defendingHero'))+button('team-defend',tk('defendAlly'));
    if(!pending&&defenders.length&&['damage','end'].includes(fight.team.stage)){
      // Preview source identities on private snapshots. Placeholder dice are
      // discarded; actual end-of-round damage is rolled only by the engine.
      const sources=new Set();
      for(const id of ids){
        const context=switchDestinyTeamHero(fight,id);
        for(const effect of [...destinyPassiveEffects(context,()=>1),...(context.turn?.encounterEndEffects||[])])if(effect.target==='hero'&&effect.source)sources.add(effect.source);
      }
      if(sources.size)html+=`<details><summary>${escape(tk('defendPassive'))}</summary>${select('passiveDefender',defenders.map(id=>[id,name(fight,id)]),defenders[0],tk('defendingHero'))}${select('passiveDefenderSource',[...sources].map(source=>[source,title(source)||tk('encounter')]),undefined,tk('passiveSource'))}${button('team-defend-passive',tk('defendAlly'))}</details>`;
    }
    return html+'</fieldset>';
  }
  function startPayload(fight){
    if(!fight.team)return {};
    const roles=fight.team.order.map(id=>el('teamRole-'+id).value);
    const target=fight.encounter?.siegeTeam?Object.fromEntries(fight.team.order.map(id=>[id,integer('teamTarget-'+id)])):integer('target');
    return {roles,target};
  }
  function action(key,fight){
    if(!fight?.team)return false;
    if(key==='team-select')apply(key,{actor:integer('teamActor')});
    else if(key==='team-roll-speed')apply('roll-speed',{actor:integer('teamRollActor')});
    else if(key==='team-resolve-speed')apply('resolve-speed',{winnerActor:el('teamWinner')?integer('teamWinner'):el('teamResolveActor')?integer('teamResolveActor'):undefined});
    else if(key==='team-defend')apply('ability',{actor:integer('defenderActor'),name:'defender',options:{type:fight.phase==='ability-rolled'?'event':'score'}});
    else if(key==='team-defend-passive')apply('ability',{actor:integer('passiveDefender'),name:'defender',options:{type:'passive',source:el('passiveDefenderSource').value.trim()}});
    else return false;
    return true;
  }
  return {fields,nextAction,startPayload,action,name};
}
