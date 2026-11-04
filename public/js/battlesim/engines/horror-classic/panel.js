// Present optional Horror Classic encounters, combat controls and source rulings.
import {ATTRIBUTES, rollDice, naturalHealing} from './math.js';
import {startFight, rollInitiative, strike, resolveStrike, advanceRound, stopFight} from './core.js';
import {playerPower, enemyPower, combatItem, resolveManually, endCalmedFight, allyMindCloud, resolveMadScience, ROLE_POWERS} from './powers.js';
import {attemptFlight, startArchery, archeryCheck, resolveArchery} from './special.js';
import {startMachine, machineStrike, resolveAttackMode, enemyShot, breakOff} from './encounters.js';
import {panelProfile, encounterCount, configuredOptions} from './setup.js';
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
  const profile=()=>panelProfile(getRules() || {});
  const extraValues=()=>Object.fromEntries(profile().extras.map(field=>[field.key,field.type==='checkbox'?el(field.key).checked:Number(el(field.key).value)]));
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
      useAllies:el('useAllies').checked,allies:allyEditor.snapshot(),...extraValues(),
      resurrectionCount:el('resurrectionCount').value,useCompanionReduction:el('useCompanionReduction').checked,reductionScore:el('reductionScore').value,
      openingDamageApplied:el('openingDamageApplied').checked};
  }
  function saveSetup() {if (!active(store.read()?.fight)) change(data=>{data.setup=setup();});}
  function preset() {return getEncounters().find(item=>String(item.section)===el('encounter').value);}
  function selectPreset(item) {
    if (active(store.read()?.fight)) return;
    change(data=>{
      const options=setup();
      data.setup={...options,section:String(item.section),countScore:'',reductionScore:'',useCompanionReduction:false,resurrectionCount:'',openingDamageApplied:false,garlicOil:Boolean(item.rules.garlicOil),
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
      const options={...setup(),countScore:String(roll.total)};
      if (rollIt && options.useCompanionReduction && item.preCombatReduction?.kind==='die') options.reductionScore=String(rollDice(item.preCombatReduction.dice).total);
      const count=encounterCount(item,options);
      data.setup={...options,opponents:Array.from({length:count},()=>({...item}))};
      editor.set(data.setup.opponents);
    });
  }
  function makeEditor(options) {
    editor=createOpponentEditor({document,id:ID,t,presets:getEncounters(),onSelect:selectPreset,
      fields:fields.map(key=>({key,label:tk(key),min:key==='lifePoints'?0.000001:0,max:10000,step:'any'})),
      isStatUnavailable:(key,item)=>['archery','machine'].includes(item.mode) || item.rules?.unavailableStats?.includes(key)});
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
    const persistent=profile().persistentStatuses;
    if (persistent.length) data.setup.hero.status=Object.fromEntries(persistent.map(key=>[key,fight.player.status[key] ?? 0]));
    if (fight.allies?.length) data.setup.allies=structuredClone(fight.allies);
  }
  function act(action) {change(data=>updateFight(data,action(data.fight)));}
  function selected() {return Number(el('target').value);}
  function rollOptions() {return {enemyIndex:selected(),total:el('manualTotal').value};}
  function optionsForFight(options) {
    return configuredOptions(options,profile());
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
    if (event.kind==='opening-damage') return tk('openingDamageLog',{amount:event.amount});
    if (event.kind==='resurrection') return tk('resurrectionLog',{enemy:event.enemy,life:event.life,remaining:event.remaining});
    if (event.kind==='machine-strike') return tk('machineLog',{actor,score:event.score,damage:event.damage,life:event.playerLife});
    if (event.kind==='single-shot') return tk('singleShotLog',{enemy:event.enemy,score:event.roll.total,result:tk(event.hit?'loss':'miss')});
    if (event.kind==='fatal-strike' || event.kind==='poisonous-blood') return tk('fatalLog',{actor,score:event.score ?? event.roll.total});
    if (event.kind==='stake-driving') return tk('stakeLog',{enemy:event.enemy});
    if (event.kind==='choose-effect-order') return tk('orderNote');
    if (event.kind==='missed-round') return tk('missedRound',{round:event.round,actor});
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
    for (const field of profile().extras) {
      const value=locked?fight.options[field.key]:options[field.key];
      if (field.type==='checkbox') el(field.key).checked=value===true;
      else el(field.key).value=String(value ?? 0);
      el(field.key).disabled=pending || locked && !field.live;
    }
    for (const key of ['resurrectionCount','reductionScore']) {el(key).value=options[key] ?? '';el(key).disabled=locked;}
    el('useCompanionReduction').checked=options.useCompanionReduction===true;
    el('useCompanionReduction').disabled=locked;
    el('openingDamageApplied').checked=options.openingDamageApplied===true;
    el('openingDamageApplied').disabled=locked;
    el('encounter').value=options.section;el('encounter').disabled=locked;editor.lock(locked);
    allyEditor.lock(locked || !options.useAllies);
    const item=getEncounters().find(p=>String(p.section)===options.section);
    el('encounterNote').textContent=item?.note || tk('customNote');
    el('countControls').hidden=!item?.count.dice;
    el('companionControls').hidden=!item?.preCombatReduction;
    el('reductionScore').closest('label').hidden=item?.preCombatReduction?.kind!=='die';
    el('rollReduction').hidden=item?.preCombatReduction?.kind!=='die';
    el('resurrectionControls').hidden=!item?.rules.resurrection?.rollCount;
    el('openingControls').hidden=!item?.rules.groupOpeningDamage;
    for (const key of ['rollReduction','rollResurrections']) el(key).disabled=locked;
    let remaining;
    if (item?.preCombatReduction && options.countScore) {
      try {remaining=encounterCount(item,options);} catch {}
    }
    el('remainingCount').textContent=remaining==null?'':tk('remainingCount',{count:remaining});
    el('editor').hidden=remaining===0;
    for (const key of ['rollCount','applyCount','rollStats','start']) el(key).disabled=locked;
    const prior=el('target').value;
    el('target').innerHTML=(fight?.enemies || []).map((enemy,index)=>`<option value="${index}">${escape(enemy.name)}${enemy.lifePoints==null?'':': '+escape(enemy.lifePoints)}</option>`).join('');
    if (fight?.enemies[prior]) el('target').value=prior;
    if (locked && fight.groupMode==='sequential') {
      const index=fight.openingStrikesRemaining?.[0] ?? fight.enemies.findIndex(e=>!e.withdrawn && e.lifePoints>(e.rules.defeatAt ?? 0));
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
    el('orderControls').hidden=fight?.pending?.kind!=='effect-order';
    el('combatControls').hidden=special;
    el('archeryControls').hidden=fight?.special?.kind!=='archery';
    el('archeryCheck').disabled=!locked || fight?.special?.stage==='manual';
    el('resolveArchery').disabled=!locked || fight?.special?.stage!=='manual';
    el('archeryStage').textContent=fight?.special?.kind==='archery'?tk('archery.'+fight.special.stage):'';
    const pendingKind=fight?.pending?.kind;
    el('sourceControls').hidden=!['mad-science-explosion','attack-mode','source-roll'].includes(pendingKind);
    el('resolveExplosion').hidden=pendingKind!=='mad-science-explosion';
    el('rayControls').hidden=pendingKind!=='attack-mode';
    el('machineControls').hidden=fight?.special?.kind!=='machine';
    for (const key of ['machinePlayer','machineEnemy']) el(key).disabled=!locked || pending;
    el('machineArmour').disabled=!locked || pending || fight?.role!=='doctor' || fight?.options.bodyArmour;
    el('singleShot').hidden=!fight?.enemies[selected()]?.rules.singleFatalShot;
    el('singleShot').disabled=!locked || pending || Boolean(fight?.enemies[selected()]?.status.shotUsed);
    el('breakOff').hidden=!fight?.enemies.some(enemy=>enemy.rules.allowBreakOff);
    el('breakOff').disabled=!locked || pending;
    el('treatPlague').hidden=!profile().items.includes('triple-dose');
    el('treatPlague').disabled=locked || !(options.hero.status?.poison>0);
    if (pendingKind==='source-roll') {
      el('applyRuling').disabled=false;
      el('applyRuling').closest('details').open=true;
      if (!el('rulingPlayerLife').value) el('rulingPlayerLife').value=fight.player.lifePoints;
      if (!el('rulingEnemyLife').value) el('rulingEnemyLife').value=fight.enemies[selected()].lifePoints;
    }
    el('heal').disabled=locked || !profile().naturalHealingRoles.includes(options.role);
    el('flight').disabled ||= Boolean(fight?.roundActions || fight?.round>1 || fight?.flightAttempted);
    el('initiative').disabled ||= Boolean(fight?.enemies[selected()]?.rules.forcedFirst || fight?.openingStrikesRemaining?.length);
    el('playerStrike').disabled ||= Boolean(fight?.openingStrikesRemaining?.length || fight?.enemyStrikesOwed>0
      || fight?.enemies[selected()]?.rules.forcedFirst==='enemy' && fight?.round===1 && !fight?.roundActions);
    const powers=ROLE_POWERS[locked?fight.role:options.role] || [];
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
    el('enemyTotals').textContent=(fight?.enemies || []).filter(enemy=>enemy.lifePoints!=null)
      .map(enemy=>tk('allyTotals',{name:enemy.name,life:enemy.lifePoints,psi:enemy.psi ?? tk('notSupplied')})).join(' · ');
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
    overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p>${row('encounter',encounter)}<p id="${ID}-encounterNote"></p>${row('role',selectLabels('role',profile().roles))}<details open><summary>${escape(tk('hero'))}</summary>${fields.map(key=>row(key,numeric(key,key==='lifePoints'?0.000001:0,key==='lifePoints'?100:10000))).join('')}${button('rollStats')}</details>${row('weapon',selectLabels('weapon',profile().weapons))}${['garlicOil','partyCard','cursed','bat'].map(checkbox).join('')}${row('groupMode',selectLabels('groupMode',['manual','sequential']))}<div id="${ID}-countControls">${row('countScore',numeric('countScore',1,12))}<div class="bsim-btn-row">${button('rollCount')}${button('applyCount')}</div></div><div id="${ID}-editor"></div>${button('start')}${row('target',choose('target',[]))}${row('manualTotal',numeric('manualTotal',1,12))}<p>${escape(tk('manualDiceNote'))}</p><div id="${ID}-combatControls">${row('enemyInitiative',numeric('enemyInitiative',1,6))}<div class="bsim-btn-row">${button('initiative')}${button('playerStrike')}${button('enemyStrike')}${button('nextRound')}</div><p>${escape(tk('roundNote'))}</p><details><summary>${escape(tk('powers'))}</summary>${row('power',choose('power',[]))}${row('payment',selectLabels('payment',['psi','life']))}${checkbox('wholePack')}${button('usePower')}${button('finishCalmed')}${row('item',choose('item',profile().items.map(key=>[key,tk('item.'+key)])))}${button('useItem')}<p>${escape(tk('itemNote'))}</p>${row('enemyPower',choose('enemyPower',[]))}${button('useEnemyPower')}</details><details><summary>${escape(tk('flight'))}</summary>${row('failedRule',selectLabels('failedRule',['detailed','synopsis']))}${button('flight')}</details><details><summary>${escape(tk('manualRuling'))}</summary><p>${escape(tk('manualRulingNote'))}</p>${row('rulingPlayerLife',numeric('rulingPlayerLife',-10000,100))}${row('rulingEnemyLife',numeric('rulingEnemyLife',-10000))}${row('rulingNote',`<input class="inv-edit-input" id="${ID}-rulingNote" autocomplete="off" maxlength="500">`)}${button('applyRuling')}</details></div><div id="${ID}-orderControls" hidden><p>${escape(tk('orderNote'))}</p><div class="bsim-btn-row">${button('damageFirst')}${button('effectsFirst')}</div></div><div id="${ID}-archeryControls" hidden><p id="${ID}-archeryStage"></p>${button('archeryCheck')}${row('archeryDecision',selectLabels('archeryDecision',['speed','enemy','player','win','loss','cancelled']))}${row('archeryNote',`<input class="inv-edit-input" id="${ID}-archeryNote" autocomplete="off" maxlength="500">`)}${button('resolveArchery')}</div><details><summary>${escape(tk('healing'))}</summary>${row('healingRule',selectLabels('healingRule',['detailed','synopsis']))}${button('heal')}</details>${button('cancel')}</div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${ID}-status"></div><p id="${ID}-totals"></p><p id="${ID}-firstResult"></p><div class="bsim-log" id="${ID}-log"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    const extras=profile().extras.map(field=>field.type==='checkbox'?checkbox(field.key):row(field.key,
      choose(field.key,field.values.map(value=>[value,tk(field.key+'.'+value)])))).join('');
    el('weapon').closest('label').insertAdjacentHTML('afterend',extras);
    for (const key of ['garlicOil','partyCard','cursed','bat']) el(key).closest('label').hidden=!profile().legacyOptions.includes(key);
    el('wholePack').closest('label').hidden=!profile().roles.includes('dracula');
    el('finishCalmed').hidden=!profile().roles.includes('dracula');
    el('useEnemyPower').hidden=!getEncounters().some(enemy=>enemy.rules.powers?.length);
    el('enemyPower').closest('label').hidden=el('useEnemyPower').hidden;
    el('countControls').insertAdjacentHTML('beforeend',`<div id="${ID}-companionControls">${checkbox('useCompanionReduction')}${row('reductionScore',numeric('reductionScore',1,6))}${button('rollReduction')}<p id="${ID}-remainingCount"></p></div>`);
    el('editor').insertAdjacentHTML('beforebegin',`<div id="${ID}-resurrectionControls">${row('resurrectionCount',numeric('resurrectionCount',1,6))}${button('rollResurrections')}</div>`);
    el('editor').insertAdjacentHTML('beforebegin',`<div id="${ID}-openingControls">${checkbox('openingDamageApplied')}</div>`);
    el('orderControls').insertAdjacentHTML('beforebegin',`<div id="${ID}-sourceControls"><p>${escape(tk('sourcePendingNote'))}</p>${button('resolveExplosion')}<div id="${ID}-rayControls">${row('attackMode',choose('attackMode',['electric','wrap','both'].map(key=>[key,tk('attackMode.'+key)])))}${row('wrapCounting',choose('wrapCounting',[['',tk('chooseCounting')],['current',tk('countCurrent')],['next',tk('countNext')]]))}${row('sourceNote',`<input class="inv-edit-input" id="${ID}-sourceNote" autocomplete="off" maxlength="500">`)}${button('resolveMode')}</div></div><div id="${ID}-machineControls"><p>${escape(tk('machineNote'))}</p><div class="bsim-btn-row">${button('machinePlayer')}${button('machineEnemy')}</div>${row('machinePayment',selectLabels('machinePayment',['psi','life']))}${button('machineArmour')}</div>`);
    el('nextRound').parentElement.insertAdjacentHTML('afterend',`<div class="bsim-btn-row">${button('singleShot')}${button('breakOff')}</div>`);
    el('heal').insertAdjacentHTML('afterend',button('treatPlague'));
    el('start').insertAdjacentHTML('beforebegin',`<details><summary>${escape(tk('allies'))}</summary>${checkbox('useAllies')}<p>${escape(tk('allyNote'))}</p><div id="${ID}-allyEditor"></div></details>`);
    el('nextRound').parentElement.insertAdjacentHTML('afterend',`${row('ally',choose('ally',[]))}${row('defender',choose('defender',[]))}<div class="bsim-btn-row">${button('allyStrike')}${button('allyCloud')}</div>`);
    el('rulingPlayerLife').closest('label').insertAdjacentHTML('afterend',row('rulingPlayerPsi',numeric('rulingPlayerPsi')));
    el('totals').insertAdjacentHTML('afterend',`<p class="bsim-report" id="${ID}-allyTotals"></p><p class="bsim-report" id="${ID}-enemyTotals"></p>`);
    el('firstResult').classList.add('bsim-report');
    el('allyCloud').hidden=!getAllies().some(ally=>ally.rules.mindCloud);
    const trigger=document.createElement('button');trigger.id=ID+'-btn';trigger.style.display='none';trigger.textContent=t('battlesim.title');
    getButtonRow().appendChild(trigger);trigger.addEventListener('click',open);
    el('close').addEventListener('click',close);
    let backdrop=false;
    overlay.addEventListener('mousedown',event=>{backdrop=event.target===overlay;});
    overlay.addEventListener('click',event=>{if (backdrop && event.target===overlay) close();});
    overlay.addEventListener('keydown',event=>{if (event.key==='Escape' && !event.defaultPrevented) {event.stopPropagation();close();}});
    for (const key of [...fields,'role','weapon','groupMode','garlicOil','partyCard','cursed','bat','useAllies']) el(key).addEventListener('change',saveSetup);
    for (const field of profile().extras) el(field.key).addEventListener('change',()=>{
      if (field.live && active(store.read()?.fight)) change(data=>{
        const value=extraValues()[field.key];data.setup[field.key]=value;data.fight.options[field.key]=value;
      });
      else saveSetup();
    });
    for (const key of ['resurrectionCount','useCompanionReduction','reductionScore','openingDamageApplied']) el(key).addEventListener('change',saveSetup);
    el('rollResurrections').addEventListener('click',()=>change(data=>{data.setup={...setup(),resurrectionCount:String(rollDice(1).total)};}));
    el('rollReduction').addEventListener('click',()=>{
      el('reductionScore').value=String(rollDice(1).total);setCount(false);
    });
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
      const options=setup(),item=preset();
      const expected=encounterCount(item,options);
      if (!expected) throw new RangeError(tk('noRemainingOpponents'));
      const enemies=editor.read().map(enemy=>({...enemy,name:enemy.displayName || enemy.name}));
      if (item?.count.dice && !options.countScore) throw new RangeError(tk('countRequired'));
      if (enemies.length!==expected) throw new RangeError(tk('countRequired'));
      data.setup=options;
      const allies=options.useAllies?allyEditor.read().map(ally=>({...ally,name:ally.displayName || ally.name})):[];
      const config={player:options.hero,allies,role:options.role,section:options.section,options:optionsForFight(options)};
      const next=item?.mode==='machine'?startMachine({...config,name:item.name,rules:item.rules}):item?.mode==='archery'?startArchery({...config,name:item.name}):startFight({...config,enemies,groupMode:options.groupMode});
      if (item?.rules.first) next.first=item.rules.first;
      updateFight(data,next);
      for (const field of profile().extras) if (field.oneFight) data.setup[field.key]=field.type==='checkbox'?false:0;
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
      enemyIndex:selected(),total:el('manualTotal').value,enemyIndices:el('wholePack').checked?f.enemies.map((_,i)=>i).filter(i=>f.enemies[i].rules.smallAnimal):undefined})));
    el('finishCalmed').addEventListener('click',()=>act(endCalmedFight));
    el('useItem').addEventListener('click',()=>act(f=>combatItem(f,{item:el('item').value,enemyIndex:selected()})));
    el('useEnemyPower').addEventListener('click',()=>act(f=>enemyPower(f,{...rollOptions(),power:el('enemyPower').value})));
    el('applyRuling').addEventListener('click',()=>act(f=>resolveManually(f,{enemyIndex:selected(),playerLife:el('rulingPlayerLife').value,playerPsi:el('rulingPlayerPsi').value,enemyLife:el('rulingEnemyLife').value,note:el('rulingNote').value})));
    el('flight').addEventListener('click',()=>act(f=>attemptFlight(f,{...rollOptions(),failedRule:el('failedRule').value})));
    el('archeryCheck').addEventListener('click',()=>act(f=>archeryCheck(f,{total:el('manualTotal').value})));
    el('resolveArchery').addEventListener('click',()=>act(f=>resolveArchery(f,{decision:el('archeryDecision').value,note:el('archeryNote').value})));
    el('resolveExplosion').addEventListener('click',()=>act(f=>resolveMadScience(f,{total:el('manualTotal').value})));
    el('resolveMode').addEventListener('click',()=>act(f=>resolveAttackMode(f,{mode:el('attackMode').value,
      countCurrentRound:el('wrapCounting').value==='current'?true:el('wrapCounting').value==='next'?false:undefined,note:el('sourceNote').value})));
    el('machinePlayer').addEventListener('click',()=>act(f=>machineStrike(f,{actor:'player',total:el('manualTotal').value})));
    el('machineEnemy').addEventListener('click',()=>act(f=>machineStrike(f,{actor:'enemy',total:el('manualTotal').value})));
    el('machineArmour').addEventListener('click',()=>act(f=>playerPower(f,{power:'body-armour',payment:el('machinePayment').value})));
    el('singleShot').addEventListener('click',()=>act(f=>enemyShot(f,rollOptions())));
    el('breakOff').addEventListener('click',()=>act(breakOff));
    el('treatPlague').addEventListener('click',()=>change(data=>{
      if (active(data.fight)) throw new RangeError(tk('active'));
      data.setup.hero={...data.setup.hero,status:{...data.setup.hero.status,poison:0}};
      showAlert(tk('treatmentNote'));
    }));
    el('heal').addEventListener('click',()=>change(data=>{
      if (active(data.fight)) throw new RangeError(tk('active'));
      const options=setup(),result=naturalHealing(options.hero,{role:options.role,score:el('manualTotal').value,rules:el('healingRule').value,bonus:options.luckBonus ?? 0});
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
