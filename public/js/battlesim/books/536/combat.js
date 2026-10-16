// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function append(d,result){
  const { tk } = getContext();

  let message=result;
  if(typeof result==='object') {
    if(result.kind==='attack')message=tk('attack_log',{...result,side:tk(result.side==='player'?'player':'enemy')});
    else if(result.spell)message=tk('spell_log',{...result,spell:tk(`spell.${result.spell}`),result:tk(result.success?'success':'failure')});
    else if(result.kind==='initiative')message=tk(`status.${result.first??'initiative'}`);
    else if(result.kind==='death-luck')message=tk('luck_log',{result:tk(result.success?'success':'failure'),roll:result.roll});
    else if(result.kind==='manual-damage')message=tk('damage_log',{damage:result.damage});
    else message=tk(result.kind??'success');
    if(result.poisonCheckRequired)message+=' '+tk('poison_note');
  }else if(typeof result==='boolean')message=tk(result?'success':'failure');
  d.log.push(String(message));d.log=d.log.slice(-150);
}

function record(d) {
  const { tk } = getContext();

  const fight=d.fight;
  if(!fight||fight.recorded||!['win','loss'].includes(fight.outcome))return;
  fight.recorded=true;
  d.history.push({enemy:fight.encounter.custom?fight.encounter.name:`${fight.encounter.enemy??fight.encounter.enemies.join(', ')} (${tk('section',{section:fight.encounter.section})})`,outcome:fight.outcome,ts:Math.max(Date.now(),(d.history.at(-1)?.ts??0)+1)});
}

function store(d){
  const { record, renderSim536, saveState } = getContext();
record(d);saveState();renderSim536();}

function result(d,value) {
  const { append, showAlert, store, tk } = getContext();

  if(value==null)return;
  if(value.error)showAlert(tk('error',{reason:value.error.replaceAll('-',' ')}));else append(d,value);
  store(d);
}

function start() {
  const { active, append, character, createDemondoomFight, customSetup, data, el, number, prepareDemondoomEncounter, showAlert, store, tk } = getContext();

  const d=data();if(!d||active(d)||character(d).lifePoints<=0)return;
  try {
    const prepared=prepareDemondoomEncounter(el('encounter').value,character(d),customSetup?.settings(d,{spawnCount:number('spawnCount')})??{spawnCount:number('spawnCount')});
    prepared.player.talismanUsedAfterFight=false;
    const section=String(prepared.encounter.section);
    if(prepared.player.magicSection!==section){prepared.player.magicArmour=0;prepared.player.magicSection=section;}
    d.fight=createDemondoomFight(prepared);
    append(d,tk('section',{section}));store(d);
  }catch{showAlert(tk('invalid'));}
}

function act(action) {
  const { applyDemondoomManualDamage, data, determineDemondoomInitiative, endDemondoomGroupRound, finishDemondoomFight, number, resolveDemondoomDeathLuck, result, rollDemondoomAttack, target } = getContext();

  const d=data(),fight=d?.fight;if(!fight||fight.outcome)return;
  let value;
  if(action==='death_luck')value=resolveDemondoomDeathLuck(fight);
  else if(fight.pending)return;
  else if(action==='initiative')value=determineDemondoomInitiative(fight);
  else if(action==='player_attack'||action==='enemy_attack')value=rollDemondoomAttack(fight,action==='player_attack'?'player':'enemy',target());
  else if(action==='end_round')value=endDemondoomGroupRound(fight);
  else if(action==='apply_damage')value=applyDemondoomManualDamage(fight,number('manual_damage'));
  else if(action==='leprosy_tick'&&fight.leprosy)value=applyDemondoomManualDamage(fight,fight.player.lifePoints/10);
  else if(action==='poison'&&fight.encounter.rule==='assassin')value=applyDemondoomManualDamage(fight,fight.player.lifePoints);
  else if(action==='reconsider')value=finishDemondoomFight(fight,'reconsider');
  result(d,value);
}

// END EXTRACTED RULES
  return { append, record, store, result, start, act };
}
