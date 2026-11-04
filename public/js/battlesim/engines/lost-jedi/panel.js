// Manage Lost Jedi setup and explicit turn controls using the shared simulator layout.
import {startFight,currentTurn,beginAttack,confirmAttack,beginTargetRoll,confirmTarget,spendTurn} from './core.js';
import {integer,previewStrike} from './math.js';
import {expandActors} from './rounds.js';
import {targetCategory} from './targeting.js';
import {controls,escape,setupFields,eventText} from './view.js';
import {createOpponentEditor} from '../../opponents.js';

export function createLostJediPanel({definition,document,t,store,getRun,getBookId,getEncounters,getRules,
  getButtonRow,showAlert,showConfirm,registerShortcut=()=>{}}) {
  const ID=definition.stateKey,el=key=>document.getElementById(ID+'-'+key),tk=(key,args)=>t(definition.i18nPrefix+'.'+key,args);
  let shownRun,editor;
  const busy=()=>Boolean(store.read()?.fight && !store.read().fight.outcome);
  const preset=()=>getEncounters().find(row=>row.section===el('section').value);
  function close(){el('overlay')?.classList.remove('active');shownRun=null;editor=null;}
  function change(update) {
    if (shownRun!==getRun() || Number(getBookId())!==definition.id || !el('overlay')?.classList.contains('active')) {close();return;}
    try {if (store.change(update)) render();} catch(error){showAlert(error.message || tk('invalid'));}
  }
  const snapshot=()=>({...Object.fromEntries(setupFields.map(key=>[key,el(key).type==='checkbox'?el(key).checked:el(key).value])),opponents:editor.snapshot()});
  function saveSetup(){if (!busy()) change(data=>{data.setup=snapshot();});}
  function variants(selected='') {
    const options=preset()?.rules.storyVariants ?? [];
    el('variant').innerHTML=`<option value="">${escape(tk('baseEncounter'))}</option>`+options.map(row=>`<option value="${escape(row.section)}">${escape(tk('fromSection',{section:row.section}))}</option>`).join('');
    el('variant').value=selected;el('variant').closest('label').hidden=!options.length;
  }
  function restore(setup) {
    for (const key of setupFields.filter(key=>key!=='variant')) {
      if (el(key).type==='checkbox') el(key).checked=Boolean(setup[key]);else el(key).value=setup[key] ?? '';
    }
    variants(setup.variant);
    editor=createOpponentEditor({document,id:ID,t,
      fields:['rangedSkill','closeSkill','target'].map(key=>({key,label:tk(key),min:key==='target'?1:0,max:99,step:1})),
      presets:getEncounters().flatMap(row=>row.actors.map(actor=>({...actor,closeSkill:actor.closeSkillOverride ?? actor.closeSkill}))) });
    editor.set(setup.opponents);editor.fixCount(setup.section!=='custom');
    editor.element.addEventListener('change',saveSetup);el('editor').replaceChildren(editor.element);
  }
  function updateFight(data,fight) {
    data.fight=fight;
    data.setup.jediPoints=fight.jediPoints;
    data.setup.weapon=fight.player.weapon;data.setup.ready=fight.player.ready;
    if (fight.player.ammo!=null) data.setup.ammo=fight.player.ammo;
  }
  const act=action=>change(data=>updateFight(data,action(data.fight)));
  const die=()=>el('die').value==='' ? undefined : integer(el('die').value,1,6,'Die');
  function forcedAction(fight) {
    const actor=currentTurn(fight)?.actor;
    if (!actor || actor.id==='havet') return null;
    if (actor.mountAfterRound && !actor.turns) return 'mount';
    if (actor.tag==='diamond' && fight.rules.diamondMovesCloseOnSecondTurnIfFirstMiss && actor.turns===1) return 'move';
    if (fight.round<=(fight.rules.enemySkipRounds ?? 0) || actor.skipFirstTurn && !actor.turns
        || actor.skipFirstRangedTurn && !actor.turns && fight.range==='range') return 'wait';
    return null;
  }
  function targetOptions(targets) {
    const old=el('target').value;
    el('target').innerHTML=targets.map(actor=>`<option value="${escape(actor.id)}">${escape(actor.name)}</option>`).join('');
    if (targets.some(actor=>actor.id===old)) el('target').value=old;
  }
  function preview() {
    const fight=store.read()?.fight,p=fight?.pending;
    if (!p) return;
    try {
      const adjustment=integer(el('adjustment').value,-999,999,'Die adjustment');
      if (p.kind==='strike') {
        const result=previewStrike(p,adjustment,fight.jediPoints);
        el('preview').textContent=tk('preview',{die:p.die,adjustment,total:result.total,target:result.target,
          result:tk(result.hit?'hit':'miss'),cost:result.cost,remaining:result.remainingPoints});
      } else {
        const number=integer(p.die+adjustment,1,6,'Target die');
        if (Math.abs(adjustment)>fight.jediPoints) throw new RangeError(tk('insufficientPoints'));
        const category=Object.keys(p.map).find(key=>p.map[key].includes(number));
        const targets=currentTurn(fight).targets,matching=targets.filter(actor=>targetCategory(actor)===category);
        targetOptions(matching.length?matching:targets);
        el('preview').textContent=tk('targetPreview',{die:p.die,adjustment,cost:Math.abs(adjustment)});
      }
      el('confirm').disabled=false;
    } catch(error){el('preview').textContent=error.message;el('confirm').disabled=true;}
  }
  function render() {
    if (!el('overlay')?.classList.contains('active')) return;
    if (shownRun!==getRun() || Number(getBookId())!==definition.id) {close();return;}
    const data=store.read();if (!data) return;
    if (!editor) restore(data.setup);
    const fight=data.fight,turn=currentTurn(fight),active=busy();
    for (const field of el('setup').querySelectorAll('input,select,button')) field.disabled=active;
    editor.lock(active);el('start').disabled=active;
    el('ammo').closest('label').hidden=el('weapon').value!=='redemptor';
    const rules=preset()?.rules;
    el('range').disabled=active || !!rules?.range;
    el('initiative').closest('label').hidden=!rules?.chooseInitiative;
    el('woundedFett').closest('label').hidden=!rules?.optionalWoundedProfile;
    el('encounterNote').textContent=rules?.notes ?? '';
    el('turnControls').hidden=!active;el('cancel').disabled=!active;
    el('pendingControls').hidden=!fight?.pending;
    el('playerActions').hidden=!active || !!fight.pending || turn?.actor.id!=='havet';
    el('advance').disabled=!active || !!fight.pending;
    el('die').disabled=!active || !!fight.pending;
    if (turn && !fight.pending) {
      targetOptions(turn.targets);
      if (fight.selectedTargetId) el('target').value=fight.selectedTargetId;
      el('advance').textContent=tk(forcedAction(fight)?'nextAction':turn.requiresTargetRoll?'rollTarget':'rollAttack');
      el('combatRange').value=fight.range==='range'?'close':'range';
      el('combatWeapon').value=fight.player.weapon;el('combatReady').checked=fight.player.ready;
    }
    el('target').disabled=!!fight?.pending && fight.pending.kind==='strike' || !!fight?.selectedTargetId;
    if (fight?.pending) preview();
    el('escape').hidden=!fight?.rules.escapeIndoors || !!fight?.escapeEndRound;
    el('draw').disabled=!!fight?.player.ready || fight?.player.weapon==='unarmed';
    el('move').disabled=!!fight?.rules.rangeLocked;
    el('status').textContent=fight ? fight.outcome ? tk(fight.outcome) : tk('round',{round:fight.round}) : tk('notStarted');
    el('totals').textContent=fight ? tk('points',{current:fight.jediPoints,max:fight.maxJediPoints}) : '';
    el('actor').textContent=active ? tk('turn',{name:turn.actor.name}) : fight?.outcome==='phase' ? tk('phaseNote') : '';
    el('opponents').innerHTML=fight ? fight.actors.map(actor=>`<p>${escape(actor.name)}: ${escape(tk(actor.defeated?'defeated':'standing'))}</p>`).join('') : '';
    el('log').innerHTML=fight ? fight.events.map(event=>`<div>${escape(eventText(event,fight,tk))}</div>`).join('') : '';
    el('history').innerHTML=data.history.slice().reverse().map(row=>`<div>${escape(row.enemy)}: ${escape(tk(row.outcome))}</div>`).join('');
    if (!active) for (const key of ['jediPoints','weapon','ready','ammo']) {
      if (el(key).type==='checkbox') el(key).checked=Boolean(data.setup[key]);else el(key).value=data.setup[key] ?? '';
    }
  }
  function open() {
    if (Number(getBookId())!==definition.id || !getRun()) {showAlert(t('battlesim.no_active_playthrough'));return;}
    if (!getRules()) {showAlert(tk('unavailable'));return;}
    shownRun=getRun();editor=null;store.change(()=>{});el('overlay').classList.add('active');render();el('close').focus();
  }
  function init() {
    if (el('overlay')) return;
    const overlay=document.createElement('div');overlay.id=ID+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML=controls(ID,tk,getEncounters());document.body.appendChild(overlay);
    const trigger=document.createElement('button');trigger.id=ID+'-btn';trigger.style.display='none';trigger.textContent=t('battlesim.title');
    getButtonRow().appendChild(trigger);trigger.addEventListener('click',open);el('close').addEventListener('click',close);
    let backdrop=false;overlay.addEventListener('mousedown',event=>{backdrop=event.target===overlay;});
    overlay.addEventListener('click',event=>{if (backdrop && event.target===overlay) close();});
    overlay.addEventListener('keydown',event=>{if (event.key==='Escape' && !event.defaultPrevented){event.stopPropagation();close();}});
    for (const key of setupFields.filter(key=>key!=='section')) el(key).addEventListener('change',saveSetup);
    el('section').addEventListener('change',()=>{
      if (busy()) return;
      const selected=preset();variants();
      if (selected?.rules.range) el('range').value=selected.rules.range;
      editor.set(selected?expandActors(selected.actors).map(actor=>({...actor,count:1})):[{}]);editor.fixCount(!!selected);saveSetup();
    });
    el('start').addEventListener('click',()=>change(data=>{
      if (busy()) return;
      data.setup=snapshot();
      const selected=preset(),actors=editor.read().map(({closeSkillOverride,...actor})=>({...actor,name:actor.displayName || actor.name || tk('enemy'),count:1}));
      const encounter=selected ? {...selected,actors} : {section:'custom',name:actors.map(actor=>actor.name).join(', '),actors,rules:{chooseRange:true}};
      updateFight(data,startFight({encounter,player:data.setup,range:data.setup.range,initiative:data.setup.initiative,
        woundedFett:data.setup.woundedFett,woundedProfile:getEncounters().find(row=>row.rules.modifierOnly)?.rules,
        variant:data.setup.variant,opponents:actors}));
    }));
    el('advance').addEventListener('click',()=>{
      act(f=>{const forced=forcedAction(f);return forced?spendTurn(f,forced,{},getEncounters()):currentTurn(f).requiresTargetRoll
        ?beginTargetRoll(f,die()):beginAttack(f,el('target').value,die());});el('adjustment').value='0';preview();
    });
    el('adjustment').value='0';el('adjustment').addEventListener('input',preview);
    el('confirm').addEventListener('click',()=>act(f=>f.pending.kind==='target'
      ?confirmTarget(f,el('adjustment').value,el('target').value):confirmAttack(f,el('adjustment').value,getEncounters())));
    for (const action of ['draw','move','wait','escape']) el(action).addEventListener('click',()=>act(f=>spendTurn(f,action,
      {range:el('combatRange').value,weapon:el('combatWeapon').value,ready:el('combatReady').checked,targetId:el('target').value},getEncounters())));
    el('cancel').addEventListener('click',()=>{
      const run=getRun(),before=store.read();showConfirm(tk('cancelConfirm'),()=>{
        if (getRun()===run && store.read()===before) act(f=>({...f,pending:null,outcome:'cancelled'}));
      });
    });
    registerShortcut({button:trigger,overlay,open,close});
  }
  return {init,render,open,close,setVisible(visible){if(el('btn'))el('btn').style.display=visible?'':'none';if(!visible)close();}};
}
