import { createOpponentEditor } from '../../opponents.js';
import { vampireCharacter, vampireRecovery, vampireStats, startVampireFight, vampireRound, resumeVampireFight } from './vampire.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const locked = state => ['fighting','paused'].includes(state?.fight?.status);
const canDrink = state => ['win','loss'].includes(state?.fight?.status)&&state.character.w>0&&state.fight.options.chalice&&!state.fight.chaliceUsed;

export function createVampirePanel({document,definition,getRoster,getPlayerDefaults,t,getRun,getBookId,saveState,
  getButtonRow,showAlert,showConfirm,registerShortcut=()=>{}}) {
  const ID=definition.stateKey, el=key=>document.getElementById(ID+'-'+key), tr=(key,params)=>t(definition.i18nPrefix+'.'+key,params);
  const defaults=()=>getPlayerDefaults();
  const fields=[['ws',1,100],['s',1,100],['t',1,100],['a',0,100],['w',0,1000000],['maxW',1,1000000],['taint',1,1000000],['armour',0,6]];
  let shownRun,shownPreset,editor;
  const close=()=>el('overlay')?.classList.remove('active');
  function data() {
    if(Number(getBookId())!==definition.id||!getRun())return null;
    return getRun()[ID]??={character:vampireCharacter(defaults().character),bloodline:defaults().bloodlines[0].key,
      encounter:'',companion:false,fight:null,previous:null,history:[],log:[],custom:{},items:{}};
  }
  const selected=state=>getRoster().find(entry=>entry.section===state.encounter);
  function preset(state) {
    const source=selected(state);
    return state.companion&&source?.companionRedirect
      ?getRoster().find(entry=>entry.section===String(source.companionRedirect)):source;
  }
  const editable=enemy=>({...enemy,displayName:enemy.name,damage:enemy.weapon.damage,
    undead:enemy.undead?'yes':'no',magicalAttack:enemy.magicalAttack?'yes':'no'});
  function number(key) {
    const field=el(key),raw=field.value.trim(),value=Number(raw),step=Number(field.step||1);
    if(!raw||!Number.isFinite(value)||value<Number(field.min)||value>Number(field.max)
      ||Math.abs(value/step-Math.round(value/step))>1e-8)throw new RangeError(tr('invalid'));
    return value;
  }
  function readCharacter() {
    return vampireCharacter({...data().character,...Object.fromEntries(fields.map(([key])=>[key,number(key)])),
      weapon:{...data().character.weapon,name:el('weaponName').value.trim().slice(0,200),damage:number('weaponDamage')}});
  }
  function act(update) {
    const run=getRun();
    if(run!==shownRun||Number(getBookId())!==definition.id)return;
    const original=data();if(!original)return;
    try {
      const state=structuredClone(original);update(state);
      if(getRun()!==run||Number(getBookId())!==definition.id)return;
      const fight=state.fight;
      if(fight&&!fight.recorded&&['win','loss'].includes(fight.status)) {
        fight.recorded=true;state.previous=structuredClone(fight);
        state.history.push({enemy:fight.config.label??tr('custom'),outcome:fight.status,section:fight.section,
          ts:Math.max(Date.now(),(state.history.at(-1)?.ts??0)+1)});
      }
      state.log=state.log.slice(-100);run[ID]=state;saveState();render();
    }catch(error){showAlert(error.message||tr('invalid'));}
  }
  function config(state) {
    const source=preset(state);
    return {...(source??{}),section:source?.section??'custom',label:source?.label??tr('custom'),
      initiative:source?.initiative??el('initiative').value,
      enemies:editor.read().map((row,index)=>({...row,key:source?.enemies[index]?.key??'custom-'+index,
        name:row.displayName||tr('opponent'),maxW:row.w,weapon:{...row.weapon,damage:row.damage},
        undead:row.undead==='yes',magicalAttack:row.magicalAttack==='yes'}))};
  }
  function start(state) {
    if(locked(state))return;
    state.character=readCharacter();state.items=Object.fromEntries(['bloodstone','vanhalRing','chalice'].map(key=>[key,el(key).checked]));
    const entry=config(state);
    if(!selected(state))state.custom={enemies:editor.snapshot(),initiative:el('initiative').value};
    state.fight=startVampireFight(state.character,entry,{...state.items,nextBattleAttackPenalty:el('penalty').checked,
      applyEntryEffects:el('entryEffects').checked},state.previous);
    state.character=state.fight.character;state.log.push(tr('started',{name:entry.label}));
    el('penalty').checked=el('entryEffects').checked=false;
  }
  function step(state) {
    if(state.fight?.status!=='fighting')return;
    const previousRound=state.fight.round,previousAttacks=state.fight.history.at(-1)?.attacks.length??0;
    state.fight=vampireRound(state.fight,{targets:[...el('targets').querySelectorAll('select')].map(input=>Number(input.value))});
    state.character=state.fight.character;
    const event=state.fight.history.at(-1);
    if(event){
      state.log.push(tr('roundResult',{round:event.round,you:event.you,enemy:event.enemy}));
      for(const hit of event.attacks.slice(event.round===previousRound?previousAttacks:0))state.log.push(hit.attacker+' → '+hit.defender+': '+tr('hit')+' '+hit.hitRoll+'/'+hit.hitThreshold
        +(hit.woundRoll?' · '+tr('wound')+' '+hit.woundRoll+'/'+hit.woundThreshold:'')
        +(hit.woundReroll?' · '+tr('reroll')+' '+hit.woundReroll:'')
        +(hit.saveRoll?' · '+tr('save')+' '+hit.saveRoll+'/'+hit.saveThreshold:'')
        +(hit.damage!==undefined?' · '+tr('damageDealt',{damage:hit.damage}):''));
    }
    if(state.fight.status!=='fighting')state.log.push(tr(state.fight.status)+(state.fight.section?' · '+tr('section',{section:state.fight.section}):''));
  }
  function confirm(update,question) {
    const run=getRun();
    if(run!==shownRun||Number(getBookId())!==definition.id)return;
    const original=data(),fight=original?.fight;if(!original)return;
    showConfirm(question,()=>{if(getRun()===run&&data()===original&&data()?.fight===fight)act(update);});
  }
  function render() {
    if(!el('overlay'))return;
    const state=data();if(!state){shownRun=undefined;close();return;}
    const changed=shownRun!==getRun();if(changed){shownRun=getRun();shownPreset=undefined;}
    const entry=preset(state),fight=state.fight,busy=locked(state),token=state.encounter+':'+state.companion;
    el('encounter').value=state.encounter;el('bloodline').value=state.bloodline;
    if(changed||token!==shownPreset){
      shownPreset=token;editor.fixCount(Boolean(entry));editor.set(entry?entry.enemies.map(editable):state.custom.enemies??[editable(defaults().customEnemy)]);
      editor.element.open=!entry;el('initiative').value=entry?.initiative??state.custom.initiative??'you';el('entryEffects').checked=false;
    }
    for(const[key]of fields)el(key).value=state.character[key];
    el('weaponName').value=state.character.weapon.name;el('weaponDamage').value=state.character.weapon.damage;
    for(const key of ['bloodstone','vanhalRing','chalice']){el(key).checked=Boolean(state.items[key]);el(key).disabled=busy;}
    for(const control of el('sheet').querySelectorAll('input,select,button'))control.disabled=busy;
    for(const key of ['encounter','companion','penalty','entryEffects'])el(key).disabled=busy;
    el('companion').checked=state.companion;el('companionRow').hidden=!selected(state)?.companionRedirect;
    el('entryRow').hidden=!entry?.openingPlayerDamage;
    el('initiative').disabled=busy||Boolean(entry);editor.lock(busy);
    for(const option of el('initiative').options)option.textContent=tr(entry?.turnOrder&&entry.initiative===option.value?'printedOrder':option.value==='you'?'youFirst':'enemyFirst');
    const notes=[];
    if(entry?.initiativeOrder)notes.push(entry.initiativeOrder.join(' → ')+'.');
    if(entry?.immediateEnemyWoundsThreshold!==undefined)notes.push(tr('threshold',{wounds:entry.immediateEnemyWoundsThreshold,section:entry.immediateThresholdDestination}));
    if(entry?.beforeRoundNumber)notes.push(tr('timed',{round:entry.beforeRoundNumber,section:entry.immediateRoundDestination}));
    if(entry?.quickVictoryRoundLimit)notes.push(tr('quick',{round:entry.quickVictoryRoundLimit}));
    if(entry?.joust)notes.push(tr('joustNote'));
    if(entry?.priestRerollsFailedWounds)notes.push(tr('rerollNote'));
    if(entry?.preservePreviouslyLostEnemyWounds)notes.push(tr('carryWounds'));
    if(entry?.sourceDiffersFromCompanionVariant)notes.push(tr('printedVariant'));
    if(fight&&busy){const effective=vampireStats(fight);notes.push(tr('effective',{s:effective.s,t:effective.t,a:effective.a}));}
    el('note').textContent=notes.join(' ');
    el('status').textContent=fight?tr(fight.status)+' · '+tr('round',{round:fight.round})+(fight.section?' · '+tr('section',{section:fight.section}):''):tr('ready');
    el('start').disabled=busy;el('attack').disabled=fight?.status!=='fighting';el('cancel').disabled=!busy;
    el('resumeRow').hidden=fight?.status!=='paused';
    const continuation=defaults().continuations.find(item=>item.resumeSection===fight?.config.section);
    el('resume').disabled=fight?.status!=='paused'||!continuation;
    el('resume').textContent=tr('resume',{section:continuation?.section??''});
    el('heal').disabled=busy||!canDrink(state);
    el('recover').disabled=busy;
    el('opponents').innerHTML=fight?'<table class="bsim-report-table"><thead><tr><th>'+escape(tr('opponent'))+'</th><th>'+escape(tr('w'))+'</th></tr></thead><tbody>'+fight.opponents.map((foe,i)=>'<tr><td>'+escape((i+1)+'. '+foe.name)+'</td><td>'+foe.w+'/'+foe.maxW+'</td></tr>').join('')+'</tbody></table>':'';
    const previous=[...el('targets').querySelectorAll('select')].map(input=>input.value);
    const living=fight?.opponents.flatMap((enemy,index)=>enemy.w>0?[{enemy,index}]:[])??[];
    const count=fight?.status==='fighting'?vampireStats(fight).a:0;
    el('targets').innerHTML=Array.from({length:count},(_,i)=>row(tr('target',{attack:i+1}),'<select class="inv-edit-input">'+living.map(({enemy,index})=>'<option value="'+index+'">'+escape((index+1)+'. '+enemy.name)+'</option>').join('')+'</select>')).join('');
    [...el('targets').querySelectorAll('select')].forEach((input,i)=>{if(living.some(e=>String(e.index)===previous[i]))input.value=previous[i];});
    el('log').innerHTML=state.log.slice().reverse().map(line=>'<div>'+escape(line)+'</div>').join('');
    el('history').innerHTML=state.history.slice(-30).reverse().map(item=>'<div>'+escape(item.enemy)+' · '+escape(tr(item.outcome))+'</div>').join('');
  }
  const row=(label,control)=>'<label class="inv-edit-row"><span>'+escape(label)+'</span>'+control+'</label>';
  const input=(key,label,min=0,max=1000000,step=1)=>row(label,`<input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="${max}" step="${step}" value="0">`);
  const select=(key,label,options)=>row(label,`<select class="inv-edit-input" id="${ID}-${key}">${options}</select>`);
  const button=(key,label)=>`<button type="button" class="bsim-action-btn" id="${ID}-${key}">${escape(label)}</button>`;
  const checkbox=(key,label)=>`<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}"><span>${escape(label)}</span></label>`;
  function init() {
    if(el('overlay'))return;
    const overlay=document.createElement('div');overlay.id=ID+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(tr('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><details open id="${ID}-sheet"><summary>${escape(tr('character'))}</summary><p>${escape(tr('taintNote'))}</p>${select('bloodline',tr('bloodline'),defaults().bloodlines.map(b=>'<option value="'+escape(b.key)+'">'+escape(b.label)+'</option>').join(''))}${fields.map(([key,min,max])=>input(key,tr(key),min,max)).join('')}${row(tr('weapon'),`<input class="inv-edit-input" id="${ID}-weaponName" maxlength="200">`)}${input('weaponDamage',tr('damage'),.1,1000,.1)}${select('weaponPreset',tr('weaponPreset'),'<option value="">'+escape(tr('choose'))+'</option>'+defaults().localEquipment.map((w,i)=>'<option value="'+i+'">'+escape(w.name)+'</option>').join(''))}${select('armourPreset',tr('armourPreset'),'<option value="">'+escape(tr('choose'))+'</option>'+defaults().localArmour.map((w,i)=>'<option value="'+i+'">'+escape(w.name)+'</option>').join(''))}<div class="bsim-btn-row">${button('apply',tr('apply'))}</div></details><details><summary>${escape(tr('items'))}</summary><p>${escape(tr('itemsNote'))}</p>${checkbox('bloodstone',tr('bloodstone'))}${checkbox('vanhalRing',tr('vanhalRing'))}${checkbox('chalice',tr('chalice'))}${checkbox('penalty',tr('penalty'))}${input('recovery',tr('recovery'),-1000000,1000000)}<div class="bsim-btn-row">${button('recover',tr('recover'))}${button('heal',tr('heal'))}</div></details>${select('encounter',tr('encounter'),'<option value="">'+escape(tr('custom'))+'</option>'+getRoster().map(e=>'<option value="'+e.section+'">'+escape(e.label)+'</option>').join(''))}<div id="${ID}-companionRow">${checkbox('companion',tr('companion'))}</div>${select('initiative',tr('initiative'),'<option value="you">'+escape(tr('youFirst'))+'</option><option value="enemy">'+escape(tr('enemyFirst'))+'</option>')}<p id="${ID}-note"></p><div id="${ID}-enemyEditor"></div><div id="${ID}-entryRow">${checkbox('entryEffects',tr('entryEffects'))}</div><div id="${ID}-targets"></div><div class="bsim-btn-row">${button('start',tr('start'))}${button('attack',tr('attack'))}${button('cancel',tr('cancel'))}</div><div id="${ID}-resumeRow">${button('resume','')}</div></div><div class="bsim-col bsim-col-right"><div role="status" id="${ID}-status"></div><div id="${ID}-opponents"></div><div class="bsim-log" id="${ID}-log"></div><details><summary>${escape(tr('history'))}</summary><div id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor=createOpponentEditor({document,id:ID,t,fields:[
      ...[['ws',1,100],['s',1,100],['t',1,100],['w',1,1000000],['a',0,100],['armour',0,6]].map(([key,min,max])=>({key,label:tr(key),min,max})),
      {key:'damage',label:tr('damage'),min:.1,max:1000,step:.1},
      ...['undead','magicalAttack'].map(key=>({key,label:tr(key),options:[{value:'no',label:tr('no')},{value:'yes',label:tr('yes')}]})),
    ],presets:getRoster().flatMap(entry=>entry.enemies.map(editable))});el('enemyEditor').appendChild(editor.element);
    const launch=document.createElement('button');launch.id=ID+'-btn';launch.textContent=t('battlesim.title');launch.style.display='none';getButtonRow().appendChild(launch);
    const open=()=>{if(!data()){showAlert(t('battlesim.no_active_playthrough'));return;}render();el('overlay').classList.add('active');};
    launch.addEventListener('click',open);el('close').addEventListener('click',close);registerShortcut({button:launch,overlay,open,close});
    let backdrop=false;overlay.addEventListener('mousedown',e=>{backdrop=e.target===overlay;});overlay.addEventListener('click',e=>{if(backdrop&&e.target===overlay)close();});
    overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}});
    el('encounter').addEventListener('change',()=>act(state=>{if(locked(state))return;state.character=readCharacter();if(!selected(state))state.custom.enemies=editor.snapshot();state.encounter=el('encounter').value;}));
    el('companion').addEventListener('change',()=>act(state=>{if(!locked(state))state.companion=el('companion').checked;}));
    el('apply').addEventListener('click',()=>act(state=>{if(!locked(state))state.character=readCharacter();}));
    el('start').addEventListener('click',()=>act(start));el('attack').addEventListener('click',()=>act(step));
    el('resume').addEventListener('click',()=>act(state=>{const rule=defaults().continuations.find(c=>c.resumeSection===state.fight?.config.section);if(rule)state.fight=resumeVampireFight(state.fight,rule);}));
    el('cancel').addEventListener('click',()=>confirm(state=>{if(locked(state)){state.fight.status='cancelled';state.fight.section=null;}},tr('cancelQuestion')));
    el('bloodline').addEventListener('change',()=>{if(getRun()!==shownRun||Number(getBookId())!==definition.id)return;const key=el('bloodline').value;el('bloodline').value=data()?.bloodline??'';confirm(state=>{if(locked(state))return;const choice=defaults().bloodlines.find(b=>b.key===key);if(choice){state.character=structuredClone(choice.character);state.bloodline=key;}},tr('bloodlineQuestion'));});
    for(const [key,list,apply]of [['weaponPreset','localEquipment',(state,item)=>{state.character.weapon=structuredClone(item);}],['armourPreset','localArmour',(state,item)=>{state.character.armour=item.save;}]])el(key).addEventListener('change',()=>act(state=>{if(locked(state)||el(key).value==='')return;state.character=readCharacter();const item=defaults()[list][Number(el(key).value)];if(item)apply(state,item);el(key).value='';}));
    el('recover').addEventListener('click',()=>{try{const wounds=number('recovery');confirm(state=>{if(!locked(state))state.character=vampireRecovery(readCharacter(),{wounds});},tr('recoveryQuestion'));}catch(error){showAlert(error.message);}});
    el('heal').addEventListener('click',()=>confirm(state=>{if(locked(state)||!canDrink(state))return;state.character=vampireRecovery(state.character,{wounds:2});state.fight.chaliceUsed=true;},tr('healQuestion')));
  }
  return {init,render,setVisible(value){const button=el('btn');if(button)button.style.display=value?'':'none';if(!value)close();}};
}
