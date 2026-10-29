import { createOpponentEditor } from '../../opponents.js';
import { knightCharacter, knightRecovery, acquireKnightWeapon, startKnightFight, knightRound, knightInterrogation } from './knight.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const active = state => state?.fight?.status === 'fighting';
const stats = [
  ['ws','Weapon Skill',1,100], ['s','Strength',0,6], ['maxS','Starting Strength',1,6],
  ['t','Toughness',0,6], ['maxT','Starting Toughness',1,6], ['a','Attacks',1,100],
  ['w','Wounds',0], ['maxW','Starting Wounds',1], ['taint','Taint',0], ['armour','Armour save',0,6],
  ['healingPacks','Healing Packs',0],
];
const enemyFields = [
  {key:'ws',label:'Weapon Skill',min:1,max:100}, {key:'s',label:'Strength',min:1,max:6},
  {key:'t',label:'Toughness',min:1,max:6}, {key:'w',label:'Wounds',min:1},
  {key:'a',label:'Attacks',min:1,max:100}, {key:'damage',label:'Damage multiplier',min:0.1,max:1000,step:0.1},
  {key:'armour',label:'Armour save',min:0,max:6},
  {key:'armouredSkaven',label:'Armour weakness',options:[{value:'no',label:'Other opponent'},{value:'yes',label:'Armoured Skaven'}]},
];
const editableEnemy = enemy => ({...enemy,displayName:enemy.name,damage:enemy.weapon.damage,armouredSkaven:enemy.armouredSkaven?'yes':'no'});

