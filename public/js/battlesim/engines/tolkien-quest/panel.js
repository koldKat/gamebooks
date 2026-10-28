import {character,beginFight,step as performStep,applyLuck,acceptNumbers,luckAvailable,openingAction,resolveCalm,resolveOutcome,WEAPONS,ARMOUR,MISSILES,SPELLS} from './core.js';
import {createOpponentEditor} from '../../opponents.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createTolkienQuestPanel({document,definition,getRoster,t,getRun,getBookId,saveState,showAlert,showConfirm,getButtonRow,registerShortcut=()=>{}}){
  const id=definition.stateKey,tk=(key,params)=>t(definition.i18nPrefix+'.'+key,params),el=key=>document.getElementById(id+'-'+key);
  let shownRun,opponents;
  const data=()=>Number(getBookId())===definition.id?getRun()?.[id]:null;
  const busy=d=>d?.fight?.status==='active';
  const locked=d=>busy(d)||luckAvailable(d?.fight);
  const close=()=>el('overlay')?.classList.remove('active');
  const numeric=(key,min=-1000,max=1000000)=>{
    const raw=el(key).value.trim(),n=Number(raw);if(!raw||!Number.isSafeInteger(n)||n<min||n>max)throw new RangeError('Invalid number');return n;
  };
  function readHero(previous){
    const itemBonuses={};
    const sourceItems=[];
    for(const item of definition.itemModifiers??[])if(el('item-'+item.key).checked){
      sourceItems.push(item.key);
      if(!item.weapon||(!preset()?.rules.sourceWeapon&&item.weapon===el('weapon').value))for(const [key,value]of Object.entries(item.bonuses))itemBonuses[key]=(itemBonuses[key]??0)+value;
    }
    if((definition.itemModifiers??[]).filter(item=>item.weapon&&el('item-'+item.key).checked).length>1)throw new RangeError('Choose one source weapon');
    return character({...previous,...Object.fromEntries(['ob','db','missileOb','running','trickery','magic','endurance','damage'].map(k=>[k,numeric(k,['endurance','damage'].includes(k)?k==='endurance'?1:0:-1000)])),itemBonuses,sourceItems,nightPenalty:Boolean(el('nightPenalty')?.checked),weapon:el('weapon').value,armour:el('armour').value,missile:el('missile').value,shield:el('shield').checked,elvenChain:el('elvenChain').checked,orcSlayer:el('orcSlayer').checked,deviceCharges:numeric('deviceCharges',0,2),spells:Object.keys(SPELLS).filter(k=>el('known-'+k).checked)});
  }
  function snapshot(d){
    d.setup=Object.fromEntries([...el('setup').querySelectorAll('input,select')].filter(field=>field.id&&!field.closest('.bsim-opponent-editor')).map(field=>[field.id,field.type==='checkbox'?field.checked:field.value]));
    d.opponentSetup=opponents.snapshot();
  }
  function change(update){
    if(shownRun!==getRun()||!el('overlay')?.classList.contains('active')){close();return;}
    const run=getRun(),before=data();if(!run||Number(getBookId())!==definition.id)return;
    try{
      const d=structuredClone(before??{hero:null,setup:{},fight:null,history:[],log:[]}),previousFight=d.fight;update(d);
      if(run!==getRun()||Number(getBookId())!==definition.id||data()!==before)return;
      if(d.fight&&d.fight!==previousFight){
        d.fight=resolveOutcome(d.fight,dice());
        for(const enemy of d.fight.enemies)if(enemy.carryKey){
          d.carriedOpponents??={};d.carriedOpponents[enemy.carryKey]=structuredClone(enemy);
        }
        d.hero=structuredClone(d.fight.hero);d.log.push(...d.fight.events);d.fight.events=[];
        if(!busy(d)&&!luckAvailable(d.fight)&&!d.fight.recorded){
          d.fight.recorded=true;d.history.push({enemy:d.encounter,outcome:d.fight.status,ts:Math.max(Date.now(),(d.history.at(-1)?.ts??0)+1)});
        }
        for(const key of ['damage','deviceCharges','weapon','missile']){d.setup[id+'-'+key]=String(d.hero[key]);el(key).value=d.hero[key];}
      }
      d.log=d.log.slice(-100);run[id]=d;saveState();render();
    }catch{showAlert(tk('invalid'));}
  }
  function dice(){
    if(!(busy(data())?data().manualDice:el('manualDice').checked))return undefined;
    return role=>numeric(({player:'playerPick',enemy:'enemyPick',support:'supportPick',endurance:'endurancePick',spell:'spellPick',damage1:'damagePick1',damage2:'damagePick2'})[role]??'checkPick',2,12);
  }
  function preset(){return getRoster().find(e=>String(e.section)===el('context').value);}
  function start(d,options={}){
    if(locked(d))return;snapshot(d);d.hero=readHero(d.hero);d.manualDice=el('manualDice').checked;
    const entry=preset();d.encounter=entry?.label??opponents.read().map(e=>e.displayName||tk('opponent')).join(' / ');
    const enemies=opponents.read().map(enemy=>{
      const carried=enemy.carryKey&&d.carriedOpponents?.[enemy.carryKey];
      if(carried?.condition)throw new RangeError('This source opponent was already defeated');
      return carried&&!carried.condition?{...enemy,endurance:carried.endurance,damage:carried.damage,enduranceFormula:undefined}:enemy;
    });
    d.fight=beginFight(d.hero,enemies,{mode:el('mode').value,equipmentModifiers:el('equipmentModifiers').checked,formula:el('formula').checked,unmodifiedTwo:el('unmodifiedTwo').checked,surprised:el('surprised').checked,enemyUnaware:el('enemyUnaware').checked,useAlly:el('useAlly').checked,useSupport:el('useSupport').checked,sourceAction:el('sourceAction').value||undefined,rules:entry?.rules,...options},dice());
    if(d.opening?.firstAttackObBonus)d.fight.effects.sneakAttack=d.opening.firstAttackObBonus;
    if(d.opening?.surprised){d.fight.surprised=true;d.fight.stage='melee';}
    delete d.opening;d.log.push({type:'start',name:d.encounter});
  }
  function chooseContext(){
    if(locked(data()))return;const entry=preset();opponents.fixCount(Boolean(entry));
    if(entry?.repeatFirstEnemy)el('sourceCount').value=entry.repeatFirstEnemy.default;
    if(entry?.remainingAfterSleepingTrial&&data()?.fight?.rules.singleStrikeTrial&&data().fight.status==='avoided')el('sourceCount').value=9-data().fight.index;
    el('includeGuard').checked=false;
    el('sourceAction').innerHTML='<option value="">'+escape(tk('sourceAction.none'))+'</option>'+(entry?.rules.sourceActions??[]).map(action=>'<option value="'+escape(action.key)+'">'+escape(action.label)+'</option>').join('');
    populateOpponents();
    change(d=>snapshot(d));
  }
  function populateOpponents(){
    const entry=preset();
    if(!entry){opponents.set(data()?.opponentSetup??[{ob:0,db:0,endurance:20,armour:'none',kind:'normal'}]);return;}
    let rows=structuredClone(entry.enemies);
    if(entry.repeatFirstEnemy){
      const r=entry.repeatFirstEnemy,count=numeric('sourceCount',r.min,r.max);
      rows=Array.from({length:count},(_,i)=>({...structuredClone(entry.enemies[0]),key:entry.enemies[0].key+'-'+i,displayName:entry.enemies[0].displayName+' #'+(i+1)}));
    }
    if(entry.optionalTailEnemy&&el('includeGuard').checked)rows.push(structuredClone(entry.optionalTailEnemy));
    opponents.set(rows);
  }
  function step(d){
    if(!busy(d)||d.fight.manualEffect)return;
    const f=d.fight;
    const action=f.stage==='missile'?el('rangedAction').value:f.stage==='approach'?el('keepRange').checked:el('meleeAction').value;
    d.fight=performStep(f,action,dice(),{speed:el('speed').checked});
  }
  function open(){
    if(Number(getBookId())!==definition.id||!getRun()){showAlert(t('battlesim.no_active_playthrough'));return;}
    render();el('overlay').classList.add('active');
  }
  function eventText(e){
    if(e.type==='attack')return tk('attackLog',{who:e.supportName??tk(e.who),raw:e.raw??'-',damage:e.damage,result:e.result});
    if(e.type==='spell')return tk('spellLog',{spell:tk('spell.'+e.spell),raw:e.raw,result:tk(e.success?'success':'failed')});
    if(['escape','runPast','opening'].includes(e.type))return tk('checkLog',{raw:e.raw,total:e.total,result:tk(e.success?'success':'failed')});
    if(e.type==='calm')return tk('calmLog',{raw:e.raw,result:tk(e.success?'success':'failed')});
    return tk(e.type+'Log',e);
  }
  function render(){
    if(!el('overlay'))return;const run=getRun();
    if(!run||Number(getBookId())!==definition.id){shownRun=undefined;close();return;}
    const d=data(),f=d?.fight,active=busy(d),pendingLuck=luckAvailable(f),setupLocked=locked(d);
    if(shownRun!==run){
      shownRun=run;
      // Restore the context before restoring its dynamically supplied actions.
      el('context').value=d?.setup?.[id+'-context']??'manual';
      el('sourceAction').innerHTML='<option value="">'+escape(tk('sourceAction.none'))+'</option>'+(preset()?.rules.sourceActions??[]).map(action=>'<option value="'+escape(action.key)+'">'+escape(action.label)+'</option>').join('');
      for(const field of el('setup').querySelectorAll('input,select')){
        if(!field.id||field.closest('.bsim-opponent-editor'))continue;
        if(field.type==='checkbox')field.checked=d?.setup?.[field.id]??field.defaultChecked;
        else field.value=d?.setup?.[field.id]??(field.tagName==='SELECT'?field.options[0].value:field.defaultValue);
      }
      opponents.set(d?.opponentSetup??[{ob:0,db:0,endurance:20,armour:'none',kind:'normal'}]);
    }
    for(const control of el('setup').querySelectorAll('input,select,button'))control.disabled=setupLocked;
    opponents.lock(setupLocked);opponents.fixCount(Boolean(preset()));
    el('advanced').hidden=(active?f.mode:el('mode').value)!=='advanced'&&!(active?f.equipmentModifiers:el('equipmentModifiers').checked);
    el('spellSetup').hidden=(active?f.mode:el('mode').value)!=='advanced';
    el('dice').hidden=!(active?d.manualDice:el('manualDice').checked);
    el('start').disabled=setupLocked;el('saveHero').disabled=setupLocked;el('opening').disabled=setupLocked;
    el('step').disabled=!active||Boolean(f?.manualEffect);el('cancel').disabled=!active;
    el('ranged').hidden=!active||f.stage!=='missile';el('approach').hidden=!active||f.stage!=='approach';el('melee').hidden=!active||f.stage!=='melee';
    el('calm').hidden=!f?.manualEffect;
    el('luck').hidden=!pendingLuck;
    const selected=el('luckPick').value;el('luckPick').innerHTML=(pendingLuck?f.lastAction.rolls:[]).map((r,i)=>'<option value="'+i+'">'+escape(tk(r.role)+': '+r.raw)+'</option>').join('');
    if([...el('luckPick').options].some(o=>o.value===selected))el('luckPick').value=selected;
    el('useAlly').disabled=setupLocked||!d?.hero?.charmedAnimal;
    const rules=active?f.rules:preset()?.rules??{};
    el('useSupport').closest('label').hidden=!(rules.supportAttack||rules.supportAttacks?.length);
    el('supportPick').closest('label').hidden=!(rules.supportAttack||rules.supportAttacks?.length);
    el('sourceCount').closest('label').hidden=!preset()?.repeatFirstEnemy;
    el('includeGuard').closest('label').hidden=!preset()?.optionalTailEnemy;
    el('sourceAction').closest('label').hidden=!rules.sourceActions?.length;
    el('endurancePick').closest('label').hidden=!(active?f.enemies:preset()?.enemies??[]).some(enemy=>enemy.enduranceFormula)||active;
    el('useAlly').disabled=el('useAlly').disabled||Boolean(rules.singleStrikeTrial);
    el('keepRange').disabled=Boolean(rules.cannotEscape);
    if(rules.cannotEscape)el('keepRange').checked=false;
    for(const option of el('meleeAction').options)option.disabled=Boolean(rules.cannotEscape&&option.value!=='attack');
    if(el('meleeAction').selectedOptions[0]?.disabled)el('meleeAction').value='attack';
    for(const option of el('openingAction').options){
      option.hidden=option.value==='immediateEscape'&&!rules.immediateEscape;
      option.disabled=Boolean(rules.cannotEscape||(option.value==='immediateEscape'&&!rules.immediateEscape)||(option.value==='steal'&&rules.prohibitedActions?.includes('steal-and-take')));
      const exit=({leave:'leaveBeforeFight',surrender:'preFightSurrender'})[option.value];
      if(exit)option.hidden=option.disabled=!rules[exit];
    }
    if(el('openingAction').selectedOptions[0]?.hidden||el('openingAction').selectedOptions[0]?.disabled){
      const available=[...el('openingAction').options].find(option=>!option.hidden&&!option.disabled);
      if(available)el('openingAction').value=available.value;
    }
    el('opening').disabled=setupLocked||Boolean(rules.cannotEscape);
    el('speed').disabled=!active||f.mode!=='advanced'||!f.hero.spells.includes('speed')||Boolean(f.allyActive);
    if(active)for(const option of el('rangedAction').options){
      option.disabled=option.value==='shoot'?(f.hero.missile==='none'||!f.missileAvailable):option.value==='skip'?false:!f.hero.spells.includes(option.value)||(['shield','strength'].includes(option.value)&&f.round!==0);
      const target=f.enemies[f.index];
      if(option.value==='calm'&&(['undead','monster'].includes(target.kind)||(target.combinedCount??1)>1))option.disabled=true;
      if(option.value==='charm'&&(target.kind!=='animal'||(target.combinedCount??1)>1))option.disabled=true;
    }
    if(el('rangedAction').selectedOptions[0]?.disabled)el('rangedAction').value='skip';
    const enemy=f?.enemies[f.index];
    el('status').textContent=f?tk('status.'+f.status)+(active?' | '+tk('fightState',{round:f.round+1,damage:f.hero.damage,endurance:f.hero.endurance,name:enemy?.name,enemyDamage:enemy?.damage,enemyEndurance:enemy?.endurance}):' | '+tk('heroState',{damage:f.hero.damage,endurance:f.hero.endurance})):tk('ready');
    el('destination').textContent=f?.destination?tk('nextPassage',{section:f.destination}):f?.status==='escaped'?f.rules.escapeInstruction??'':'';
    if(f?.allyActive)el('status').textContent+=' | '+tk('allyState',f.ally);
    el('history').innerHTML=(d?.history??[]).slice(-30).reverse().map(e=>'<div>'+escape(e.enemy)+' | '+escape(tk('status.'+e.outcome))+'</div>').join('');
    el('log').innerHTML=(d?.log??[]).slice().reverse().map(e=>'<div>'+escape(eventText(e))+'</div>').join('');
    el('animal').textContent=d?.hero?.charmedAnimal?tk('animalState',d.hero.charmedAnimal):'';
  }
  const input=(key,value=0,min=-1000,max=1000000)=>`<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" type="number" min="${min}" max="${max}" step="1" value="${value}" id="${id}-${key}"></label>`;
  const check=key=>`<label class="bsim-checkbox"><input type="checkbox" id="${id}-${key}">${escape(tk(key))}</label>`;
  const button=key=>`<button type="button" class="bsim-action-btn" id="${id}-${key}">${escape(tk(key))}</button>`;
  const select=(key,values)=>`<label class="inv-edit-row"><span>${escape(tk(key))}</span><select class="inv-edit-input" id="${id}-${key}">${values.map(value=>`<option value="${escape(value)}">${escape(tk(key+'.'+value))}</option>`).join('')}</select></label>`;
  function init(){
    if(el('overlay'))return;
    const overlay=document.createElement('div');overlay.id=id+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${id}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><div id="${id}-setup"><p>${escape(tk('note'))}</p>${select('mode',['basic','advanced'])}${check('equipmentModifiers')}<details open><summary>${escape(tk('hero'))}</summary>${['ob','db','missileOb','running','trickery','magic'].map(k=>input(k)).join('')}${input('endurance',30,1)}${input('damage',0,0)}</details>${check('surprised')}${check('enemyUnaware')}${check('useAlly')}<div id="${id}-advanced"><details><summary>${escape(tk('modifiers'))}</summary><p>${escape(tk('modifierNote'))}</p>${select('weapon',Object.keys(WEAPONS))}${select('armour',Object.keys(ARMOUR))}${select('missile',Object.keys(MISSILES))}${check('shield')}${check('elvenChain')}${check('orcSlayer')}</details><details id="${id}-spellSetup"><summary>${escape(tk('learnedSpells'))}</summary>${Object.keys(SPELLS).map(k=>check('known-'+k)).join('')}${input('deviceCharges',0,0,2)}<p>${escape(tk('otherSpells'))}</p></details></div>${check('formula')}${check('unmodifiedTwo')}<label class="inv-edit-row"><span>${escape(tk('context'))}</span><select class="inv-edit-input" id="${id}-context"><option value="manual">${escape(tk('custom'))}</option>${getRoster().map(e=>`<option value="${escape(e.section)}">${escape(e.label)}</option>`).join('')}</select></label><div id="${id}-opponents"></div>${check('manualDice')}${select('openingAction',['escape','sneakAway','sneakAttack','steal'])}<p>${escape(tk('openingNote'))}</p></div><div class="bsim-btn-row">${button('saveHero')}${button('opening')}${button('start')}${button('cancel')}</div><details id="${id}-dice"><summary>${escape(tk('numbers'))}</summary>${['playerPick','enemyPick','checkPick','spellPick','damagePick1','damagePick2'].map(k=>input(k,7,2,12)).join('')}</details><div id="${id}-ranged">${select('rangedAction',['shoot','skip','firebolt','shield','strength','calm','charm'])}</div><div id="${id}-approach">${check('keepRange')}</div><div id="${id}-melee">${select('meleeAction',['attack','escape','runPast'])}</div>${check('speed')}${button('step')}<div id="${id}-luck"><label class="inv-edit-row"><span>${escape(tk('luckPick'))}</span><select class="inv-edit-input" id="${id}-luckPick"></select></label><div class="bsim-btn-row">${button('luckCast')}${button('keepNumbers')}</div></div><div id="${id}-calm"><p>${escape(tk('calmNote'))}</p><div class="bsim-btn-row">${button('calmWithdraw')}${button('calmContinue')}</div></div><p id="${id}-animal"></p></div><div class="bsim-col bsim-col-right"><div class="bsim-status" id="${id}-status"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${id}-history"></div></details><div class="bsim-log" id="${id}-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    el('setup').insertAdjacentHTML('beforeend',check('useSupport')+(definition.itemModifiers??[]).map(item=>check('item-'+item.key)).join(''));
    if(definition.nightControls)el('setup').insertAdjacentHTML('beforeend',check('nightPenalty'));
    el('setup').insertAdjacentHTML('beforeend',input('sourceCount',1,1,100)+check('includeGuard')+select('sourceAction',['none']));
    el('sourceAction').options[0].value='';
    el('dice').insertAdjacentHTML('beforeend',input('supportPick',7,2,12)+input('endurancePick',7,2,12));
    el('status').insertAdjacentHTML('afterend','<p id="'+id+'-destination"></p>');
    el('openingAction').insertAdjacentHTML('beforeend','<option value="immediateEscape">'+escape(tk('openingAction.immediateEscape'))+'</option>');
    for(const action of ['leave','surrender'])el('openingAction').insertAdjacentHTML('beforeend','<option value="'+action+'">'+escape(tk('openingAction.'+action))+'</option>');
    const presets=[...new Map(getRoster().flatMap(e=>e.enemies).map(e=>[e.key,e])).values()];
    opponents=createOpponentEditor({document,id,t,fields:[{key:'ob',label:tk('enemyOb'),min:-1000},{key:'db',label:tk('enemyDb'),min:-1000},{key:'endurance',label:tk('enemyEndurance'),min:1},{key:'armour',label:tk('enemyArmour'),options:Object.keys(ARMOUR).map(value=>({value,label:tk('armour.'+value)}))},{key:'kind',label:tk('enemyKind'),options:['normal','animal','orc','undead','monster'].map(value=>({value,label:tk('kind.'+value)}))}],presets});el('opponents').appendChild(opponents.element);
    const launch=document.createElement('button');launch.id=id+'-btn';launch.textContent=t('battlesim.title');launch.style.display='none';getButtonRow().appendChild(launch);launch.addEventListener('click',open);
    el('close').addEventListener('click',close);let backdrop=false;
    overlay.addEventListener('mousedown',e=>{backdrop=e.target===overlay;});overlay.addEventListener('click',e=>{if(backdrop&&e.target===overlay)close();});overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}});
    registerShortcut({button:launch,overlay,open,close});
    el('setup').addEventListener('change',e=>{if(!locked(data())&&e.target!==el('context'))change(d=>{if([el('sourceCount'),el('includeGuard')].includes(e.target))populateOpponents();snapshot(d);});});
    el('context').addEventListener('change',chooseContext);
    el('saveHero').addEventListener('click',()=>change(d=>{if(locked(d))return;d.hero=readHero(d.hero);d.fight=null;snapshot(d);d.log.push({type:'saved'});}));
    el('start').addEventListener('click',()=>change(start));el('step').addEventListener('click',()=>change(step));
    el('opening').addEventListener('click',()=>change(d=>{if(locked(d))return;const action=el('openingAction').value;if(action==='immediateEscape'){start(d,{immediateEscape:true});return;}const exit=({leave:'leaveBeforeFight',surrender:'preFightSurrender'})[action];if(exit){start(d,{sourceExit:exit});return;}d.hero=readHero(d.hero);snapshot(d);const rules=preset()?.rules??{};d.opening=openingAction(d.hero,action,{mode:el('mode').value,equipmentModifiers:el('equipmentModifiers').checked,unmodifiedTwo:el('unmodifiedTwo').checked,rules,enemyUnaware:rules.foeAware===true?false:el('enemyUnaware').checked||Boolean(rules.enemyUnaware)},dice());d.log.push({type:'opening',...d.opening});}));
    el('cancel').addEventListener('click',()=>{const run=getRun(),fight=data()?.fight;if(!busy(data()))return;showConfirm(tk('cancelConfirm'),()=>{if(run===getRun()&&Number(getBookId())===definition.id&&data()?.fight===fight)change(d=>{d.fight={...d.fight,status:'cancelled',lastAction:{used:true,rolls:[]}};});});});
    el('luckCast').addEventListener('click',()=>change(d=>{d.fight=applyLuck(d.fight,numeric('luckPick',0,20),dice());}));el('keepNumbers').addEventListener('click',()=>change(d=>{d.fight=acceptNumbers(d.fight);}));
    el('calmWithdraw').addEventListener('click',()=>change(d=>{d.fight=resolveCalm(d.fight,true);}));el('calmContinue').addEventListener('click',()=>change(d=>{d.fight=resolveCalm(d.fight,false,dice());}));render();
  }
  return {init,render,setVisible(value){if(!value)close();if(el('btn'))el('btn').style.display=value?'':'none';}};
}
