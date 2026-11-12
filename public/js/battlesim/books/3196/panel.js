// Render and wire the optional Goblin's Revenge combat panel.
import {definition,ENCOUNTERS,encounterFor} from './definition.js';
import {startFight,round} from './combat.js';
import {createState} from './state.js';
import {createOpponentEditor} from '../../opponents.js';
import {currentBookId,currentPlaythrough,saveState} from '../../../core/state.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert,showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut,shortcutLabel,ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';
import {createThemedSelect} from '../../../ui-helpers/themed-select.js';

const ID=definition.stateKey;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const active=fight=>Boolean(fight&&!fight.outcome);
export function createGoblinPanel({document,t,getBookId,getRun,save,showAlert,showConfirm,getButtonRow,registerShortcut=()=>{}}) {
  const tk=(key,params)=>t('battlesim3196.'+key,params),el=key=>document.getElementById(ID+'-'+key);
  const store=createState(()=>({bookId:getBookId(),run:getRun,save}));
  let shownRun,editor,editorRun;
  const menus=[];
  const button=key=>`<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const input=(key,min,max)=>`<label class="inv-edit-row"><span>${escape(tk(key))}</span><input id="${ID}-${key}" class="inv-edit-input" type="number" min="${min}" max="${max}" step="1" autocomplete="off" required></label>`;
  function logLine(line) {
    if (typeof line === 'string') return escape(line);
    if (line?.type !== 'roll') return '';
    const color=(value,kind)=>`<span class="bsim-log-${kind}">${escape(value)}</span>`;
    return tk('roll', {...Object.fromEntries(Object.entries(line).map(([key,value])=>[key,escape(value)])),
      dice:color(line.dice.join(' + '),'accent'),
      total:color(line.total,line.hit?'success':'muted'),
      enemyLoss:color(line.enemyLoss,line.enemyLoss?'success':'muted'),
      playerLoss:color(line.playerLoss,line.playerLoss?'danger':'muted')});
  }
  function close(){menus.forEach(menu=>menu.close());el('overlay')?.classList.remove('active');}
  function change(update){
    if(getRun()!==shownRun||Number(getBookId())!==3196||!el('overlay')?.classList.contains('active')){close();return;}
    try{if(store.change(update))render();}catch{showAlert(tk('invalid'));}
  }
  function saveSetup(){
    if(active(store.read()?.fight))return;
    change(d=>{d.setup={key:el('encounter').value,opponents:editor.snapshot()};});
  }
  function render(){
    if(!el('overlay')?.classList.contains('active'))return;
    if(getRun()!==shownRun||Number(getBookId())!==3196){close();return;}
    const d=store.read();if(!d)return;
    const fight=d.fight,locked=active(fight);
    if(editorRun!==getRun()){
      editorRun=getRun();el('encounter').value=d.setup?.key??'';
      editor.set(d.setup?.opponents??[{displayName:'',hp:3,rounds:5,injury:1}]);
    }
    const preset=encounterFor(el('encounter').value);
    editor.lock(locked);editor.fixCount(Boolean(preset));
    for(const key of ['hp','modifier']){el(key).value=d[key];el(key).disabled=locked;}
    el('unarmed').checked=d.unarmed;el('unarmed').disabled=locked;
    el('encounter').disabled=locked;el('start').disabled=locked||d.hp<=0;
    el('standard').disabled=!locked;el('power').disabled=!locked;el('cancel').disabled=!locked;
    el('note').textContent=preset?.note??'';
    const oldTarget=Number(el('target').value);
    const targets=locked?fight.enemies.flatMap((e,i)=>e.hp>0?[i]:[]):[];
    el('target').innerHTML=targets.map(i=>`<option value="${i}">${escape(fight.enemies[i].name)}</option>`).join('');
    el('target').value=targets.includes(oldTarget)?oldTarget:targets[0]??'';el('target').disabled=!locked;
    el('status').textContent=tk('status.'+(fight?.outcome??(fight?'active':'ready')))+(fight?.outcome==='loss'&&fight.hp>0?' '+tk('timeout'):'');
    el('destination').textContent=fight?.destination?tk('destination',{section:fight.destination}):'';
    el('opponents').innerHTML=fight?fight.enemies.map(e=>`<div>${escape(tk('enemyLine',{name:e.name,hp:e.hp,rounds:e.rounds}))}</div>`).join(''):'';
    el('log').innerHTML=d.log.map(line=>'<div>'+logLine(line)+'</div>').join('');
    el('history').innerHTML=d.history.slice(-40).reverse().map(row=>'<div>'+escape(row.enemy+': '+tk('status.'+row.outcome))+'</div>').join('');
    menus.forEach(menu=>menu.sync());
  }
  function open(){
    if(Number(getBookId())!==3196||!getRun()){showAlert(t('battlesim.no_active_playthrough'));return;}
    shownRun=getRun();editorRun=null;
    try{if(!store.read())store.change(()=>{});el('overlay').classList.add('active');render();el('close').focus();}
    catch{close();showAlert(tk('invalid'));}
  }
  function init(){
    if(el('overlay'))return;
    const overlay=document.createElement('div');overlay.id=ID+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('rules'))}</p>${input('hp',0,12)}${input('modifier',-100,100)}<label class="bsim-checkbox"><input type="checkbox" id="${ID}-unarmed"><span>${escape(tk('unarmed'))}</span></label><label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter"><option value="">${escape(tk('custom'))}</option>${ENCOUNTERS.map(e=>`<option value="${escape(e.key)}">${escape(e.name)}${e.section?' ('+e.section+')':''}</option>`).join('')}</select></label><p id="${ID}-note"></p><div id="${ID}-editor"></div><label class="inv-edit-row"><span>${escape(tk('target'))}</span><select class="inv-edit-input" id="${ID}-target"></select></label><div class="bsim-btn-row">${['start','standard','power','cancel'].map(button).join('')}</div></div><div class="bsim-col bsim-col-right"><div id="${ID}-status" class="bsim-status" role="status" aria-live="polite"></div><p id="${ID}-destination"></p><div class="bsim-status" id="${ID}-opponents"></div><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor=createOpponentEditor({document,id:ID,t,language:'bg',fields:[
      {key:'hp',label:tk('enemyHp'),min:1},{key:'rounds',label:tk('rounds'),min:1},{key:'injury',label:tk('injury'),min:0},
    ],presets:ENCOUNTERS.flatMap(e=>e.enemies),onSelect:saveSetup});
    el('editor').appendChild(editor.element);
    editor.element.addEventListener('input',saveSetup);editor.element.addEventListener('change',saveSetup);
    el('encounter').addEventListener('change',()=>{
      if(active(store.read()?.fight))return;
      editor.set(encounterFor(el('encounter').value)?.enemies??[{displayName:'',hp:3,rounds:5,injury:1}]);saveSetup();
    });
    for(const key of ['hp','modifier','unarmed'])el(key).addEventListener('change',()=>{
      if(active(store.read()?.fight))return;
      change(d=>{
        const hp=Number(el('hp').value),modifier=Number(el('modifier').value);
        if(!el('hp').value.trim()||!el('modifier').value.trim()||!Number.isSafeInteger(hp)||hp<0||hp>12||!Number.isSafeInteger(modifier)||Math.abs(modifier)>100)throw new RangeError('Invalid setup');
        d.fight=null;d.hp=hp;d.modifier=modifier;d.unarmed=el('unarmed').checked;
      });
    });
    el('start').addEventListener('click',()=>change(d=>{
      if(active(d.fight))throw new RangeError('Already fighting');
      const preset=encounterFor(el('encounter').value),opponents=editor.read();
      if(preset&&opponents.length!==preset.enemies.length)throw new RangeError('Wrong enemy count');
      d.fight=startFight(d.hp,opponents,preset??{},d.modifier,d.unarmed);d.log=[];
    }));
    for(const [key,attack]of [['standard',7],['power',9]])el(key).addEventListener('click',()=>change(d=>{
      d.fight=round(d.fight,Number(el('target').value),attack);
      for(const e of d.fight.events)d.log.push({type:'roll',...e});
    }));
    el('cancel').addEventListener('click',()=>{
      const run=getRun(),before=store.read();
      showConfirm(tk('cancelConfirm'),()=>{
        if(getRun()===run&&store.read()===before)change(d=>{d.fight=null;});
      });
    });
    const trigger=document.createElement('button');trigger.id=ID+'-btn';trigger.style.display='none';trigger.innerHTML=shortcutLabel(t('battlesim.title'));trigger.setAttribute('aria-keyshortcuts','S');getButtonRow().appendChild(trigger);trigger.addEventListener('click',open);
    el('close').addEventListener('click',close);
    let backdrop=false;overlay.addEventListener('mousedown',event=>{backdrop=event.target===overlay;});
    overlay.addEventListener('click',event=>{if(backdrop&&event.target===overlay)close();});
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.stopPropagation();close();}});
    registerShortcut('KeyS',{getButton:()=>trigger,getOverlay:()=>overlay,otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
    menus.push(...['encounter','target'].map(key=>createThemedSelect(el(key))));
  }
  return {init,render,setVisible(visible){if(el('btn'))el('btn').style.display=visible?'':'none';if(!visible)close();}};
}
const panel=createGoblinPanel({document,t,getBookId:()=>currentBookId,getRun:currentPlaythrough,save:saveState,showAlert,showConfirm,getButtonRow:getPlayBtnRow,registerShortcut:registerPanelShortcut});
export function initSim3196(){panel.init();}
export function renderSim3196(){panel.render();}
export function setSim3196Visible(visible){panel.setVisible(visible);}
export {initSim3196 as init,renderSim3196 as render,setSim3196Visible as setVisible};