export function createKnightPanel({document,definition,getRoster,getPlayerDefaults,t,getRun,getBookId,saveState,
  getButtonRow,showAlert,showConfirm,registerShortcut=()=>{}}) {
  const ID=definition.stateKey, el=key=>document.getElementById(ID+'-'+key);
  let shownRun,shownEncounter,shownContext,editor;
  const defaults=()=>getPlayerDefaults();
  function data() {
    if(Number(getBookId())!==definition.id)return null;
    const run=getRun();
    if(!run)return null;
    return run[ID]??={character:knightCharacter(defaults().character),encounter:'',context:'',fight:null,history:[],log:[],custom:{},prisoner:structuredClone(defaults().interrogation.initial)};
  }
  const selected=state=>getRoster().find(entry=>entry.section===state.encounter);
  function preset(state) {
    const entry=selected(state);
    if(!entry)return null;
    const result=structuredClone(entry),variant=entry.variants.find(item=>item.fromSection===state.context);
    if(variant){
      result.label+=' · '+variant.label;
      if(variant.initiative)result.initiative=variant.initiative;
      if(variant.enemyCount)result.enemies=result.enemies.slice(0,variant.enemyCount);
      if(variant.enemyWoundsChange)for(const enemy of result.enemies){enemy.w=Math.max(0,enemy.w+variant.enemyWoundsChange);enemy.maxW=enemy.w;}
    }
    return result;
  }
  const close=()=>el('overlay')?.classList.remove('active');
  function open(){if(!data()){showAlert(t('battlesim.no_active_playthrough'));return;}render();el('overlay').classList.add('active');}
  function number(key) {
    const field=el(key),raw=field.value.trim(),value=Number(raw),step=Number(field.step||1);
    if(!raw||!Number.isFinite(value)||value<Number(field.min)||value>Number(field.max)||Math.abs(value/step-Math.round(value/step))>1e-8)throw new RangeError('Check '+key);
    return value;
  }
  function readCharacter(){return knightCharacter({...data().character,...Object.fromEntries(stats.map(([key])=>[key,number(key)])),
    weapon:{name:el('weaponName').value.trim().slice(0,200),damage:number('weaponDamage')}});}
  function action(update) {
    const run=getRun();
    if(run!==shownRun||Number(getBookId())!==definition.id)return;
    const original=data();if(!original)return;
    try{
      const state=structuredClone(original);update(state);
      if(getRun()!==run||Number(getBookId())!==definition.id)return;
      const fight=state.fight;
      if(fight&&!fight.recorded&&['win','loss','interrupted'].includes(fight.status)){
        fight.recorded=true;
        state.history.push({enemy:fight.config.label??'Custom fight',outcome:fight.status,section:fight.section,ts:Math.max(Date.now(),(state.history.at(-1)?.ts??0)+1)});
      }
      state.log=state.log.slice(-100);run[ID]=state;saveState();render();
    }catch(error){showAlert(error.message||'Check the simulator values.');}
  }
  function config(state) {
    const source=preset(state),base=source??getRoster()[0];
    const enemies=editor.read().map((row,index)=>({...row,name:row.displayName||'Opponent',
      key:source?.enemies[index].key??'custom-'+index,maxW:row.w,
      weapon:{name:row.weapon?.name??'',damage:row.damage},armouredSkaven:row.armouredSkaven==='yes'}));
    return {...(source??{}),section:source?.section??'custom',label:source?.label??'Custom fight',enemies,
      initiative:source?.initiative??el('initiative').value,taintLimit:base.taintLimit,taintSection:base.taintSection,armourWeaknessDamage:base.armourWeaknessDamage};
  }
  function start(state) {
    if(active(state))return;
    state.character=readCharacter();const entry=config(state);
    if(!selected(state))state.custom={enemies:editor.snapshot(),initiative:el('initiative').value};
    state.fight=startKnightFight(state.character,entry,{applyEntryEffects:el('entryEffects').checked,
      victoryItem:el('victoryItem').checked,armourWeakness:Boolean(state.character.armourWeakness)});
    state.character=state.fight.character;
    state.log.push('Started: '+entry.label+'.');
    el('entryEffects').checked=false;
  }
  function step(state) {
    if(!active(state))return;
    const targets=[...el('targets').querySelectorAll('select')].map(input=>Number(input.value));
    const before=state.fight.round;
    state.fight=knightRound(state.fight,{targets});state.character=state.fight.character;
    const fight=state.fight,event=fight.round!==before?fight.history.at(-1):null;
    if(event)state.log.push(`Round ${event.round}. `+event.attacks.map(hit=>`${hit.attacker}: ${hit.hitRoll}/${hit.hitThreshold} hit`
      +(hit.woundRoll?`, ${hit.woundRoll}/${hit.woundThreshold} wound`:hit.automaticWound?', automatic wound':hit.cannotWound?', cannot wound':'')
      +(hit.saveRoll?`, ${hit.saveRoll}/${hit.saveThreshold} save${hit.saved?' (saved)':''}`:'')+(hit.damage?`, ${hit.damage} damage`:'')).join('; '));
    if(!active(state))state.log.push((fight.status==='win'?'Victory!':fight.status==='interrupted'?'Combat interrupted.':'Defeated.')+(fight.section?' Continue at section '+fight.section+'.':''));
  }
  function render() {
    if(!el('overlay'))return;
    const state=data();if(!state){shownRun=undefined;close();return;}
    const changed=shownRun!==getRun();if(changed){shownRun=getRun();shownEncounter=shownContext=undefined;}
    const entry=preset(state),locked=active(state),fight=state.fight;
    el('encounter').value=state.encounter;
    if(changed||shownEncounter!==state.encounter||shownContext!==state.context){
      shownEncounter=state.encounter;shownContext=state.context;
      const source=selected(state);
      el('context').innerHTML='<option value="">Printed encounter</option>'+(source?.variants??[]).map(v=>`<option value="${escape(v.fromSection)}">${escape(v.label)}</option>`).join('');
      el('context').value=state.context;el('contextRow').hidden=!source?.variants.length;
      editor.fixCount(Boolean(entry));editor.set(entry?entry.enemies.map(editableEnemy):state.custom.enemies??[editableEnemy(defaults().customEnemy)]);editor.element.open=!entry;
      el('initiative').value=entry?.initiative??state.custom.initiative??'you';el('entryEffects').checked=false;
    }
    for(const[key]of stats)el(key).value=state.character[key];
    el('weaponName').value=state.character.weapon.name;el('weaponDamage').value=state.character.weapon.damage;
    for(const control of el('character').querySelectorAll('input,button'))control.disabled=locked;
    for(const control of el('recovery').querySelectorAll('button'))control.disabled=locked;
    el('specialWeapon').disabled=locked||Boolean(state.character.acquiredWeapons?.[defaults().specialWeapon.name]);
    el('learnWeakness').disabled=locked||Boolean(state.character.armourWeakness);
    el('weaknessStatus').textContent=state.character.armourWeakness?'Armour weakness learned.':'';
    el('encounter').disabled=el('context').disabled=locked;el('initiative').disabled=locked||Boolean(entry);
    editor.lock(locked);
    el('entryRow').hidden=!entry?.entryEffects?.length;el('entryEffects').disabled=locked;
    el('entryNote').textContent=(entry?.entryEffects??[]).map(effect=>effect.kind==='removeItem'?'Remove '+effect.name+' from your recorded items':effect.kind==='setWounds'?'Set Wounds to '+effect.amount:effect.kind+': '+(effect.amount>0?'+':'')+effect.amount).join(' · ');
    el('victoryRow').hidden=!entry?.victoryItemCheck;el('victoryItem').disabled=locked;
    el('victoryLabel').textContent=entry?.victoryItemCheck?'I have '+entry.victoryItemCheck.name:'';
    const notes=[];
    if(entry?.surviveRounds)notes.push('Hold for '+entry.surviveRounds+' rounds; track total damage.');
    if(entry?.interruptBeforeRound)notes.push('Combat stops before round '+entry.interruptBeforeRound+'.');
    if(entry?.maxRounds)notes.push('Combat lasts at most '+entry.maxRounds+' rounds.');
    if(entry?.enemyWoundsAtMost!==undefined)notes.push('The duel stops at '+entry.enemyWoundsAtMost+' Wounds.');
    if(entry?.protectedCompanion)notes.push('Protect '+entry.protectedCompanion.name+': incoming damage goes to their Wounds without an armour save.');
    if(entry?.playerArmourDisabled)notes.push('Your armour save is unavailable for this fight.');
    const modifier=entry?.playerCombatModifiers?.ws;if(modifier)notes.push('Weapon Skill '+(modifier>0?'+':'')+modifier+' for this fight only.');
    el('note').textContent=notes.join(' ');
    el('start').disabled=locked;el('attack').disabled=el('cancel').disabled=!locked;
    const taintRule=getRoster()[0];
    el('status').textContent=state.character.taint>=taintRule.taintLimit?'Taint limit reached. Continue at section '+taintRule.taintSection+'.':fight?fight.status+' · Round '+fight.round+(fight.section?' · Section '+fight.section:''):'Ready';
    el('companion').textContent=fight?.companion?fight.companion.name+': '+fight.companion.w+' Wounds':'';
    el('tally').textContent=fight?.config.trackDamageInflicted?'Damage inflicted: '+fight.damageInflicted:'';
    el('followup').textContent=fight?.followUpSection?'After section '+fight.section+', your result leads to '+fight.followUpSection+'.':'';
    el('opponents').innerHTML=fight?'<table class="bsim-report-table"><thead><tr><th>Opponent</th><th>Wounds</th></tr></thead><tbody>'+fight.opponents.map((enemy,index)=>`<tr><td>${index+1}. ${escape(enemy.name)}</td><td>${enemy.w===null?'N/A':enemy.w+'/'+enemy.maxW}</td></tr>`).join('')+'</tbody></table>':'';
    const previous=[...el('targets').querySelectorAll('select')].map(input=>input.value),remaining=fight?.opponents.map((enemy,index)=>({enemy,index})).filter(({enemy})=>enemy.w===null||enemy.w>0)??[];
    el('targets').innerHTML=locked?Array.from({length:state.character.a},(_,index)=>`<label class="inv-edit-row"><span>Attack ${index+1} target</span><select class="inv-edit-input">${remaining.map(({enemy,index:i})=>`<option value="${i}">${escape(enemy.name)} (${i+1})</option>`).join('')}</select></label>`).join(''):'';
    [...el('targets').querySelectorAll('select')].forEach((input,index)=>{if(remaining.some(({index:i})=>String(i)===previous[index]))input.value=previous[index];});
    el('log').innerHTML=state.log.slice().reverse().map(line=>'<div>'+escape(line)+'</div>').join('');
    el('history').innerHTML=state.history.slice(-30).reverse().map(item=>'<div>'+escape(item.enemy)+' · '+escape(item.outcome)+'</div>').join('');
    for(const key of ['w','taint'])el('prisoner-'+key).value=state.prisoner[key];
    for(const control of el('interrogation').querySelectorAll('input,select,button'))control.disabled=locked;
  }
  const row=(label,control,id='')=>`<label class="inv-edit-row"${id?` id="${ID}-${id}"`:''}><span>${escape(label)}</span>${control}</label>`;
  const input=(key,label,value=0,min=0,max=1000000,step=1)=>row(label,`<input class="inv-edit-input" id="${ID}-${key}" type="number" value="${value}" min="${min}" max="${max}" step="${step}">`);
  const select=(key,label,options,id='')=>row(label,`<select class="inv-edit-input" id="${ID}-${key}">${options}</select>`,id);
  const button=(key,label)=>`<button type="button" class="bsim-action-btn" id="${ID}-${key}">${escape(label)}</button>`;
  function init() {
    if(el('overlay'))return;
    const overlay=document.createElement('div');overlay.id=ID+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(t(definition.i18nPrefix+'.title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><details open id="${ID}-character"><summary>Character</summary><p>${escape(defaults().note)}</p>${stats.map(([key,label,min,max])=>input(key,label,defaults().character[key],min,max??1000000)).join('')}${row('Weapon',`<input class="inv-edit-input" id="${ID}-weaponName" maxlength="200">`)}${input('weaponDamage','Damage multiplier',1,0.1,1000,0.1)}<div class="bsim-btn-row">${button('apply','Apply sheet')}</div></details><details id="${ID}-recovery"><summary>Recovery and equipment</summary><p>Use recovery only when the book allows it. Healing Packs have no automatic healing amount; enter the Wounds instructed by the book.</p><div class="bsim-btn-row">${button('restoreW','Restore Wounds')}${button('restoreWST','Restore Wounds / S / T')}${button('specialWeapon','Record '+defaults().specialWeapon.name)}${button('learnWeakness','Learn armour weakness')}</div><p id="${ID}-weaknessStatus"></p></details>${select('encounter','Encounter','<option value="">Custom fight</option>'+getRoster().map(entry=>`<option value="${entry.section}">${escape(entry.label)}</option>`).join(''))}${select('context','Approach','', 'contextRow')}${select('initiative','Initiative','<option value="you">You first</option><option value="enemy">Enemies first</option>')}<p id="${ID}-note"></p><div id="${ID}-enemyEditor"></div><div id="${ID}-entryRow"><p id="${ID}-entryNote"></p><label class="bsim-checkbox"><input type="checkbox" id="${ID}-entryEffects">Also apply unrecorded passage changes</label></div><label class="bsim-checkbox" id="${ID}-victoryRow"><input type="checkbox" id="${ID}-victoryItem"><span id="${ID}-victoryLabel"></span></label><div id="${ID}-targets"></div><div class="bsim-btn-row">${button('start','Start fight')}${button('attack','Next round')}${button('cancel','End fight')}</div><details id="${ID}-interrogation"><summary>Prisoner interrogation</summary><p>These counters belong to the prisoner.</p>${input('prisoner-w','Prisoner Wounds',defaults().interrogation.initial.w)}${input('prisoner-taint','Prisoner Taint',defaults().interrogation.initial.taint)}${select('method','Method',defaults().interrogation.methods.map(method=>`<option value="${method.section}">${escape(method.name)}</option>`).join(''))}${button('question','Apply method')}</details></div><div class="bsim-col bsim-col-right"><div role="status" id="${ID}-status"></div><div role="status" id="${ID}-companion"></div><div role="status" id="${ID}-tally"></div><div role="status" id="${ID}-followup"></div><div id="${ID}-opponents"></div><div class="bsim-log" id="${ID}-log"></div><details><summary>Battle history</summary><div id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor=createOpponentEditor({document,id:ID,t,fields:enemyFields,isStatUnavailable:(key,value)=>key==='w'&&value.w===null,
      presets:getRoster().flatMap(entry=>entry.enemies.map(editableEnemy))});el('enemyEditor').appendChild(editor.element);
    const launch=document.createElement('button');launch.id=ID+'-btn';launch.textContent=t('battlesim.title');launch.style.display='none';getButtonRow().appendChild(launch);launch.addEventListener('click',open);el('close').addEventListener('click',close);
    let backdrop=false;overlay.addEventListener('mousedown',event=>{backdrop=event.target===overlay;});overlay.addEventListener('click',event=>{if(backdrop&&event.target===overlay)close();});
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();}});registerShortcut({button:launch,overlay,open,close});
    el('encounter').addEventListener('change',()=>action(state=>{if(active(state))return;state.character=readCharacter();if(!selected(state))state.custom.enemies=editor.snapshot();state.encounter=el('encounter').value;state.context='';}));
    el('context').addEventListener('change',()=>action(state=>{if(!active(state)){state.character=readCharacter();state.context=el('context').value;}}));
    el('apply').addEventListener('click',()=>action(state=>{if(!active(state))state.character=readCharacter();}));
    el('start').addEventListener('click',()=>action(start));el('attack').addEventListener('click',()=>action(step));
    for(const key of ['restoreW','restoreWST','specialWeapon','learnWeakness','cancel'])el(key).addEventListener('click',()=>{
      if(getRun()!==shownRun)return;
      const run=getRun(),original=data(),fight=original?.fight;
      if(!original||(key==='cancel')!==active(original))return;
      const question=key==='cancel'?'End this fight and keep current Wounds and history?':key==='specialWeapon'?'Record this weapon’s bonuses and one-time Taint reduction?':key==='learnWeakness'?'Record the armour weakness and gain 1 Taint?':'Apply this recovery now, as instructed by the book?';
      showConfirm(question,()=>{
        if(getRun()!==run||data()!==original||data()?.fight!==fight)return;
        action(state=>{
          if(key==='cancel'){state.fight.status='cancelled';state.fight.section=null;return;}
          const character=readCharacter();
          if(key==='specialWeapon')state.character=acquireKnightWeapon(character,defaults().specialWeapon);
          else if(key==='learnWeakness'){
            if(!character.armourWeakness){state.character=knightRecovery(character,{taint:1});state.character.armourWeakness=true;}
          }else state.character=knightRecovery(character,{restoreWounds:true,restoreStrength:key==='restoreWST',restoreToughness:key==='restoreWST'});
        });
      });
    });
    el('question').addEventListener('click',()=>action(state=>{
      if(active(state))return;
      const method=defaults().interrogation.methods.find(item=>item.section===el('method').value);
      state.prisoner=knightInterrogation({w:number('prisoner-w'),taint:number('prisoner-taint')},method,defaults().interrogation);
      state.log.push('Prisoner: '+state.prisoner.w+' Wounds, '+state.prisoner.taint+' Taint. Continue at section '+state.prisoner.section+'.');
    }));
  }
  return {init,render,setVisible(value){const launch=el('btn');if(launch)launch.style.display=value?'':'none';if(!value)close();}};
}
