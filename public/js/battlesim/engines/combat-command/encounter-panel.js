import { createOpponentEditor } from '../../opponents.js';
import { startCombatCommandFight, combatCommandRound } from './core.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields = [{key:'count',label:'Manpower',min:0,max:10000},{key:'ordnance',label:'Ordnance / Melee',min:0,max:10000}];
const editable = unit => ({...unit,displayName:unit.name});
const active = state => state?.fight?.status === 'fighting';

// An isolated encounter sheet: it never reads or writes story progression or inventory.
export function createCombatCommandEncounterPanel({document,definition,getRoster,getPlayerDefaults,getCharts,t,
  getRun,getBookId,saveState,getButtonRow,showAlert,showConfirm,registerShortcut=()=>{}}) {
  const ID=definition.stateKey, el=key=>document.getElementById(ID+'-'+key);
  let shownRun, shownPreset, wasActive=false, playerEditor, enemyEditor, reinforcementEditors=[];
  const data=()=>Number(getBookId())===definition.id?getRun()?.[ID]:null;
  const selected=state=>getRoster().find(entry=>entry.section===state.encounter);
  const close=()=>el('overlay')?.classList.remove('active');
  function open() {
    if (!getRun() || Number(getBookId())!==definition.id) {showAlert(t('battlesim.no_active_playthrough'));return;}
    render();el('overlay').classList.add('active');
  }
  function action(update) {
    const run=getRun(), original=data();
    if (!original || run!==shownRun || Number(getBookId())!==definition.id) return;
    try {
      const state=update(structuredClone(original));
      if (!state || getRun()!==run || data()!==original) return;
      const fight=state.fight;
      if (fight && fight.round > 0 && !fight.recorded && ['win','loss','survived'].includes(fight.status)) {
        fight.recorded=true;
        state.history.push({enemy:fight.config.label,outcome:fight.status==='survived'?'win':fight.status,
          section:fight.section,ts:Math.max(Date.now(),(state.history.at(-1)?.ts??0)+1)});
      }
      run[ID]=state;saveState();render();
    } catch(error) {showAlert(error.message || 'Check the combat values.');}
  }
  function read(editor,prefix,custom=false) {
    return editor.read().map((unit,index)=>({...unit,key:custom?prefix+'-'+index:unit.key||prefix+'-'+index,name:unit.displayName||'Unnamed force'}));
  }
  function start(state) {
    if (active(state)) return;
    const preset=selected(state), config=preset?structuredClone(preset):{
      section:'custom',label:'Custom fight',playerChart:el('playerChart').value,
      enemyChart:el('enemyChart').value,initiative:el('initiative').value,
    };
    config.enemies=read(enemyEditor,'enemy',!preset);
    for (const [index,editor] of reinforcementEditors.entries()) config.reinforcements[index].units=read(editor,'reinforcement-'+index);
    const player=read(playerEditor,'player',!preset);
    state.fight=startCombatCommandFight(player,config,getCharts());
    if (!preset) state.custom={player, enemies:config.enemies, playerChart:config.playerChart,
      enemyChart:config.enemyChart,initiative:config.initiative};
    return state;
  }
  function roll(key) {
    const raw=el(key).value.trim();
    if (!raw) return undefined;
    const value=Number(raw);
    if (!Number.isInteger(value)||value<2||value>12) throw new RangeError('Enter a 2d6 total from 2 to 12.');
    return value;
  }
  function step(state) {
    if (!active(state)) return;
    state.fight=combatCommandRound(state.fight,{playerRoll:roll('playerRoll'),enemyRoll:roll('enemyRoll')});
    return state;
  }
  function cancel() {
    const original=data(), run=getRun(), fight=original?.fight;
    if (run!==shownRun || !active(original)) return;
    showConfirm('End this encounter? Its combat log will be kept.',()=>{
      if (getRun()!==run || data()!==original || data()?.fight!==fight) return;
      action(state=>{state.fight.status='cancelled';return state;});
    });
  }
  function editor(id,units,title) {
    const result=createOpponentEditor({document,id:ID+'-'+id,t,fields,
      presets:getRoster().flatMap(entry=>entry.enemies).map(editable)});
    result.element.querySelector('summary').textContent=title;
    result.set(units.map(editable));return result;
  }
  function fillSetup(state,preset) {
    playerEditor.fixCount(Boolean(preset));enemyEditor.fixCount(Boolean(preset));
    playerEditor.set((preset?.playerUnits??state.custom.player??[getPlayerDefaults().customPlayer]).map(editable));
    enemyEditor.set((preset?.enemies??state.custom.enemies??[getPlayerDefaults().customEnemy]).map(editable));
    for (const key of ['playerChart','enemyChart','initiative']) el(key).value=preset?.[key]??state.custom[key]??({playerChart:'C',enemyChart:'E',initiative:'player'}[key]);
    el('reinforcements').replaceChildren();reinforcementEditors=[];
    for (const [index,group] of (preset?.reinforcements??[]).entries()) {
      const extra=editor('reinforcement-'+index,group.units,`${group.side==='player'?'Your':'Enemy'} reinforcements: start of round ${group.round}`);
      extra.fixCount(true);el('reinforcements').appendChild(extra.element);reinforcementEditors.push(extra);
    }
  }
  function render() {
    if (!el('overlay')) return;
    const run=getRun();
    if (!run || Number(getBookId())!==definition.id) {shownRun=undefined;close();return;}
    const state=run[ID]??= {encounter:'',custom:{},history:[],fight:null};
    const preset=selected(state), locked=active(state), fight=state.fight;
    if (shownRun!==run || shownPreset!==state.encounter || wasActive&&!locked) {
      fillSetup(state,preset);shownPreset=state.encounter;
    }
    shownRun=run;wasActive=locked;
    el('encounter').value=state.encounter;el('encounter').disabled=locked;
    for (const key of ['playerChart','enemyChart','initiative']) el(key).disabled=locked||Boolean(preset);
    for (const item of [playerEditor,enemyEditor,...reinforcementEditors]) item.lock(locked);
    el('start').disabled=locked;el('attack').disabled=!locked;el('cancel').disabled=!locked;
    el('playerRoll').disabled=!locked;el('enemyRoll').disabled=!locked;
    el('note').textContent=preset?.note??'Enter the forces currently engaged. Casualties immediately reduce attack strength; Julian is the last M.I. casualty. Leave dice blank to roll automatically.';
    el('result').textContent=fight?`${fight.status==='interrupted'?'Wounded':fight.status} · Round ${fight.round}${fight.section?' · Book reference: '+fight.section:''}`:'Ready';
    el('forces').innerHTML=fight?'<table class="bsim-report-table"><thead><tr><th>Force</th><th>Remaining</th></tr></thead><tbody>'+[...fight.player,...fight.enemies].map(unit=>`<tr><td>${escape(unit.name)}</td><td>${unit.count}</td></tr>`).join('')+'</tbody></table>':'';
    el('log').innerHTML=(fight?.history??[]).slice().reverse().map(event=>'<div>'+escape(`Round ${event.round}: `+event.attacks.map(a=>`${a.side==='player'?'You':'Enemy'} AS ${a.strength}, Chart ${a.chart}${a.total==null?'':', roll '+a.total}: ${a.hits} hits`+(a.absorbed?`, ${a.absorbed} prisoner casualties`:'')+(a.wounded?', interrupted by wound':'')+(a.losses.length?' ('+a.losses.map(loss=>loss.count+' '+loss.name).join(', ')+')':'')).join('; '))+'</div>').join('');
    el('history').innerHTML=state.history.slice(-30).reverse().map(entry=>`<div>${escape(entry.enemy)} · ${escape(entry.outcome)}</div>`).join('');
  }
  const button=(key,label)=>`<button class="bsim-action-btn" type="button" id="${ID}-${key}">${escape(label)}</button>`;
  const select=(key,label,options)=>`<label class="inv-edit-row"><span>${escape(label)}</span><select class="inv-edit-input" id="${ID}-${key}">${options}</select></label>`;
  const input=(key,label)=>`<label class="inv-edit-row"><span>${escape(label)}</span><input class="inv-edit-input" type="number" id="${ID}-${key}" min="2" max="12" step="1"></label>`;
  function init() {
    if (el('overlay')) return;
    const chartOptions=Object.keys(getCharts()).map(chart=>`<option value="${chart}">${chart}</option>`).join('');
    const overlay=document.createElement('div');overlay.id=ID+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(t(definition.i18nPrefix+'.title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left">${select('encounter','Encounter','<option value="">Custom fight</option>'+getRoster().map(entry=>`<option value="${escape(entry.section)}">${escape(entry.label)}</option>`).join(''))}<p id="${ID}-note"></p>${select('playerChart','Your chart',chartOptions)}${select('enemyChart','Enemy chart',chartOptions)}${select('initiative','Initiative','<option value="player">You first</option><option value="enemy">Enemy first</option>')}<div id="${ID}-playerEditor"></div><div id="${ID}-enemyEditor"></div><div id="${ID}-reinforcements"></div><details><summary>Dice totals</summary><p>Leave blank to roll automatically.</p>${input('playerRoll','Your 2d6')}${input('enemyRoll','Enemy 2d6')}</details><div class="bsim-btn-row">${button('start','Start encounter')}${button('attack','Next round')}${button('cancel','End encounter')}</div></div><div class="bsim-col bsim-col-right"><h4 id="${ID}-result"></h4><div id="${ID}-forces"></div><h4>Combat log</h4><div class="bsim-log" id="${ID}-log"></div><h4>Battle history</h4><div id="${ID}-history"></div></div></div></div>`;
    document.body.appendChild(overlay);
    playerEditor=editor('player',[getPlayerDefaults().customPlayer],'Your force');
    enemyEditor=editor('enemy',[getPlayerDefaults().customEnemy],'Enemy force');
    el('playerEditor').appendChild(playerEditor.element);el('enemyEditor').appendChild(enemyEditor.element);
    const launch=document.createElement('button');launch.id=ID+'-btn';launch.style.display='none';
    getButtonRow().appendChild(launch);launch.addEventListener('click',open);el('close').addEventListener('click',close);
    registerShortcut({button:launch,overlay,open,close});
    let backdrop=false;
    overlay.addEventListener('mousedown',event=>{backdrop=event.target===overlay;});
    overlay.addEventListener('click',event=>{if(backdrop&&event.target===overlay)close();});
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();}});
    el('encounter').addEventListener('change',()=>action(state=>active(state)?undefined:{...state,encounter:el('encounter').value}));
    el('start').addEventListener('click',()=>action(start));el('attack').addEventListener('click',()=>action(step));
    el('cancel').addEventListener('click',cancel);
  }
  return {init,render,setVisible(value){const launch=el('btn');if(launch)launch.style.display=value?'':'none';if(!value)close();}};
}
