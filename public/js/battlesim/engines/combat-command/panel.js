import { createOpponentEditor } from '../../opponents.js';
import { createCommandRecord, commandRecordOutcome, commandEncounterForce, beginCommandEncounter,
  advanceCommandEncounter, cancelCommandEncounter, updateCommandRecord, applyCommandEffect, testCommandRecord, recoverCommandDrones,
  repairCommandFlagship, repairCommandShips } from './record.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const active = state => state?.fight?.status === 'fighting';
const fields = [{key:'count',label:'Units',min:0,max:10000},{key:'ordnance',label:'Ordnance',min:0,max:10000}];
const editable = unit => ({...unit,displayName:unit.name});

export function createCombatCommandPanel({document,definition,getRoster,getPlayerDefaults,getCharts,t,
  getRun,getBookId,saveState,getButtonRow,showAlert,showConfirm,registerShortcut=()=>{}}) {
  const ID=definition.stateKey, el=key=>document.getElementById(ID+'-'+key), defaults=()=>getPlayerDefaults();
  let shownRun, shownPreset, wasActive=false, playerEditor, enemyEditor;
  function data() {
    if (Number(getBookId())!==definition.id) return null;
    const run=getRun();
    if (!run) return null;
    return run[ID]??= {...createCommandRecord(defaults()),encounter:'',custom:{}};
  }
  const selected=state=>getRoster().find(entry=>entry.section===state.encounter);
  const close=()=>el('overlay')?.classList.remove('active');
  function open() {
    if (!data()) {showAlert(t('battlesim.no_active_playthrough'));return;}
    render();el('overlay').classList.add('active');
  }
  function number(key,optional=false) {
    const input=typeof key==='string'?el(key):key, raw=input.value.trim(), value=Number(raw);
    if (!raw && optional) return undefined;
    if (!raw || !Number.isFinite(value) || value<Number(input.min) || value>Number(input.max)
      || Math.abs(value/Number(input.step)-Math.round(value/Number(input.step)))>1e-8) throw new RangeError('Check '+(input.dataset.ship ?? key));
    return value;
  }
  function action(update) {
    const run=getRun();
    if (run!==shownRun || Number(getBookId())!==definition.id) return;
    const original=data();
    if (!original) return;
    try {
      const state=update(original);
      if (!state || getRun()!==run || Number(getBookId())!==definition.id || data()!==original) return;
      const fight=state.fight;
      if (fight && !fight.recorded && ['win','loss','survived'].includes(fight.status)) {
        fight.recorded=true;
        state.history.push({enemy:fight.config.label,outcome:fight.status==='survived'?'win':fight.status,
          section:fight.section,ts:Math.max(Date.now(),(state.history.at(-1)?.ts??0)+1)});
      }
      run[ID]=state; saveState(); render();
    } catch(error) {showAlert(error.message || 'Check the simulator values.');}
  }
  function confirm(key) {
    if (getRun()!==shownRun || Number(getBookId())!==definition.id) return;
    const run=getRun(), original=data(), fight=original?.fight;
    if (!original || key==='cancel' && !active(original) || key==='reset' && active(original)) return;
    showConfirm(key==='cancel'?'End this encounter? Casualties and fired drones will be kept.':'Reset this simulator fleet and clock to their starting values? Battle history will be kept.',()=>{
      if (getRun()!==run || Number(getBookId())!==definition.id || data()!==original || data()?.fight!==fight) return;
      action(state=>key==='cancel'?cancelCommandEncounter(state):{
        ...createCommandRecord(defaults()),encounter:state.encounter,custom:state.custom,history:state.history,
        log:[...state.log,{type:'reset'}].slice(-100),
      });
    });
  }
  function readUnits(editor,prefix,custom=false) {
    return editor.read().map((row,index)=>({...row,key:custom?prefix+'-'+index:row.key||prefix+'-'+index,name:row.displayName||'Unnamed force'}));
  }
  function start(state) {
    if (active(state)) return state;
    const preset=selected(state), config=preset?structuredClone(preset):{
      section:'custom',label:'Custom fight',forceMode:'custom',playerChart:el('playerChart').value,
      enemyChart:el('enemyChart').value,initiative:el('initiative').value,
    };
    const setup={enemies:readUnits(enemyEditor,'custom-enemy',!preset)};
    if (!preset || ['troops','fixed-player'].includes(preset.forceMode)) setup.player=readUnits(playerEditor,'custom-player',!preset);
    if (['recon-birds','holding-squadron'].includes(preset?.forceMode)) {
      setup.playerKeys=[...el('shipSelection').querySelectorAll('input:checked')].map(input=>input.value);
    }
    const next=beginCommandEncounter(state,config,getCharts(),setup);
    if (!preset) next.custom={player:playerEditor.snapshot(),enemies:enemyEditor.snapshot(),
      playerChart:config.playerChart,enemyChart:config.enemyChart,initiative:config.initiative};
    return next;
  }
  function saveRecord(state) {
    if (active(state)) return state;
    const next=structuredClone(state);
    next.morale=number('morale'); next.stealth=number('stealth');next.hours=number('hours');
    for (const input of el('fleet').querySelectorAll('input[data-ship]')) {
      const unit=next.fleet.find(ship=>ship.key===input.dataset.ship);
      if (input.type==='checkbox') unit.detached=input.checked;
      else {unit.count=number(input);unit.spent=Math.min(unit.spent,unit.count);}
    }
    return updateCommandRecord(state,next);
  }
  function step(state) {
    const options={playerRoll:number('playerRoll',true),enemyRoll:number('enemyRoll',true),drones:number('drones')};
    for (const [field,key] of [['playerLoss','playerLossOrder'],['enemyLoss','enemyLossOrder'],['fireFirst','firingOrder']]) {
      if (el(field).value) options[key]=[el(field).value];
    }
    return advanceCommandEncounter(state,options);
  }
  function fillSetup(state,preset) {
    let enemies=state.custom.enemies??[defaults().customEnemy];
    if (preset) {
      enemies=state.enemyForces[preset.enemyForceKey]??preset.enemies;
      if (preset.continuationFrom) enemies=state.completedEncounters[preset.continuationFrom]?.enemies
        ?? preset.enemies.map(unit=>({...unit,count:''}));
    }
    enemyEditor.fixCount(Boolean(preset));enemyEditor.set(enemies.map(editable));
    playerEditor.fixCount(Boolean(preset));playerEditor.set((preset?.playerUnits??state.custom.player??[defaults().customPlayer]).map(editable));
    el('playerChart').value=preset?.playerChart??state.custom.playerChart??'C';
    el('enemyChart').value=preset?.enemyChart??state.custom.enemyChart??'E';
    el('initiative').value=preset?.initiative??state.custom.initiative??'you';
    const selecting=['recon-birds','holding-squadron'].includes(preset?.forceMode);
    const ships=state.fleet.filter(unit=>unit.count&&!unit.detached&&(preset?.forceMode==='recon-birds'
      ?unit.shipClass===preset.selectionClass:Object.hasOwn(preset?.selectionClasses??{},unit.shipClass)));
    el('shipSelection').innerHTML=selecting?'<p>'+escape(preset.forceMode==='recon-birds'?'Choose two birds. The third remains untouched.':'Choose two destroyers and three escorts. They will remain detached.')+'</p>'+ships.map(unit=>
      `<label class="bsim-checkbox"><input type="checkbox" value="${escape(unit.key)}">${escape(unit.name)} (${escape(unit.shipClass)})</label>`).join(''):'';
  }
  function orderSelect(key,units) {
    const previous=el(key).value;
    el(key).innerHTML='<option value="">Default order</option>'+units.filter(unit=>unit.count).map(unit=>`<option value="${escape(unit.key)}">${escape(unit.name)}</option>`).join('');
    if (units.some(unit=>unit.key===previous&&unit.count)) el(key).value=previous;
  }
  function eventText(entry) {
    if(entry.type==='test')return `Section ${entry.section}: ${entry.dice.join(' + ')} = ${entry.total}, ${entry.passed?'passed':'failed'}. Continue at ${entry.next}.`;
    if(entry.type==='effect')return `Applied section ${entry.section}${entry.hours?', +'+entry.hours+' hours':''}.`;
    if(entry.type==='flagship-repair')return `Section ${entry.section}: repair roll ${entry.die}, ${entry.done?'repaired':'another hour needed'}.`;
    if(entry.type==='ship-repair')return `Section ${entry.section}: repair roll ${entry.die}, ${entry.success?'ships restored':'selected ships beyond repair'}.`;
    if(entry.type==='drone-recovery')return `Section ${entry.section}: ${entry.dice.join(' + ')} drones used; surviving drones recovered.`;
    if(entry.type==='result')return `${entry.label}: ${entry.status}${entry.section?'. Continue at '+entry.section:''}.`;
    if(entry.type==='start')return 'Started: '+entry.label;
    if(entry.type==='cancel')return 'Encounter ended. Casualties retained.';
    return 'Starting fleet restored.';
  }
  function render() {
    if (!el('overlay')) return;
    const state=data();
    if (!state) {shownRun=undefined;close();return;}
    const changedRun=shownRun!==getRun(), locked=active(state), preset=selected(state), fight=state.fight;
    if (changedRun || shownPreset!==state.encounter || wasActive&&!locked) {
      fillSetup(state,preset);shownPreset=state.encounter;
    }
    shownRun=getRun();wasActive=locked;
    el('encounter').value=state.encounter;
    for (const key of ['morale','stealth','hours']) el(key).value=state[key];
    el('fleetRows').innerHTML=state.fleet.map(unit=>`<tr><td>${escape(unit.name)}${unit.optional?' (optional retry)':''}</td><td><input class="inv-edit-input" type="number" min="0" max="${unit.maxCount??defaults().fleet.find(ship=>ship.key===unit.key)?.count??0}" step="1" data-ship="${escape(unit.key)}" value="${unit.count}" aria-label="${escape(unit.name)} remaining"></td><td><label class="bsim-checkbox"><input type="checkbox" data-ship="${escape(unit.key)}"${unit.detached?' checked':''} aria-label="${escape(unit.name)} detached"></label></td></tr>`).join('');
    for (const input of el('record').querySelectorAll('input,button')) input.disabled=locked;
    el('encounter').disabled=locked;
    for(const key of ['playerChart','enemyChart','initiative'])el(key).disabled=locked||Boolean(preset);
    playerEditor.lock(locked);enemyEditor.lock(locked);
    el('playerEditor').hidden=Boolean(preset&&!['troops','fixed-player'].includes(preset.forceMode));
    for(const input of el('shipSelection').querySelectorAll('input'))input.disabled=locked;
    el('start').disabled=locked;el('attack').disabled=!locked;el('cancel').disabled=!locked;
    el('note').textContent=preset?.note||(!preset?'Custom fights use the editable forces below.':preset.continuationFrom?'Enter the surviving pirates from the previous boarding action.':'Use your current surviving force. Casualties stay on this simulator sheet.');
    el('forceSummary').textContent='';
    if(preset&&!['troops','fixed-player','holding-squadron','recon-birds'].includes(preset.forceMode)){
      try{el('forceSummary').textContent=commandEncounterForce(state,preset).map(unit=>`${unit.name}: ${unit.count}`).join(' · ');}catch{}
    }
    const nextRound=(fight?.round??0)+1;
    const droneAllowed=locked&&fight.config.dronesMayAttack&&(!fight.config.droneRound||fight.config.droneRound===nextRound);
    el('drones').disabled=!droneAllowed;
    el('drones').max=String(fight?.player.filter(unit=>unit.drone).reduce((sum,unit)=>sum+unit.count-unit.spent,0)??0);
    if(!droneAllowed||Number(el('drones').value)>Number(el('drones').max))el('drones').value=0;
    for(const key of ['playerRoll','enemyRoll','playerLoss','enemyLoss','fireFirst'])el(key).disabled=!locked;
    orderSelect('playerLoss',fight?.player??[]);orderSelect('enemyLoss',fight?.enemies??[]);
    orderSelect('fireFirst',fight?.player.filter(unit=>!unit.drone)??[]);
    el('recover').disabled=locked||!state.recovery||state.recovery.done;
    const instruction=defaults().instructions;
    el('test').disabled=el('effect').disabled=el('applyEffect').disabled=el('rollTest').disabled=locked;
    el('repairFlagship').disabled=locked||state.repair?.done||!instruction.flagshipRepairs.some(rule=>rule.section===fight?.section);
    const repairKeys=[...el('repairSelection').querySelectorAll('input:checked')].map(input=>input.value);
    const repairEligible=instruction.shipRepair.afterSections.includes(fight?.config.section)&&!locked;
    el('repairSelection').innerHTML=repairEligible?(fight.startPlayer??[]).filter(unit=>!unit.drone&&unit.count>(state.fleet.find(ship=>ship.key===unit.key)?.count??unit.count)&&!state.unrepairable?.includes(unit.key)).map(unit=>`<label class="bsim-checkbox"><input type="checkbox" value="${escape(unit.key)}"${repairKeys.includes(unit.key)?' checked':''}>${escape(unit.name)}</label>`).join(''):'';
    el('repairShips').disabled=!repairEligible;
    const physical=state.fleet.filter(unit=>!unit.drone&&!unit.detached).reduce((sum,unit)=>sum+unit.count,0);
    el('status').textContent=`${physical} ships · ${state.hours}/${state.defaults.maximumHours} hours · Morale ${state.morale} · Stealth ${state.stealth}`;
    el('result').textContent=commandRecordOutcome(state)==='loss'?'Mission lost. Continue at section 29.':fight?`${fight.status} · Round ${fight.round}${fight.section?' · Continue at section '+fight.section:''}`:'Ready';
    el('forces').innerHTML=fight?'<table class="bsim-report-table"><thead><tr><th>Force</th><th>Remaining</th></tr></thead><tbody>'+[...fight.player,...fight.enemies].map(unit=>`<tr><td>${escape(unit.name)}</td><td>${unit.count}${unit.drone?' ('+(unit.count-unit.spent)+' ready)':''}</td></tr>`).join('')+'</tbody></table>':'';
    const rounds=(fight?.history??[]).slice().reverse().map(event=>`Round ${event.round}: `+event.attacks.map(a=>`${a.side==='player'?'You':'Enemy'} AS ${a.strength}, Chart ${a.chart}${a.total==null?'':', roll '+a.total}: ${a.hits} hits`+(a.losses.length?' ('+a.losses.map(loss=>loss.count+' '+loss.name).join(', ')+')':'')).join('; '));
    el('log').innerHTML=[...rounds,...state.log.slice().reverse().map(eventText)].map(line=>'<div>'+escape(line)+'</div>').join('');
    el('history').innerHTML=state.history.slice(-30).reverse().map(entry=>`<div>${escape(entry.enemy)} · ${escape(entry.outcome)}</div>`).join('');
  }
  const button=(key,label)=>`<button class="bsim-action-btn" type="button" id="${ID}-${key}">${escape(label)}</button>`;
  const select=(key,label,options)=>`<label class="inv-edit-row"><span>${escape(label)}</span><select class="inv-edit-input" id="${ID}-${key}">${options}</select></label>`;
  const input=(key,label,value='',min=0,max=1000000,step=1)=>`<label class="inv-edit-row"><span>${escape(label)}</span><input class="inv-edit-input" type="number" id="${ID}-${key}" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
  const options=entries=>entries.map(entry=>`<option value="${escape(entry.key??entry.section)}">${escape(entry.label)}</option>`).join('');
  function init() {
    if (el('overlay'))return;
    const rules=defaults().instructions;
    const chartOptions=Object.keys(getCharts()).map(chart=>`<option value="${chart}">${chart}</option>`).join('');
    const overlay=document.createElement('div');overlay.id=ID+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(t(definition.i18nPrefix+'.title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><details id="${ID}-record"><summary>Fleet and clock</summary>${input('morale','Morale',defaults().morale)}${input('stealth','Stealth',defaults().stealth)}${input('hours','Hours used',0,0,1000000,.5)}<details id="${ID}-fleet"><summary>Ship loss record</summary><table class="bsim-report-table"><thead><tr><th>Ship</th><th>Remaining</th><th>Away</th></tr></thead><tbody id="${ID}-fleetRows"></tbody></table></details><div class="bsim-btn-row">${button('saveRecord','Apply record')}${button('reset','Starting fleet')}</div></details>${select('encounter','Encounter','<option value="">Custom fight</option>'+options(getRoster()))}<p id="${ID}-note"></p><p id="${ID}-forceSummary"></p>${select('playerChart','Your chart',chartOptions)}${select('enemyChart','Enemy chart',chartOptions)}${select('initiative','Initiative','<option value="you">You first</option><option value="enemy">Enemy first</option>')}<div id="${ID}-shipSelection"></div><div id="${ID}-playerEditor"></div><div id="${ID}-enemyEditor"></div><details><summary>Exchange controls</summary><p>Leave dice blank to roll automatically. Protected ships remain last casualties.</p>${input('playerRoll','Your 2d6','',2,12)}${input('enemyRoll','Enemy 2d6','',2,12)}${input('drones','Drones firing',0,0,9)}${select('playerLoss','Your first loss','')}${select('enemyLoss','Enemy first loss','')}${select('fireFirst','First to fire','')}</details><div class="bsim-btn-row">${button('start','Start encounter')}${button('attack','Next exchange')}${button('cancel','End encounter')}</div><details><summary>Journey tests and repairs</summary>${select('test','Test',options(rules.tests))}${button('rollTest','Roll test')}${select('effect','Instructions',options(rules.effects))}${button('applyEffect','Apply instructions')}<div class="bsim-btn-row">${button('repairFlagship','Repair Inverness')}${button('recover','Recover drones')}</div><p>Optional repairs: choose up to two ships lost in the latest pirate encounter. Each attempt uses one hour.</p><div id="${ID}-repairSelection"></div>${button('repairShips','Attempt ship repairs')}</details></div><div class="bsim-col bsim-col-right"><h4 id="${ID}-status"></h4><p id="${ID}-result"></p><div id="${ID}-forces"></div><h4>Log</h4><div class="bsim-log" id="${ID}-log"></div><h4>Battle history</h4><div id="${ID}-history"></div></div></div></div>`;
    document.body.appendChild(overlay);
    const opponents=getRoster().flatMap(entry=>entry.enemies.map(editable));
    enemyEditor=createOpponentEditor({document,id:ID+'-enemy',t,fields,presets:opponents});
    playerEditor=createOpponentEditor({document,id:ID+'-player',t,fields,presets:defaults().fleet.map(editable)});
    playerEditor.element.querySelector('summary').textContent='Your force';
    el('enemyEditor').appendChild(enemyEditor.element);el('playerEditor').appendChild(playerEditor.element);
    const launch=document.createElement('button');launch.id=ID+'-btn';launch.style.display='none';
    getButtonRow().appendChild(launch);launch.addEventListener('click',open);el('close').addEventListener('click',close);
    registerShortcut({button:launch,overlay,open,close});
    let backdrop=false;
    overlay.addEventListener('mousedown',event=>{backdrop=event.target===overlay;});
    overlay.addEventListener('click',event=>{if(backdrop&&event.target===overlay)close();});
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();}});
    el('encounter').addEventListener('change',()=>action(state=>active(state)?state:{...state,encounter:el('encounter').value}));
    el('start').addEventListener('click',()=>action(start));el('attack').addEventListener('click',()=>action(step));
    el('saveRecord').addEventListener('click',()=>action(saveRecord));
    for(const key of ['cancel','reset'])el(key).addEventListener('click',()=>confirm(key));
    el('applyEffect').addEventListener('click',()=>action(state=>applyCommandEffect(state,rules.effects.find(effect=>effect.key===el('effect').value))));
    el('rollTest').addEventListener('click',()=>action(state=>testCommandRecord(state,rules.tests.find(rule=>rule.section===el('test').value))));
    el('recover').addEventListener('click',()=>action(state=>recoverCommandDrones(state)));
    el('repairFlagship').addEventListener('click',()=>action(state=>repairCommandFlagship(state,rules.flagshipRepairs.find(rule=>rule.section===state.fight?.section))));
    el('repairShips').addEventListener('click',()=>action(state=>repairCommandShips(state,rules.shipRepair,[...el('repairSelection').querySelectorAll('input:checked')].map(input=>input.value))));
  }
  return {init,render,setVisible(value){const launch=el('btn');if(launch)launch.style.display=value?'':'none';if(!value)close();}};
}
