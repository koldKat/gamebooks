import * as combat from './core.js';
import {createOpponentEditor} from '../../opponents.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const active = fight => fight?.status === 'active';
const fields = ['skill','skillInitial','stamina','staminaInitial','luck','luckInitial','gold','provisions','potionUses','attackModifier','nextFightPenalty'];

export function createFantasyPanel({document,definition,state,getRoster,getSettings,t,getRun,getBookId,
  getButtonRow,showAlert,showConfirm,registerShortcut = () => {}}) {
  const ID = definition.stateKey, el = key => document.getElementById(ID+'-'+key);
  const tk = (key,params) => t(definition.i18nPrefix+'.'+key,params);
  const button = key => `<button type="button" class="bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const field = key => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${key==='attackModifier'||key==='nextFightPenalty'?-1000:key.endsWith('Initial')?1:0}" max="${key==='potionUses'?1:key==='nextFightPenalty'?0:key==='attackModifier'?1000:10000}" step="1" required></label>`;
  let editor, shownRun, editorRun, rendered;
  const preset = () => getRoster().find(entry => entry.section === el('encounter').value);
  const items = () => getSettings().items;
  function close(){el('overlay')?.classList.remove('active');rendered=null;}
  function change(update) {
    if (shownRun !== getRun() || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) {close();return;}
    try {if(state.change(update))render(true);} catch {showAlert(tk('invalid'));}
  }
  function confirm(key,update) {
    const run=getRun(),before=state.read();
    showConfirm(tk(key),()=>{if(run===getRun() && before===state.read())change(update);});
  }
  function readCharacter() {
    const character = {...state.read()?.character,items:{},potion:el('potion').value};
    for(const key of fields){
      const input=el(key),raw=input.value.trim(),value=Number(raw);
      if(!raw||!Number.isSafeInteger(value)||value<Number(input.min)||value>Number(input.max)){input.closest('details')?.setAttribute('open','');input.focus();throw new RangeError('Invalid character');}
      character[key]=value;
    }
    for(const item of items())character.items[item.key]=item.slot==='weapon'?el('weapon').value===item.key:el('item-'+item.key).checked;
    return combat.validateCharacter(character);
  }
  const setup = () => ({section:el('encounter').value,opponents:editor.snapshot(),applyEntry:el('applyEntry').checked});
  function saveSetup(){
    if(shownRun!==getRun()||active(state.read()?.fight))return;
    state.change(data=>{data.setup=setup();});rendered=state.read();
  }
  function notes(){
    const entry=preset(),locked=active(state.read()?.fight);
    el('notes').textContent=(entry?.printedRules??[]).map(text=>text.replace(/<[^>]*>/g,'')).join(' ');
    el('applyEntryRow').hidden=!entry?.entry&&!entry?.consumeItem;
    el('applyEntry').disabled=locked;
    el('bypass').hidden=!entry?.bypass;
    el('bypass').textContent=entry?.bypass?.label??tk('bypass');
    el('bypass').disabled=locked||!state.read()?.character?.stamina;
  }
  function report(data,fight){
    data.fight=fight;
    for(const event of fight.events){
      if(event.kind==='attack')data.log.push(tk('attack',event));
      if(event.kind==='luck')data.log.push(tk('luckResult',{n:event.total,result:tk(event.lucky?'lucky':'unlucky')}));
      if(event.kind==='damage')data.log.push(tk('damage',{name:event.target==='player'?tk('you'):event.target,n:event.damage}));
      if(event.kind==='extraDamage')data.log.push(tk('extraDamage',{n:event.damage}));
      if(event.kind==='entry')data.log.push(tk('entryResult',{n:event.damage,luck:event.luck}));
      if(event.kind==='outcome')data.log.push(tk('status.'+event.status)+(event.destination?' '+tk('destination',{n:event.destination}):''));
    }
  }
  function render(force=false){
    if(!el('overlay')?.classList.contains('active'))return;
    if(shownRun!==getRun()||Number(getBookId())!==definition.id){close();return;}
    const data=state.read();if(!data||!force&&data===rendered)return;rendered=data;
    const fight=data.fight,locked=active(fight),hero=data.character;
    if(editorRun!==shownRun){
      editorRun=shownRun;el('encounter').value=data.setup.section??'custom';
      editor.set(data.setup.opponents??preset()?.enemies??[{}]);el('applyEntry').checked=data.setup.applyEntry??true;
    }
    for(const key of fields){el(key).value=hero?.[key]??'';el(key).disabled=locked;}
    for(const item of items().filter(item=>item.slot!=='weapon')){el('item-'+item.key).checked=Boolean(hero?.items[item.key]);el('item-'+item.key).disabled=locked;}
    el('weapon').value=items().find(item=>item.slot==='weapon'&&hero?.items[item.key])?.key??'none';el('weapon').disabled=locked;
    el('potion').value=hero?.potion??'skill';el('potion').disabled=locked;
    editor.fixCount(Boolean(preset()));editor.lock(locked);el('encounter').disabled=locked;
    for(const key of ['saveCharacter','newCharacter'])el(key).disabled=locked;
    el('start').disabled=locked||!hero?.stamina;
    el('round').disabled=!locked||Boolean(fight?.pending);
    for(const key of ['acceptWound','useLuck'])el(key).disabled=!locked||!fight?.pending;
    el('escape').disabled=!combat.canEscape(fight);
    el('cancel').disabled=!locked;
    el('eat').disabled=locked||!hero?.stamina||!hero?.provisions;
    el('drink').disabled=locked||!hero?.stamina||!hero?.potionUses;
    el('testLuck').disabled=locked||!hero?.stamina;
    const projectile=items().find(item=>item.damage);
    el('projectile').hidden=!projectile;el('projectile').disabled=!locked||Boolean(fight?.pending)||!hero?.items[projectile?.key];
    el('status').textContent=tk('status.'+(fight?.status??'ready'))+(fight?' · '+tk('roundNumber',{n:fight.round}):'');
    el('pending').textContent=fight?.pending?tk('pending.'+fight.pending.direction):'';
    el('destination').textContent=fight?.destination?tk('destination',{n:fight.destination}):'';
    el('opponents').innerHTML=(fight?.enemies??[]).map((enemy,index)=>'<div>'+escape((index===fight.target&&locked?'› ':'')+tk('enemyStamina',{name:enemy.displayName||enemy.name,n:enemy.stamina,max:enemy.initialStamina}))+'</div>').join('');
    el('log').innerHTML=data.log.slice(-80).map(line=>'<div>'+escape(line)+'</div>').join('');
    el('history').innerHTML=data.history.slice(-40).toReversed().map(row=>'<div>'+escape(row.enemy+': '+tk('status.'+row.outcome))+'</div>').join('');
    notes();
  }
  function open(){
    if(Number(getBookId())!==definition.id||!getRun()){showAlert(t('battlesim.no_active_playthrough'));return;}
    shownRun=getRun();editorRun=null;
    if(!state.read())state.change(data=>{data.character=combat.newCharacter(getSettings().defaults);});
    el('overlay').classList.add('active');render(true);el('close').focus();
  }
  function init(){
    if(el('overlay'))return;
    const overlay=document.createElement('div');overlay.id=ID+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-heading"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-heading">${escape(definition.title)}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">×</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left">
      <details open><summary>${escape(tk('character'))}</summary>${fields.map(field).join('')}<label class="inv-edit-row"><span>${escape(tk('potion'))}</span><select class="inv-edit-input" id="${ID}-potion">${['skill','strength','fortune'].map(key=>`<option value="${key}">${escape(tk('potion.'+key))}</option>`).join('')}</select></label>
      <label class="inv-edit-row"><span>${escape(tk('weapon'))}</span><select class="inv-edit-input" id="${ID}-weapon"><option value="none">${escape(tk('ordinarySword'))}</option>${items().filter(item=>item.slot==='weapon').map(item=>`<option value="${escape(item.key)}">${escape(item.label)}</option>`).join('')}</select></label>
      ${items().filter(item=>item.slot!=='weapon').map(item=>`<label class="bsim-checkbox"><input type="checkbox" id="${ID}-item-${escape(item.key)}">${escape(item.label)}</label>`).join('')}<p class="bsim-note">${escape(tk('itemNote'))}</p><div class="bsim-btn-row">${button('saveCharacter')}${button('newCharacter')}</div></details>
      <label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter"><option value="custom">${escape(tk('custom'))}</option>${getRoster().map(entry=>`<option value="${entry.section}">${escape(entry.label)}</option>`).join('')}</select></label><div id="${ID}-editor"></div>
      <details><summary>${escape(tk('sourceRules'))}</summary><p class="bsim-note" id="${ID}-notes"></p></details><label class="bsim-checkbox" id="${ID}-applyEntryRow"><input type="checkbox" id="${ID}-applyEntry">${escape(tk('applyEntry'))}</label><div class="bsim-btn-row">${button('start')}${button('bypass')}</div>
      <p class="bsim-note" id="${ID}-pending" role="status"></p><div class="bsim-btn-row">${button('round')}${button('acceptWound')}${button('useLuck')}</div><div class="bsim-btn-row">${button('escape')}${button('projectile')}${button('cancel')}</div>
      <div class="bsim-btn-row">${button('eat')}${button('drink')}${button('testLuck')}</div></div>
      <div class="bsim-col bsim-col-right"><p id="${ID}-status" role="status"></p><p id="${ID}-destination"></p><div id="${ID}-opponents"></div><h3 class="bsim-side-title">${escape(tk('log'))}</h3><div class="bsim-log" id="${ID}-log"></div><h3 class="bsim-side-title">${escape(tk('history'))}</h3><div class="bsim-history-list" id="${ID}-history"></div></div></div></div>`;
    document.body.append(overlay);
    editor=createOpponentEditor({document,id:ID,t,fields:[{key:'skill',label:tk('skill'),max:10000},{key:'stamina',label:tk('stamina'),min:1,max:10000}],presets:getRoster().flatMap(entry=>entry.enemies)});
    el('editor').append(editor.element);
    const trigger=document.createElement('button');trigger.id=ID+'-btn';trigger.style.display='none';trigger.textContent=t('battlesim.title');getButtonRow().append(trigger);trigger.addEventListener('click',open);
    el('close').addEventListener('click',close);overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();}});
    el('encounter').addEventListener('change',()=>{if(active(state.read()?.fight))return;editor.set(preset()?.enemies??[{}]);editor.fixCount(Boolean(preset()));notes();saveSetup();});
    for(const event of ['input','change'])editor.element.addEventListener(event,saveSetup);
    el('applyEntry').addEventListener('change',saveSetup);
    el('saveCharacter').addEventListener('click',()=>change(data=>{if(active(data.fight))return;data.character=readCharacter();data.fight=null;}));
    el('newCharacter').addEventListener('click',()=>confirm('resetConfirm',data=>{if(active(data.fight))return;data.character=combat.newCharacter(getSettings().defaults);data.fight=null;}));
    el('start').addEventListener('click',()=>change(data=>{if(active(data.fight))return;data.setup=setup();report(data,combat.startFight(readCharacter(),preset(),{applyEntry:el('applyEntry').checked,opponents:editor.read()}));}));
    el('bypass').addEventListener('click',()=>confirm('bypassConfirm',data=>{if(active(data.fight)||!preset()?.bypass)return;data.setup=setup();report(data,combat.bypassFight(combat.startFight(readCharacter(),preset(),{applyEntry:false,opponents:editor.read()})));}));
    el('round').addEventListener('click',()=>change(data=>report(data,combat.roundFight(data.fight,items()))));
    el('acceptWound').addEventListener('click',()=>change(data=>report(data,combat.resolveWound(data.fight))));
    el('useLuck').addEventListener('click',()=>change(data=>report(data,combat.resolveWound(data.fight,true))));
    el('escape').addEventListener('click',()=>change(data=>report(data,combat.escapeFight(data.fight))));
    el('projectile').addEventListener('click',()=>change(data=>report(data,combat.useProjectile(data.fight,items().find(item=>item.damage)))));
    el('cancel').addEventListener('click',()=>confirm('cancelConfirm',data=>{if(!active(data.fight))return;data.fight.status='cancelled';data.fight.events=[];}));
    for(const [key,method] of [['eat','provision'],['drink','potion']])el(key).addEventListener('click',()=>change(data=>{if(active(data.fight))return;data.character=combat.recover(readCharacter(),method);data.fight=null;}));
    el('testLuck').addEventListener('click',()=>change(data=>{if(active(data.fight))return;const result=combat.testLuck(readCharacter());data.character=result.character;data.fight=null;data.log.push(tk('luckResult',{n:result.total,result:tk(result.lucky?'lucky':'unlucky')}));}));
    registerShortcut({button:trigger,overlay,open,close});
  }
  return {init,render,open,close,setVisible(value){if(el('btn'))el('btn').style.display=value?'':'none';if(!value){close();shownRun=null;}}};
}
