// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function label(id){
  const { tk } = getContext();

  const enemy=tk(`enemy_names.${id}`);
  return String(id).startsWith('dream')?tk('dream_label',{enemy,number:String(id).slice(5)})
    :tk('encounter_label',{enemy,section:id});
}

function record(d){
  const { label } = getContext();

  const f=d.fight;
  if(!f || f.recorded || !['win','loss','knockout'].includes(f.status))return;
  f.recorded=true;
  d.history.push({enemy:label(f.spec.id),outcome:f.status==='win'?'win':'loss',
    ts:Math.max(Date.now(),(d.history.at(-1)?.ts??0)+1)});
}

function update(d){
  const { action, record, renderSim531, saveState, tk } = getContext();

  for(const event of d.fight?.events.slice(d.loggedEvents??0)??[]){
    d.log.push(tk('action_result',{action:tk('event_'+event.kind),roll:event.roll??'-',
      damage:event.damage??0,result:typeof event.success==='boolean'?tk(event.success?'success':'failed'):''}));
  }
  d.loggedEvents=d.fight?.events.length??0;
  record(d);d.log=d.log.slice(-150);saveState();renderSim531();
}

function action(apply){
  const { data, renderSim531, showAlert, tk, update } = getContext();

  const d=data();if(!d)return;
  try{apply(d);update(d);}catch{showAlert(tk('invalid'));renderSim531();}
}

function confirm(message,apply){
  const { action, currentPlaythrough, data, showConfirm } = getContext();

  const d=data(),run=currentPlaythrough(),prior=d?.fight;if(!d)return;
  showConfirm(message,()=>{
    if(data()!==d || currentPlaythrough()!==run || d.fight!==prior)return;
    action(apply);
  });
}

function start(d,id,settings={}){
  const { character, record, rules } = getContext();

  const next=rules.startRealmFight(character(d),id,settings);
  record(d);d.fight=next;d.loggedEvents=0;
}

function dream(d,number){
  const { character, rules, start, tk } = getContext();

  const result=rules.realmDream(character(d),number);if(!result)return;
  d.dream=result;
  let outcome=result.dead?'dream_dead':result.redream?'dream_again':result.wake===false?'dream_sleep'
    :result.optionalEncounter?'dream_optional':result.encounter?'dream_combat':'dream_wake';
  d.log.push(tk('dream_result',{number,result:tk(outcome)}));
  if(result.encounter)start(d,result.encounter);
}
// END EXTRACTED RULES
  return { label, record, update, action, confirm, start, dream };
}
