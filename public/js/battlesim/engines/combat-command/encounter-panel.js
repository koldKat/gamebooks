import { createOpponentEditor } from '../../opponents.js';
// Display and resolve optional Combat Command encounters independently of story navigation.
import { startCombatCommandFight, combatCommandRound, resumeCombatCommandFight, resolveCombatCommandCasualties } from './core.js';
import { combatCommandPlayerSetup, rememberCombatCommandForce } from './force-state.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields = [{key:'count',label:'Manpower',min:0,max:10000},{key:'ordnance',label:'Ordnance / Melee',min:0,max:10000}];
const editable = unit => ({...unit,displayName:unit.name});
const active = state => ['fighting','awaiting-force','awaiting-losses'].includes(state?.fight?.status);

// An isolated encounter sheet: it never reads or writes story progression or inventory.
export function createCombatCommandEncounterPanel({document,definition,getRoster,getPlayerDefaults,getCharts,t,
  getRun,getBookId,saveState,getButtonRow,showAlert,showConfirm,registerShortcut=()=>{}}) {
  const ID=definition.stateKey, el=key=>document.getElementById(ID+'-'+key);
  let shownRun, shownPreset, shownPending, wasActive=false, wasAwaiting=false, playerEditor, enemyEditor, reinforcementEditors=[];
  const data=()=>Number(getBookId())===definition.id?getRun()?.[ID]:null;
  const selected=state=>{
    const entry=getRoster().find(entry=>entry.section===state.encounter);
    if (!entry) return undefined;
    const variant=entry.variants?.find(item=>item.key===state.variant)??entry.variants?.[0];
    return variant?{...entry,...variant}:entry;
  };
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
      if (definition.preservePlayerForce && fight) rememberCombatCommandForce(state, fight.player);
      if (fight && fight.round > 0 && !fight.recorded && ['win','loss','survived'].includes(fight.status)) {
        fight.recorded=true;
        state.history.push({enemy:fight.config.label,outcome:fight.status==='survived'?'win':fight.status,
          section:fight.section,ts:Math.max(Date.now(),(state.history.at(-1)?.ts??0)+1)});
      }
      run[ID]=state;saveState();render();
    } catch(error) {showAlert(error.message || 'Check the combat values.');}
  }
  function read(editor,prefix,custom=false) {
    const units=editor.read(), reserved=new Set(custom?[]:units.map(unit=>unit.key).filter(Boolean));
    return units.map((unit,index)=>{
      let key=custom?prefix+'-'+index:unit.key;
      if (!key) {
        let serial=index;key=prefix+'-'+serial;
        while(reserved.has(key))key=prefix+'-'+(++serial);
        reserved.add(key);
      }
      return {...unit,key,name:unit.displayName||'Unnamed force'};
    });
  }
  function start(state) {
    if (state.fight?.status==='awaiting-force') {
      state.fight=resumeCombatCommandFight(state.fight,read(playerEditor,'player'));
      return state;
    }
    if (active(state)) return;
    const preset=selected(state), config=preset?structuredClone(preset):{
      ...structuredClone(getPlayerDefaults().customRules??{}),
      section:'custom',label:'Custom fight',playerChart:el('playerChart').value,
      enemyChart:el('enemyChart').value,initiative:el('initiative').value,
    };
    config.enemies=read(enemyEditor,'enemy',!preset);
    if (preset && definition.forceTypes) config.enemies=config.enemies.map((unit,index)=>({
      ...unit,key:preset.enemies[index].key,type:preset.enemies[index].type,
    }));
    for (const [index,editor] of reinforcementEditors.entries()) config.reinforcements[index].units=read(editor,'reinforcement-'+index);
    const player=read(playerEditor,'player',!preset&&!definition.preservePlayerForce);
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
    if (state.fight?.status!=='fighting') return;
    const options={playerRoll:roll('playerRoll'),enemyRoll:roll('enemyRoll')};
    if (definition.forceTypes) options.playerLossOrder=Object.values(state.lossOrder??{})
      .filter(key=>state.fight.player.some(unit=>unit.key===key));
    state.fight=combatCommandRound(state.fight,options);
    return state;
  }
  function renderLossOrder(state) {
    const holder=el('lossOrder');holder.replaceChildren();
    if (!definition.forceTypes || state.fight?.status!=='fighting') return;
    for (const type of definition.forceTypes) {
      const units=state.fight.player.filter(unit=>unit.type===type.value&&unit.count);
      if (units.length<2) continue;
      const label=document.createElement('label');label.className='inv-edit-row';
      const text=document.createElement('span');text.textContent=type.label+': losses first';
      const input=document.createElement('select');input.className='inv-edit-input';
      for (const unit of units) {const option=document.createElement('option');option.value=unit.key;option.textContent=unit.name;input.appendChild(option);}
      input.value=units.some(unit=>unit.key===state.lossOrder?.[type.value])?state.lossOrder[type.value]:units[0].key;
      input.addEventListener('change',()=>action(current=>{
        if (current.fight?.status!=='fighting') return;
        current.lossOrder={...current.lossOrder,[type.value]:input.value};return current;
      }));
      label.append(text,input);holder.appendChild(label);
    }
  }
  function allocate(state) {
    if (state.fight?.status!=='awaiting-losses') return;
    const allocation=Object.fromEntries([...el('casualties').querySelectorAll('input[data-unit-key]')].map(input=>{
      if (!input.value.trim()) throw new RangeError('Enter a casualty count for each unit.');
      return [input.dataset.unitKey,Number(input.value)];
    }));
    state.fight=resolveCombatCommandCasualties(state.fight,allocation);
    return state;
  }
  function renderAllocation(fight) {
    const awaiting=fight?.status==='awaiting-losses', holder=el('casualties');
    holder.hidden=!awaiting;
    if (!awaiting) {shownPending=undefined;return;}
    if (shownPending===fight) return;
    shownPending=fight;
    holder.replaceChildren();
    const note=document.createElement('p');
    note.textContent=`Allocate ${fight.pendingCasualties.hits} remaining casualties. Required priority losses have already been applied.`;
    holder.appendChild(note);
    for (const unit of fight.player) {
      const label=document.createElement('label');label.className='inv-edit-row';
      const name=document.createElement('span');name.textContent=unit.name+' ('+unit.count+' remaining)';
      const input=document.createElement('input');input.className='inv-edit-input';input.type='number';
      input.min='0';input.max=String(unit.count);input.step='1';input.value='0';input.dataset.unitKey=unit.key;
      input.disabled=!unit.count;label.append(name,input);holder.appendChild(label);
    }
    const button=document.createElement('button');button.type='button';button.className='bsim-action-btn';
    button.textContent='Apply casualties';button.addEventListener('click',()=>{
      if (data()?.fight!==fight) return;
      action(allocate);
    });holder.appendChild(button);
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
    const editorFields=definition.forceTypes?[...fields,{key:'type',label:'Unit type',options:definition.forceTypes}]:fields;
    const result=createOpponentEditor({document,id:ID+'-'+id,t,fields:editorFields,
      presets:id==='player'&&definition.preservePlayerForce?[]:getRoster().flatMap(entry=>entry.enemies).map(editable)});
    result.element.querySelector('summary').textContent=title;
    result.set(units.map(editable));return result;
  }
  function fillSetup(state,preset) {
    const variants=preset?.variants??[];
    el('variant-row').hidden=!variants.length;
    el('variant').innerHTML=variants.map(item=>`<option value="${escape(item.key)}">${escape(item.label)}</option>`).join('');
    if (variants.length) el('variant').value=variants.some(item=>item.key===state.variant)?state.variant:variants[0].key;
    playerEditor.fixCount(Boolean(preset));enemyEditor.fixCount(Boolean(preset));
    playerEditor.set(combatCommandPlayerSetup(state,preset,getPlayerDefaults(),definition.preservePlayerForce).map(editable));
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
    const preset=selected(state), locked=active(state), fight=state.fight, awaiting=fight?.status==='awaiting-force';
    const presetKey=state.encounter+'|'+(state.variant??'');
    if (shownRun!==run || shownPreset!==presetKey || wasActive&&!locked) {
      fillSetup(state,preset);shownPreset=presetKey;
    }
    if (awaiting && (!wasAwaiting || shownRun!==run)) playerEditor.set(fight.config.afterOpeningPlayerUnits.map(editable));
    shownRun=run;wasActive=locked;wasAwaiting=awaiting;
    el('encounter').value=state.encounter;el('encounter').disabled=locked;
    el('variant').disabled=locked;
    for (const key of ['playerChart','enemyChart','initiative']) el(key).disabled=locked||Boolean(preset);
    playerEditor.lock(locked&&!awaiting);
    for (const item of [enemyEditor,...reinforcementEditors]) item.lock(locked);
    if (definition.forceTypes) for (const item of [playerEditor,enemyEditor,...reinforcementEditors]) {
      for(const input of item.element.querySelectorAll('[data-stat="type"]'))input.disabled=locked||Boolean(preset);
    }
    el('start').disabled=locked&&!awaiting;el('start').textContent=awaiting?'Continue encounter':'Start encounter';
    el('attack').disabled=fight?.status!=='fighting';el('cancel').disabled=!locked;
    el('playerRoll').disabled=fight?.status!=='fighting';el('enemyRoll').disabled=fight?.status!=='fighting';
    renderAllocation(fight);
    renderLossOrder(state);
    el('note').textContent=awaiting?'Enter the surviving men and their normal combat value, then continue. Vehicle hits do not determine personnel losses in the printed rules.':preset?.note??definition.customNote??'Enter the forces currently engaged. Casualties immediately reduce attack strength; Julian is the last M.I. casualty. Leave dice blank to roll automatically.';
    el('result').textContent=fight?`${fight.status==='awaiting-losses'?'Allocate casualties':fight.status==='awaiting-force'?'Enter surviving force':fight.status==='interrupted'?'Wounded':fight.status} · Round ${fight.round}${fight.section?' · Book reference: '+fight.section:''}`:'Ready';
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
    const casualties=document.createElement('div');casualties.id=ID+'-casualties';casualties.hidden=true;
    el('reinforcements').after(casualties);
    const lossOrder=document.createElement('div');lossOrder.id=ID+'-lossOrder';casualties.before(lossOrder);
    const variantRow=document.createElement('div');variantRow.id=ID+'-variant-row';
    variantRow.innerHTML=select('variant','Combat setup','');
    el('encounter').closest('label').after(variantRow);
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
    el('encounter').addEventListener('change',()=>action(state=>active(state)?undefined:{...state,encounter:el('encounter').value,variant:''}));
    el('variant').addEventListener('change',()=>action(state=>active(state)?undefined:{...state,variant:el('variant').value}));
    el('start').addEventListener('click',()=>action(start));el('attack').addEventListener('click',()=>action(step));
    el('cancel').addEventListener('click',cancel);
  }
  return {init,render,setVisible(value){const launch=el('btn');if(launch)launch.style.display=value?'':'none';if(!value)close();}};
}
