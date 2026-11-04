// Present optional Horror Classic encounters, combat controls and source rulings.
import {ATTRIBUTES, rollDice, naturalHealing} from './math.js';
import {startFight, rollInitiative, strike, resolveStrike, advanceRound, stopFight} from './core.js';
import {playerPower, enemyPower, combatItem, resolveManually, endCalmedFight, allyMindCloud} from './powers.js';
import {attemptFlight, startArchery, archeryCheck, resolveArchery} from './special.js';
import {createOpponentEditor} from '../../opponents.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const active = fight => Boolean(fight && !fight.outcome);
const fields = ['lifePoints',...ATTRIBUTES];

export function createHorrorPanel({definition,document,t,store,getRun,getBookId,getEncounters,getAllies=()=>[],getRules,
  getButtonRow,showAlert,showConfirm,registerShortcut = ()=>{}}) {
  const ID = definition.stateKey, tk = (key,args)=>t(definition.i18nPrefix+'.'+key,args);
  const el = key=>document.getElementById(ID+'-'+key);
  const button = key=>`<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const numeric = (key,min=0,max=10000)=>`<input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="${max}" step="any" autocomplete="off">`;
  const row = (key,control)=>`<label class="inv-edit-row"><span>${escape(tk(key))}</span>${control}</label>`;
  const choose = (key,values)=>`<select class="inv-edit-input" id="${ID}-${key}">${values.map(([value,label])=>`<option value="${escape(value)}">${escape(label)}</option>`).join('')}</select>`;
  const checkbox = key=>`<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}"> ${escape(tk(key))}</label>`;
  let shownRun,rendered,editor,allyEditor;
  function close() {el('overlay')?.classList.remove('active');rendered=null;}
  function change(update) {
    if (shownRun !== getRun() || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) {close();return;}
    try {if (store.change(update)) render(true);} catch(error) {showAlert(error.message || tk('invalid'));}
  }
  function setup() {
    return {hero:Object.fromEntries(fields.map(key=>[key,el(key).value])),role:el('role').value,
      section:el('encounter').value,groupMode:el('groupMode').value,weapon:el('weapon').value,
      garlicOil:el('garlicOil').checked,partyCard:el('partyCard').checked,cursed:el('cursed').checked,
      bat:el('bat').checked,countScore:el('countScore').value,opponents:editor.snapshot(),
      useAllies:el('useAllies').checked,allies:allyEditor.snapshot()};
  }
  function saveSetup() {if (!active(store.read()?.fight)) change(data=>{data.setup=setup();});}
  function preset() {return getEncounters().find(item=>String(item.section)===el('encounter').value);}
  function selectPreset(item) {
    if (active(store.read()?.fight)) return;
    change(data=>{
      const options=setup();
      data.setup={...options,section:String(item.section),countScore:'',garlicOil:Boolean(item.rules.garlicOil),
        groupMode:item.rules.sequential?'sequential':options.groupMode,
        opponents:Array.from({length:item.count.fixed || 1},()=>({...item}))};
      editor.set(data.setup.opponents);editor.fixCount(true);
    });
  }
  function setCount(rollIt) {
    if (active(store.read()?.fight)) return;
    const item=preset();
    if (!item?.count.dice) return;
    change(data=>{
      const roll=rollDice(item.count.dice,undefined,rollIt?undefined:el('countScore').value);
      const count=Math.ceil(roll.total/(item.count.divisor || 1));
      data.setup={...setup(),countScore:String(roll.total),opponents:Array.from({length:count},()=>({...item}))};
      editor.set(data.setup.opponents);
    });
  }
  function makeEditor(options) {
    editor=createOpponentEditor({document,id:ID,t,presets:getEncounters(),onSelect:selectPreset,
      fields:fields.map(key=>({key,label:tk(key),min:key==='lifePoints'?0.000001:0,max:10000,step:'any'})),
      isStatUnavailable:(key,item)=>item.mode==='archery'});
    editor.set(options.opponents);editor.fixCount(options.section!=='custom');
    editor.element.addEventListener('change',saveSetup);
    el('editor').replaceChildren(editor.element);
    allyEditor=createOpponentEditor({document,id:ID+'-allies',t,presets:getAllies(),
      fields:fields.map(key=>({key,label:tk(key),min:key==='lifePoints'?0.000001:0,max:10000,step:'any'}))});
    allyEditor.set(options.allies);
    allyEditor.element.addEventListener('change',saveSetup);
    el('allyEditor').replaceChildren(allyEditor.element);
  }
  function updateFight(data,fight) {
    data.fight=fight;
    data.setup.hero={...data.setup.hero,lifePoints:fight.player.lifePoints,psi:fight.player.psi};
    if (fight.allies?.length) data.setup.allies=structuredClone(fight.allies);
  }
  function act(action) {change(data=>updateFight(data,action(data.fight)));}
  function selected() {return Number(el('target').value);}
  function rollOptions() {return {enemyIndex:selected(),total:el('manualTotal').value};}
  function optionsForFight(options) {
    return Object.fromEntries(['weapon','garlicOil','partyCard','cursed','bat'].map(key=>[key,options[key]]));
  }
  function describe(event,fight) {
    const actor=event.actor==='player'?tk('player'):event.actor==='ally'?event.ally:event.enemy || tk('enemy');
    if (event.kind==='strike') return tk('strikeLog',{actor,score:event.score,damage:event.damage,target:event.target,targetLife:event.targetLife});
    if (event.kind==='initiative') return tk('initiativeLog',{player:event.playerScore,enemy:event.enemyScore,first:event.first?tk(event.first):tk('tie')});
    if (event.kind==='effect') return tk('effectLog',{effect:tk('effect.'+event.effect),enemy:event.enemy,life:event.playerLife});
    if (event.kind==='player-power' || event.kind==='enemy-power') return tk('powerLog',{power:tk('power.'+event.power),score:event.roll?.total ?? '',result:event.success===false?tk('miss'):''});
    if (event.kind==='combat-item') return tk('itemLog',{item:tk('item.'+event.item),enemy:event.enemy});
    if (event.kind==='manual-ruling' || event.kind==='manual-archery') return tk('manualLog',{note:event.note});
    if (event.kind==='archery') return tk('archeryLog',{stage:tk('archery.'+event.stage),score:event.score});
    if (event.kind==='flight') return tk('flightLog',{score:event.score,route:tk('route.'+event.route)});
    if (event.kind==='poison') return tk('poisonLog',{amount:event.amount,round:event.round,target:event.target});
    if (event.kind==='psi-payment') return tk('paymentLog',{amount:event.amount,payment:tk(event.payment==='psi'?'psi':'lifePoints')});
    if (event.kind==='source-condition') return tk('condition.'+event.condition);
    if (event.kind==='ally-cloud') return tk('allyCloudLog',{ally:event.ally,enemy:event.enemy});
    if (event.kind==='fatal-strike' || event.kind==='poisonous-blood') return tk('fatalLog',{actor,score:event.score ?? event.roll.total});
    if (event.kind==='stake-driving') return tk('stakeLog',{enemy:event.enemy});
    if (event.kind==='choose-effect-order') return tk('orderNote');
    if (event.kind==='missed-round') return tk('missedRound',{round:event.round});
    return tk(event.kind);
  }
  function render(force=false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (shownRun!==getRun() || Number(getBookId())!==definition.id) {close();return;}
    const data=store.read();if (!data || !force && rendered===data) return;
    rendered=data;
    const options=data.setup,fight=data.fight,locked=active(fight),pending=Boolean(fight?.pending),special=Boolean(fight?.special);
    if (!editor) makeEditor(options);
    for (const key of fields) {el(key).value=options.hero[key];el(key).disabled=locked;}
    for (const key of ['role','groupMode','weapon','countScore']) {el(key).value=options[key] ?? '';el(key).disabled=locked;}
    for (const key of ['garlicOil','partyCard','cursed','bat','useAllies']) {el(key).checked=options[key]===true;el(key).disabled=locked;}
    el('encounter').value=options.section;el('encounter').disabled=locked;editor.lock(locked);
    allyEditor.lock(locked || !options.useAllies);
    const item=getEncounters().find(p=>String(p.section)===options.section);
    el('encounterNote').textContent=item?.note || tk('customNote');
    el('countControls').hidden=!item?.count.dice;
    for (const key of ['rollCount','applyCount','rollStats','start']) el(key).disabled=locked;
    const prior=el('target').value;
    el('target').innerHTML=(fight?.enemies || []).map((enemy,index)=>`<option value="${index}">${escape(enemy.name)}${enemy.lifePoints==null?'':': '+escape(enemy.lifePoints)}</option>`).join('');
    if (fight?.enemies[prior]) el('target').value=prior;
    if (locked && fight.groupMode==='sequential') {
      const index=fight.enemies.findIndex(e=>!e.withdrawn && e.lifePoints>(e.rules.defeatAt ?? 0));
      if (index>=0) el('target').value=String(index);
    }
    el('target').disabled=!locked || pending || fight?.groupMode==='sequential';
    const priorAlly=el('ally').value,priorDefender=el('defender').value;
    el('ally').innerHTML=(fight?.allies || []).map((ally,index)=>`<option value="${index}">${escape(ally.name)}</option>`).join('');
    if (fight?.allies?.[priorAlly]) el('ally').value=priorAlly;
    el('defender').innerHTML=`<option value="">${escape(tk('player'))}</option>`+(fight?.allies || []).map((ally,index)=>`<option value="${index}">${escape(ally.name)}</option>`).join('');
    if (fight?.allies?.[priorDefender]) el('defender').value=priorDefender;
    for (const key of ['allyStrike','allyCloud','ally','defender']) el(key).disabled=!locked || pending || special;
    el('allyStrike').disabled ||= !fight?.allies?.length;
    el('allyCloud').disabled ||= !fight?.allies?.[Number(el('ally').value)]?.rules.mindCloud;
    for (const key of ['initiative','playerStrike','enemyStrike','nextRound','usePower','useItem','applyRuling','flight']) el(key).disabled=!locked || pending || special;
    el('cancel').disabled=!locked;
    el('orderControls').hidden=!pending;
    el('combatControls').hidden=special;
    el('archeryControls').hidden=!special;
    el('archeryCheck').disabled=!locked || fight?.special?.stage==='manual';
    el('resolveArchery').disabled=!locked || fight?.special?.stage!=='manual';
    el('archeryStage').textContent=special?tk('archery.'+fight.special.stage):'';
    el('heal').disabled=locked || options.role!=='harker';
    el('flight').disabled ||= Boolean(fight?.roundActions || fight?.round>1 || fight?.flightAttempted);
    const powers=fight?.role==='dracula'?['transform','calm','recruit']:['beatification','sanctuary','stake'];
    const chosenPower=el('power').value;
    el('power').innerHTML=powers.map(key=>`<option value="${key}">${escape(tk('power.'+key))}</option>`).join('');
    if (powers.includes(chosenPower)) el('power').value=chosenPower;
    const enemy=fight?.enemies[selected()],chosenEnemyPower=el('enemyPower').value;
    el('enemyPower').innerHTML=(enemy?.rules?.powers || []).map(key=>`<option value="${key}">${escape(tk('power.'+key))}</option>`).join('');
    if (enemy?.rules?.powers?.includes(chosenEnemyPower)) el('enemyPower').value=chosenEnemyPower;
    el('useEnemyPower').disabled=!locked || pending || special || !el('enemyPower').value;
    el('finishCalmed').disabled=!locked || pending || special || fight.enemies.some(e=>!e.withdrawn && e.lifePoints>(e.rules.defeatAt ?? 0));
    el('status').textContent=tk('status.'+(fight?.outcome || (pending?'manual':fight?'active':'ready')));
    el('totals').textContent=fight?tk('totals',{life:fight.player.lifePoints,psi:fight.player.psi*(fight.options.garlicOil?0.5:1),round:fight.round ?? ''}):'';
    el('allyTotals').textContent=(fight?.allies || []).map(ally=>tk('allyTotals',{name:ally.name,life:ally.lifePoints,psi:ally.psi})).join(' · ');
    el('firstResult').textContent=fight?.first?tk('firstResult',{actor:tk(fight.first)}):'';
    el('log').innerHTML=(fight?.events || []).slice(-80).map(event=>'<div>'+escape(describe(event,fight))+'</div>').join('');
    el('history').innerHTML=data.history.slice(-40).reverse().map(entry=>'<div>'+escape(entry.enemy+': '+tk('status.'+entry.outcome))+'</div>').join('');
  }
  function open() {
    if (Number(getBookId())!==definition.id || !getRun()) {showAlert(t('battlesim.no_active_playthrough'));return;}
    if (!getRules()) {showAlert(tk('unavailable'));return;}
    shownRun=getRun();editor=null;allyEditor=null;
    try {if (!store.read()) store.change(()=>{});el('overlay').classList.add('active');render(true);el('close').focus();}
    catch(error) {close();showAlert(error.message || tk('invalid'));}
  }
  function init() {
    if (el('overlay')) return;
    const selectLabels=(key,values)=>choose(key,values.map(value=>[value,tk(value)]));
    const overlay=document.createElement('div');overlay.id=ID+'-overlay';overlay.className='inv-overlay';
    const encounter=choose('encounter',[['custom',tk('custom')],...getEncounters().map(item=>[item.section,item.displayName])]);
    overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p>${row('encounter',encounter)}<p id="${ID}-encounterNote"></p>${row('role',selectLabels('role',['harker','dracula']))}<details open><summary>${escape(tk('hero'))}</summary>${fields.map(key=>row(key,numeric(key,key==='lifePoints'?0.000001:0,key==='lifePoints'?100:10000))).join('')}${button('rollStats')}</details>${row('weapon',selectLabels('weapon',['none','dagger','mace','flintlock']))}${['garlicOil','partyCard','cursed','bat'].map(checkbox).join('')}${row('groupMode',selectLabels('groupMode',['manual','sequential']))}<div id="${ID}-countControls">${row('countScore',numeric('countScore',1,12))}<div class="bsim-btn-row">${button('rollCount')}${button('applyCount')}</div></div><div id="${ID}-editor"></div>${button('start')}${row('target',choose('target',[]))}${row('manualTotal',numeric('manualTotal',1,12))}<p>${escape(tk('manualDiceNote'))}</p><div id="${ID}-combatControls">${row('enemyInitiative',numeric('enemyInitiative',1,6))}<div class="bsim-btn-row">${button('initiative')}${button('playerStrike')}${button('enemyStrike')}${button('nextRound')}</div><p>${escape(tk('roundNote'))}</p><details><summary>${escape(tk('powers'))}</summary>${row('power',choose('power',[]))}${row('payment',selectLabels('payment',['psi','life']))}${checkbox('wholePack')}${button('usePower')}${button('finishCalmed')}${row('item',choose('item',['hand','paralyser','antidote'].map(key=>[key,tk('item.'+key)])))}${button('useItem')}<p>${escape(tk('itemNote'))}</p>${row('enemyPower',choose('enemyPower',[]))}${button('useEnemyPower')}</details><details><summary>${escape(tk('flight'))}</summary>${row('failedRule',selectLabels('failedRule',['detailed','synopsis']))}${button('flight')}</details><details><summary>${escape(tk('manualRuling'))}</summary><p>${escape(tk('manualRulingNote'))}</p>${row('rulingPlayerLife',numeric('rulingPlayerLife',-10000,100))}${row('rulingEnemyLife',numeric('rulingEnemyLife',-10000))}${row('rulingNote',`<input class="inv-edit-input" id="${ID}-rulingNote" autocomplete="off" maxlength="500">`)}${button('applyRuling')}</details></div><div id="${ID}-orderControls" hidden><p>${escape(tk('orderNote'))}</p><div class="bsim-btn-row">${button('damageFirst')}${button('effectsFirst')}</div></div><div id="${ID}-archeryControls" hidden><p id="${ID}-archeryStage"></p>${button('archeryCheck')}${row('archeryDecision',selectLabels('archeryDecision',['speed','enemy','player','win','loss','cancelled']))}${row('archeryNote',`<input class="inv-edit-input" id="${ID}-archeryNote" autocomplete="off" maxlength="500">`)}${button('resolveArchery')}</div><details><summary>${escape(tk('healing'))}</summary>${row('healingRule',selectLabels('healingRule',['detailed','synopsis']))}${button('heal')}</details>${button('cancel')}</div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-totals"></p><p id="${ID}-firstResult"></p><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    el('start').insertAdjacentHTML('beforebegin',`<details><summary>${escape(tk('allies'))}</summary>${checkbox('useAllies')}<p>${escape(tk('allyNote'))}</p><div id="${ID}-allyEditor"></div></details>`);
    el('nextRound').parentElement.insertAdjacentHTML('afterend',`${row('ally',choose('ally',[]))}${row('defender',choose('defender',[]))}<div class="bsim-btn-row">${button('allyStrike')}${button('allyCloud')}</div>`);
    el('rulingPlayerLife').closest('label').insertAdjacentHTML('afterend',row('rulingPlayerPsi',numeric('rulingPlayerPsi')));
    el('totals').insertAdjacentHTML('afterend',`<p id="${ID}-allyTotals"></p>`);
    const trigger=document.createElement('button');trigger.id=ID+'-btn';trigger.style.display='none';trigger.textContent=t('battlesim.title');
    getButtonRow().appendChild(trigger);trigger.addEventListener('click',open);
    el('close').addEventListener('click',close);
    let backdrop=false;
    overlay.addEventListener('mousedown',event=>{backdrop=event.target===overlay;});
    overlay.addEventListener('click',event=>{if (backdrop && event.target===overlay) close();});
    overlay.addEventListener('keydown',event=>{if (event.key==='Escape' && !event.defaultPrevented) {event.stopPropagation();close();}});
    for (const key of [...fields,'role','weapon','groupMode','garlicOil','partyCard','cursed','bat','useAllies']) el(key).addEventListener('change',saveSetup);
    el('encounter').addEventListener('change',()=>{
      const item=preset();if (item) selectPreset(item);
      else change(data=>{data.setup={...setup(),section:'custom',opponents:editor.snapshot().map(item=>({...item,rules:{},mode:'combat',maxLife:undefined}))};editor.set(data.setup.opponents);editor.fixCount(false);});
    });
    el('rollCount').addEventListener('click',()=>setCount(true));el('applyCount').addEventListener('click',()=>setCount(false));
    el('rollStats').addEventListener('click',()=>change(data=>{
      if (active(data.fight)) return;
      data.setup=setup();for (const key of ATTRIBUTES) data.setup.hero[key]=rollDice(1).total;
    }));
    el('start').addEventListener('click',()=>change(data=>{
      if (active(data.fight)) throw new RangeError(tk('active'));
      const options=setup(),item=preset(),enemies=editor.read().map(enemy=>({...enemy,name:enemy.displayName || enemy.name}));
      if (item?.count.dice && !options.countScore) throw new RangeError(tk('countRequired'));
      const expected=item?.count.fixed ?? (item?.count.dice?Math.ceil(rollDice(item.count.dice,undefined,options.countScore).total/(item.count.divisor || 1)):enemies.length);
      if (enemies.length!==expected) throw new RangeError(tk('countRequired'));
      data.setup=options;
      const allies=options.useAllies?allyEditor.read().map(ally=>({...ally,name:ally.displayName || ally.name})):[];
      const config={player:options.hero,allies,role:options.role,section:options.section,options:optionsForFight(options)};
      const next=item?.mode==='archery'?startArchery({...config,name:item.name}):startFight({...config,enemies,groupMode:options.groupMode});
      if (item?.rules.first) next.first=item.rules.first;
      updateFight(data,next);
    }));
    el('target').addEventListener('change',()=>render(true));
    el('initiative').addEventListener('click',()=>act(f=>rollInitiative(f,{enemyIndex:selected(),playerRoll:el('manualTotal').value,enemyRoll:el('enemyInitiative').value})));
    el('playerStrike').addEventListener('click',()=>act(f=>strike(f,{...rollOptions(),actor:'player'})));
    el('enemyStrike').addEventListener('click',()=>act(f=>strike(f,{...rollOptions(),actor:'enemy',targetAllyIndex:el('defender').value===''?null:Number(el('defender').value)})));
    el('allyStrike').addEventListener('click',()=>act(f=>strike(f,{...rollOptions(),actor:'ally',allyIndex:Number(el('ally').value)})));
    el('allyCloud').addEventListener('click',()=>act(f=>allyMindCloud(f,{enemyIndex:selected(),allyIndex:Number(el('ally').value)})));
    el('nextRound').addEventListener('click',()=>act(advanceRound));
    el('damageFirst').addEventListener('click',()=>act(f=>resolveStrike(f,'damage-first')));
    el('effectsFirst').addEventListener('click',()=>act(f=>resolveStrike(f,'effects-first')));
    el('usePower').addEventListener('click',()=>act(f=>playerPower(f,{power:el('power').value,payment:el('payment').value,
      enemyIndex:selected(),enemyIndices:el('wholePack').checked?f.enemies.map((_,i)=>i).filter(i=>f.enemies[i].rules.smallAnimal):undefined})));
    el('finishCalmed').addEventListener('click',()=>act(endCalmedFight));
    el('useItem').addEventListener('click',()=>act(f=>combatItem(f,{item:el('item').value,enemyIndex:selected()})));
    el('useEnemyPower').addEventListener('click',()=>act(f=>enemyPower(f,{...rollOptions(),power:el('enemyPower').value})));
    el('applyRuling').addEventListener('click',()=>act(f=>resolveManually(f,{enemyIndex:selected(),playerLife:el('rulingPlayerLife').value,playerPsi:el('rulingPlayerPsi').value,enemyLife:el('rulingEnemyLife').value,note:el('rulingNote').value})));
    el('flight').addEventListener('click',()=>act(f=>attemptFlight(f,{...rollOptions(),failedRule:el('failedRule').value})));
    el('archeryCheck').addEventListener('click',()=>act(f=>archeryCheck(f,{total:el('manualTotal').value})));
    el('resolveArchery').addEventListener('click',()=>act(f=>resolveArchery(f,{decision:el('archeryDecision').value,note:el('archeryNote').value})));
    el('heal').addEventListener('click',()=>change(data=>{
      if (active(data.fight)) throw new RangeError(tk('active'));
      const options=setup(),result=naturalHealing(options.hero,{role:options.role,score:el('manualTotal').value,rules:el('healingRule').value});
      data.setup={...options,hero:result.player};
    }));
    el('cancel').addEventListener('click',()=>{
      const run=getRun(),before=store.read();showConfirm(tk('cancelConfirm'),()=>{if (getRun()===run && store.read()===before) act(stopFight);});
    });
    registerShortcut({button:trigger,overlay,open,close});
  }
  return {init,render,open,close,setVisible(visible) {
    if (el('btn')) el('btn').style.display=visible?'':'none';
    if (!visible) {close();shownRun=null;}
  }};
}
