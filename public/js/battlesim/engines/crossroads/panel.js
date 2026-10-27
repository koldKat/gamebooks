import {startCrossroadsFight, crossroadsRound, crossroadsAbilityCheck,encounterTargets} from './core.js';
import {createOpponentEditor} from '../../opponents.js';
import {healingSpell,consumeHealing} from './resources.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const abilities = ['strength','intelligence','wisdom','constitution','dexterity','charisma'];
const active = fight => fight?.status === 'active';

export function createCrossroadsPanel({document,definition,state,getRoster,t,getRun,getBookId,saveState,
  getButtonRow,showAlert,showConfirm,registerShortcut = () => {}}) {
  const ID=definition.stateKey, tk=(key,params)=>t(definition.i18nPrefix+'.'+key,params), el=key=>document.getElementById(ID+'-'+key);
  const characterFields=[...abilities,'hp','maxHp','attackBonus','defenceBonus',...(definition.extraCharacterFields??[])];
  let editor,shownRun,rendered,editorRun;
  const button=key=>`<button type="button" class="bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const field=(key,min=0,max=1000000)=>`<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="${max}" step="1"></label>`;
  const number=(key,min=0,max=1000000)=>{
    const raw=el(key).value.trim(), n=Number(raw);
    if (!raw || !Number.isSafeInteger(n) || n<min || n>max) throw new RangeError('Invalid number');
    return n;
  };
  const preset=()=>getRoster().find(entry=>entry.section===el('encounter').value);
  function close(){el('overlay')?.classList.remove('active');rendered=null;}
  function change(update){
    if (shownRun!==getRun() || Number(getBookId())!==definition.id || !el('overlay')?.classList.contains('active')) {close();return;}
    try {if(state.change(update))render(true);} catch {showAlert(tk('invalid'));}
  }
  function confirm(key,update){
    const run=getRun(),before=state.read();
    showConfirm(tk(key),()=>{if(getRun()===run && state.read()===before)change(update);});
  }
  function readCharacter(){
    const result=Object.fromEntries(characterFields.map(key=>[key,number(key,key.endsWith('Bonus')?-100:0,definition.characterLimits?.[key]??(key==='damageReduction'?1:abilities.includes(key)||key.endsWith('Bonus')?100:1000000))]));
    if (!result.maxHp || result.hp>result.maxHp)throw new RangeError('Invalid hit points');
    return result;
  }
  function setup(){return {section:el('encounter').value,opponents:editor.snapshot(),weaponDice:el('weaponDice').value,weaponAdd:el('weaponAdd').value,weaponChoice:el('weaponChoice').value,...(preset()?.rules.mechanics?.struggle?{retrievedWeaponDice:el('retrievedWeaponDice').value,retrievedWeaponAdd:el('retrievedWeaponAdd').value}:{}),...(definition.getCustomRules?{useGauntlet:el('useGauntlet').checked}:{}),...(preset()?.repeatFirstEnemy?{enemyCount:el('enemyCount').value}:{})};}
  function saveSetup(){
    if (shownRun!==getRun() || active(state.read()?.fight))return;
    state.change(data=>{data.setup=setup();});
    rendered=state.read();
  }
  function setupNotes(){
    const entry=preset(), weapons=entry?.weapons??[],selection=el('weaponChoice').value;
    el('start').disabled=active(state.read()?.fight)||(!state.read()?.character?.hp&&!entry?.rules.restoreHeroHp);
    el('enemyCountRow').hidden=!entry?.repeatFirstEnemy;
    el('enemyCount').disabled=active(state.read()?.fight);
    el('weaponChoiceRow').hidden=!weapons.length;
    el('weaponChoice').innerHTML=weapons.map((weapon,index)=>`<option value="${index}">${escape(weapon.label)}</option>`).join('');
    el('weaponChoice').value=weapons[selection]?selection:'0';
    el('weaponChoice').disabled=active(state.read()?.fight);
    const damage=weapons[Number(el('weaponChoice').value)]?.damage??entry?.rules.heroDamage;
    el('sourceNotes').textContent=(entry?.rules.sourceNotes ?? []).join(' ');
    el('weaponNote').textContent=entry?.rules.mechanics?.hitCounters?tk('counterRule'):entry?.rules.enemyOnly?tk('noHeroAttack'):damage?tk('printedDamage'):tk('chooseDamage');
    for(const key of ['weaponDice','weaponAdd'])el(key).closest('label').hidden=Boolean(entry?.rules.mechanics?.hitCounters);
    el('retrievedWeaponRow').hidden=!entry?.rules.mechanics?.struggle;
    for(const key of ['retrievedWeaponDice','retrievedWeaponAdd'])el(key).disabled=active(state.read()?.fight);
    for(const key of ['weaponDice','weaponAdd'])el(key).disabled=active(state.read()?.fight)||Boolean(damage)||Boolean(entry?.rules.enemyOnly);
    if(damage){el('weaponDice').value=damage.dice;el('weaponAdd').value=damage.add;}
  }
  function logEvents(data,fight){
    data.fight=fight;
    for(const event of fight.events){
      if(event.kind==='attack')data.log.push(tk('attack',{name:event.side==='hero'?tk('hero'):event.name,
        dice:event.automatic?tk('automatic'):event.dice.join('+'),total:event.total,result:tk(event.hit?'hit':'miss'),damage:event.damage}));
      if(event.kind==='check')data.log.push(tk('check',{name:tk(event.ability),dice:event.dice.join('+'),result:tk(event.passed?'passed':'failed')}));
      if(event.kind==='freeRounds')data.log.push(tk('freeRounds',{n:event.amount}));
      if(event.kind==='absorbed')data.log.push(tk('absorbed',{name:event.name}));
      if(event.kind==='reinforcement')data.log.push(tk('reinforcement',{name:event.name}));
      if(event.kind==='engulfed')data.log.push(tk('engulfed'));
      if(event.kind==='blinded')data.log.push(tk('blinded'));
      if(event.kind==='fled')data.log.push(tk('fled',{name:event.name}));
      if(event.kind==='shape')data.log.push(tk('shape',{name:event.name}));
      if(event.kind==='phaseChanged')data.log.push(tk('phaseChanged',{name:event.name}));
      if(event.kind==='holdAttempt')data.log.push(tk('holdAttempt',{dice:event.dice.join('+'),total:event.total,damage:event.amount,result:tk(event.passed?'holdBroken':'holdRemains')}));
      if(event.kind==='enemyDrawsWeapon')data.log.push(tk('enemyDrawsWeapon',{name:event.name}));
      if(event.kind==='enemyRetreat')data.log.push(tk('enemyRetreat',{name:event.name}));
      if(event.kind==='enemiesSurrender')data.log.push(tk('enemiesSurrender'));
      if(event.kind==='disarmed')data.log.push(tk('disarmed',{name:event.name}));
      if(event.kind==='openingDamage')data.log.push(tk('openingDamage',{n:event.amount}));
      if(['weaponRetrieved','gripFreed','gripped','netFreed'].includes(event.kind))data.log.push(tk(event.kind));
      if(event.kind==='netThrown')data.log.push(tk('netThrown',{dice:event.dice.join('+'),total:event.total,result:tk(event.hit?'hit':'miss')}));
      if(event.kind==='vesselAttack')data.log.push(tk('vesselAttack',{name:event.name,dice:event.dice.join('+'),total:event.total,result:tk(event.hit?'hit':'miss'),n:event.hits,max:event.max}));
      if(event.kind==='poison')data.log.push(tk('poison',{dice:event.dice.join('+'),result:tk(event.passed?'passed':'failed'),damage:event.damage}));
      if(event.kind==='healing')data.log.push(tk('restored',{n:event.amount}));
      if(event.kind==='counterAttack')data.log.push(tk('counterAttack',{name:event.name,dice:event.dice.join('+'),total:event.total,result:tk(event.hit?'hit':'miss'),n:event.hits,max:event.max}));
      if(event.kind==='agingAttack')data.log.push(tk('agingAttack',{name:event.name,dice:event.dice.join('+'),total:event.total,result:tk(event.hit?'hit':'miss'),n:event.hits,max:event.max,age:event.age}));
      if(event.kind==='vanished')data.log.push(tk('vanished',{name:event.name,total:event.total}));
      if(event.kind==='misdirection')data.log.push(tk('misdirected',{name:event.name}));
      if(event.kind==='repulsion')data.log.push(tk('repulsionUsed'));
      if(event.kind==='outcome')data.log.push(tk('status.'+event.status)+(event.destination?' '+tk('destination',{n:event.destination}):''));
    }
  }
  function render(force=false){
    if(!el('overlay')?.classList.contains('active'))return;
    if(shownRun!==getRun() || Number(getBookId())!==definition.id){close();return;}
    const data=state.read();if(!data || !force && data===rendered)return;rendered=data;
    const fight=data.fight,locked=active(fight),hero=data.character;
    if(editorRun!==shownRun){
      editorRun=shownRun;el('encounter').value=data.setup.section ?? 'custom';
      const entry=preset();editor.set(data.setup.opponents ?? (entry?editorRows(entry.enemies):[{}]));
      el('weaponDice').value=data.setup.weaponDice ?? '';el('weaponAdd').value=data.setup.weaponAdd ?? 0;
      el('retrievedWeaponDice').value=data.setup.retrievedWeaponDice??'';el('retrievedWeaponAdd').value=data.setup.retrievedWeaponAdd??0;
      el('weaponChoice').innerHTML=(entry?.weapons??[]).map((weapon,index)=>`<option value="${index}">${escape(weapon.label)}</option>`).join('');
      el('weaponChoice').value=data.setup.weaponChoice??'0';
      el('enemyCount').value=data.setup.enemyCount??'';
      el('useGauntlet').checked=Boolean(data.setup.useGauntlet);
    }
    for(const key of characterFields){el(key).value=key==='hp'&&locked?fight.hero.hp:hero?.[key]??'';el(key).disabled=locked;}
    editor.lock(locked||Boolean(preset()?.rules.mechanics?.abilityOutcome));editor.fixCount(Boolean(preset()));el('encounter').disabled=locked;
    el('start').disabled=locked||!hero?.hp;el('saveCharacter').disabled=locked;el('newCharacter').disabled=locked;
    const retreatPending=Boolean(locked&&fight?.encounter?.retreatPending),retreatCaught=Boolean(locked&&fight?.encounter?.retreatCaught);
    el('round').disabled=!locked||retreatPending||retreatCaught;el('cancel').disabled=!locked;
    const mechanics=fight?.rules.mechanics;
    const resources=(locked?mechanics:preset()?.rules.mechanics??definition.getCustomRules?.()?.mechanics)?.resources;
    const resourceHero=locked?fight.hero:hero;
    for(const key of ['healingSpell','misdirection','repulsion']){
      const config=resources?.[key==='healingSpell'?'healing':key];
      el(key).hidden=!config;
      el(key).disabled=!resourceHero?.hp||!resourceHero?.[config?.field]||(key!=='repulsion'&&resources?.spellsDisabled)||(key!=='healingSpell'&&!locked)||(key==='repulsion'&&fight?.encounter?.repulsionActive)||(locked&&(fight.rules.enemyOnly||fight.encounter?.netTurns||mechanics?.openingEnemyTurn&&fight.round===0));
    }
    el('useGauntletRow').hidden=!resources?.gauntlet;
    el('useGauntlet').disabled=!resourceHero?.[resources?.gauntlet?.field];
    if(el('useGauntlet').disabled)el('useGauntlet').checked=false;
    const gripped=fight?.encounter?.gripped??Boolean(mechanics?.grip?.initiallyHeld);
    for(const key of ['retrieve','escapeGrip','flee','surrender']){
      const allowed=key==='retrieve'?mechanics?.retrieval:key==='escapeGrip'?mechanics?.grip:key==='surrender'?mechanics?.surrender:mechanics?.flee;
      el(key).hidden=!allowed;
      el(key).disabled=!locked||key==='retrieve'&&Boolean(fight?.encounter?.weaponRetrieved)||key==='escapeGrip'&&!gripped||key==='flee'&&gripped;
    }
    el('partingShot').hidden=!(fight?.status==='win'&&mechanics?.partingShot&&fight.round>=fight.rules.roundLimit&&!fight.encounter?.partingShotUsed&&fight.enemies.some(enemy=>enemy.hp>0));
    el('escapeCheck').hidden=!mechanics?.escapeCheck;
    el('escapeCheck').disabled=!locked||fight.round<1||fight.encounter?.escapeCheckedRound===fight.round;
    el('sourceExit').hidden=!mechanics?.sourceExit;el('sourceExit').disabled=!locked;
    const exits=mechanics?.sourceExit?.options??[],selectedExit=el('sourceExitChoice').value;
    el('sourceExitRow').hidden=!exits.length;
    el('sourceExitChoice').innerHTML=exits.map((exit,index)=>`<option value="${index}">${escape(exit.label)}</option>`).join('');
    el('sourceExitChoice').value=exits[Number(selectedExit)]?selectedExit:'0';el('sourceExitChoice').disabled=!locked;
    const struggleStage=locked&&mechanics?.struggle?(fight.encounter?.struggleStage??'held'):null;
    for(const key of ['pursue','continueFight','subdue']){
      el(key).hidden=!mechanics?.enemyRetreat||(key==='pursue'?!retreatPending:!retreatCaught||key==='subdue'&&!mechanics.enemyRetreat.subdueAbility);
      el(key).disabled=!locked;
    }
    el('heal').disabled=!resourceHero?.hp||retreatPending||retreatCaught||['held','retrieve'].includes(struggleStage)||Boolean(resources?.healingPool&&(resourceHero.hp>=resourceHero.maxHp||!resourceHero[resources.healingPool.field]))||Boolean(locked&&(fight.rules.enemyOnly||fight.encounter?.netTurns||mechanics?.openingEnemyTurn&&fight.round===0));
    el('healing').max=resources?.healingPool?Math.min(resourceHero?.[resources.healingPool.field]??0,(resourceHero?.maxHp??0)-(resourceHero?.hp??0)):1000000;
    el('abilityCheck').disabled=locked||!hero?.hp;
    const currentTarget=Number(el('target').value),targets=encounterTargets(fight).map(index=>({enemy:fight.enemies[index],index}));
    el('target').innerHTML=targets.map(({enemy,index})=>`<option value="${index}">${escape(enemy.name)}</option>`).join('');
    el('target').value=targets.some(({index})=>index===currentTarget)?currentTarget:targets[0]?.index??'';
    el('target').disabled=(!locked&&el('partingShot').hidden)||Boolean(fight.rules.enemyOnly);
    el('allyTargetRow').hidden=!mechanics?.holdOff?.damage;
    const allyTarget=el('allyTarget').value;
    el('allyTarget').innerHTML=targets.map(({enemy,index})=>`<option value="${index}">${escape(enemy.name)}</option>`).join('');
    el('allyTarget').value=targets.some(({index})=>String(index)===allyTarget)?allyTarget:targets.at(-1)?.index??'';
    el('allyTarget').disabled=!locked;
    el('status').textContent=tk('status.'+(fight?.status??'ready'))+(fight?' · '+tk('roundNumber',{n:fight.round}):'');
    if(fight?.rules.mechanics?.vessel){const vessel=fight.rules.mechanics.vessel;el('status').textContent+=' · '+tk('vesselHits',{name:vessel.name,n:fight.encounter?.vesselHits??vessel.initialHits,max:vessel.maxHits});}
    if(mechanics?.hitCounters)el('status').textContent+=' · '+tk('agingHits',{n:fight.encounter?.agingHits??0,max:mechanics.hitCounters.hitsToLose,age:fight.hero.age});
    if(gripped)el('status').textContent+=' · '+tk('gripped');
    if(fight?.encounter?.netTurns)el('status').textContent+=' · '+tk('netted');
    if(fight?.encounter?.engulfed)el('status').textContent+=' · '+tk('engulfed');
    if(struggleStage)el('status').textContent+=' · '+tk('struggle.'+struggleStage);
    if(retreatPending)el('status').textContent+=' · '+tk('pursuitPending');
    if(retreatCaught)el('status').textContent+=' · '+tk('opponentCaught');
    if(locked&&mechanics?.graceRounds&&!targets.length)el('status').textContent+=' · '+tk('graceRound');
    el('destination').textContent=fight?.destination?tk('destination',{n:fight.destination}):'';
    el('opponents').innerHTML=fight?fight.enemies.map(enemy=>'<div>'+escape(mechanics?.hitCounters?tk('enemyHits',{name:enemy.name,n:enemy.hitsTaken,max:mechanics.hitCounters.hitsToRetire})+(enemy.retired?' '+tk('retired'):''):tk('enemyHp',{name:enemy.name,n:enemy.hp,max:enemy.maxHp}))+'</div>').join(''):'';
    el('log').innerHTML=data.log.slice(-80).map(line=>'<div>'+escape(line)+'</div>').join('');
    el('history').innerHTML=data.history.slice(-40).toReversed().map(row=>'<div>'+escape(row.enemy+': '+tk('status.'+row.outcome))+'</div>').join('');
    setupNotes();
  }
  function editorRows(enemies){return enemies.map(enemy=>({...structuredClone(enemy),displayName:enemy.name,toHit:enemy.attacks[0]?.toHit??enemy.printedAttack,damageDice:enemy.attacks[0]?.damage?.dice,damageAdd:enemy.attacks[0]?.damage?.add}));}
  function open(){
    if(Number(getBookId())!==definition.id||!getRun()){showAlert(t('battlesim.no_active_playthrough'));return;}
    shownRun=getRun();editorRun=null;
    if(!state.read())state.change(data=>{data.character=structuredClone(definition.defaultHero);});
    el('overlay').classList.add('active');render(true);
  }
  function init(){
    if(el('overlay'))return;
    const overlay=document.createElement('div');overlay.id=ID+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-heading"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-heading">${escape(definition.title)}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">×</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left">
      <details open><summary>${escape(tk('character'))}</summary>${characterFields.map(key=>field(key,key.endsWith('Bonus')?-100:0,definition.characterLimits?.[key]??(key==='damageReduction'?1:abilities.includes(key)||key.endsWith('Bonus')?100:1000000))).join('')}<div class="bsim-btn-row">${button('saveCharacter')}${button('newCharacter')}</div></details>
      <label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter"><option value="custom">${escape(tk('custom'))}</option>${getRoster().map(entry=>`<option value="${entry.section}">${escape(entry.label)}</option>`).join('')}</select></label>
      <label class="inv-edit-row" id="${ID}-enemyCountRow" hidden><span>${escape(tk('enemyCount'))}</span><input class="inv-edit-input" id="${ID}-enemyCount" type="number" min="1" max="98" step="1"></label>
      <div id="${ID}-editor"></div><p class="bsim-note" id="${ID}-sourceNotes"></p>
      <label class="inv-edit-row" id="${ID}-weaponChoiceRow" hidden><span>${escape(tk('weaponChoice'))}</span><select class="inv-edit-input" id="${ID}-weaponChoice"></select></label>
      ${field('weaponDice',0,10)}${field('weaponAdd',-100,1000)}<p class="bsim-note" id="${ID}-weaponNote"></p><div id="${ID}-retrievedWeaponRow" hidden>${field('retrievedWeaponDice',0,10)}${field('retrievedWeaponAdd',-100,1000)}</div>${button('start')}
      <label class="bsim-checkbox" id="${ID}-useGauntletRow" hidden><input type="checkbox" id="${ID}-useGauntlet">${escape(tk('useGauntlet'))}</label><div class="bsim-btn-row">${['healingSpell','misdirection','repulsion'].map(button).join('')}</div>
      <label class="inv-edit-row"><span>${escape(tk('target'))}</span><select class="inv-edit-input" id="${ID}-target"></select></label><div class="bsim-btn-row">${button('round')}${button('cancel')}</div>
      <label class="inv-edit-row" id="${ID}-allyTargetRow" hidden><span>${escape(tk('allyTarget'))}</span><select class="inv-edit-input" id="${ID}-allyTarget"></select></label>
      <label class="inv-edit-row" id="${ID}-sourceExitRow" hidden><span>${escape(tk('sourceItem'))}</span><select class="inv-edit-input" id="${ID}-sourceExitChoice"></select></label>
      <div class="bsim-btn-row">${['retrieve','escapeGrip','flee','surrender','partingShot','escapeCheck','sourceExit','pursue','continueFight','subdue'].map(button).join('')}</div>
      ${field('healing',1)}${button('heal')}<p class="bsim-note">${escape(tk('healingNote'))}</p>
      <label class="inv-edit-row"><span>${escape(tk('ability'))}</span><select class="inv-edit-input" id="${ID}-ability">${abilities.map(key=>`<option value="${key}">${escape(tk(key))}</option>`).join('')}</select></label>${field('abilityModifier',-100,100)}${button('abilityCheck')}
      </div><div class="bsim-col bsim-col-right"><p id="${ID}-status" role="status"></p><p id="${ID}-destination"></p><div id="${ID}-opponents"></div><h3 class="bsim-side-title">${escape(tk('log'))}</h3><div class="bsim-log" id="${ID}-log"></div><h3 class="bsim-side-title">${escape(tk('history'))}</h3><div class="bsim-history-list" id="${ID}-history"></div></div></div></div>`;
    document.body.append(overlay);
    el('abilityModifier').value=0;
    editor=createOpponentEditor({document,id:ID,t,fields:[{key:'toBeHit',label:tk('toBeHit'),min:3,max:18},{key:'toHit',label:tk('toHit'),min:3,max:18},{key:'hp',label:tk('hp'),min:1},{key:'damageDice',label:tk('damageDice'),min:0,max:10},{key:'damageAdd',label:tk('damageAdd'),min:-100,max:1000}],presets:getRoster().filter(entry=>!entry.rules.mechanics?.abilityOutcome&&!entry.rules.mechanics?.vessel&&!entry.rules.mechanics?.hitCounters).flatMap(entry=>editorRows(entry.enemies)),
      isStatUnavailable:(key,row)=>row.hitCounter&&['hp','damageDice','damageAdd'].includes(key)||['toHit','damageDice','damageAdd'].includes(key)&&row.attacks?.length===0||key==='toHit'&&row.attacks?.every(attack=>attack.check==='constitution')||['damageDice','damageAdd'].includes(key)&&row.attacks?.some(attack=>attack.vesselHit)});
    el('editor').append(editor.element);
    const trigger=document.createElement('button');trigger.id=ID+'-btn';trigger.style.display='none';trigger.textContent=t('battlesim.title');getButtonRow().append(trigger);trigger.addEventListener('click',open);
    el('close').addEventListener('click',close);
    overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();}});
    el('encounter').addEventListener('change',()=>{if(active(state.read()?.fight))return;const entry=preset();editor.set(entry?editorRows(entry.enemies):[{}]);editor.fixCount(Boolean(entry));editor.lock(Boolean(entry?.rules.mechanics?.abilityOutcome));el('weaponDice').value='';el('weaponAdd').value=0;el('retrievedWeaponDice').value='';el('retrievedWeaponAdd').value=0;el('enemyCount').value='';setupNotes();saveSetup();});
    editor.element.addEventListener('input',saveSetup);editor.element.addEventListener('change',saveSetup);
    for(const key of ['weaponDice','weaponAdd','retrievedWeaponDice','retrievedWeaponAdd','enemyCount'])el(key).addEventListener('change',saveSetup);
    el('weaponChoice').addEventListener('change',()=>{setupNotes();saveSetup();});
    el('saveCharacter').addEventListener('click',()=>change(data=>{if(active(data.fight))return;data.character=readCharacter();data.fight=null;}));
    el('newCharacter').addEventListener('click',()=>confirm('resetConfirm',data=>{if(active(data.fight))return;data.character=structuredClone(definition.defaultHero);data.fight=null;}));
    el('start').addEventListener('click',()=>change(data=>{
      if(active(data.fight))return;data.character=readCharacter();const entry=preset(),rules=structuredClone(entry?.rules??definition.getCustomRules?.()??{});
      if(rules.mechanics?.struggle)rules.mechanics.struggle.retrievedDamage={dice:number('retrievedWeaponDice',0,10),add:number('retrievedWeaponAdd',-100,1000)};
      const weapon=entry?.weapons?.[Number(el('weaponChoice').value)];if(weapon)rules.heroDamage=structuredClone(weapon.damage);
      if(weapon?.attackBonus){rules.mechanics??={};rules.mechanics.heroAttackBonus=(rules.mechanics.heroAttackBonus??0)+weapon.attackBonus;}
      if(weapon?.winSection)rules.winSection=weapon.winSection;
      const enemies=rules.mechanics?.abilityOutcome?structuredClone(entry.enemies):editor.read().map(enemy=>{
        const attacks=structuredClone(enemy.attacks??[{toHit:enemy.toHit,damage:{dice:enemy.damageDice,add:enemy.damageAdd}}]);
        for(const attack of attacks)if(!attack.check)attack.toHit=enemy.toHit;
        if(attacks.length&&!attacks[0].vesselHit&&!enemy.hitCounter)attacks[0].damage={...attacks[0].damage,dice:enemy.damageDice,add:enemy.damageAdd};
        for(const attack of attacks.slice(1))if(attack.sameDamageAsPrimary)attack.damage=structuredClone(attacks[0].damage);
        return {name:enemy.displayName||tk('opponent'),hp:enemy.hp,toBeHit:enemy.toBeHit,attacks};
      });
      if(entry?.repeatFirstEnemy){
        const count=number('enemyCount',1,101-enemies.length),first=enemies.shift();
        enemies.unshift(...Array.from({length:count},(_,i)=>({...structuredClone(first),name:first.name+' '+(i+1)})));
        rules.attackGroups=[enemies.map((_,i)=>i)];
      }
      if(enemies.some(enemy=>enemy.attacks.some(attack=>attack.check||attack.when)))rules.mechanics??={};
      data.setup=setup();data.encounterName=entry?.label??enemies.map(enemy=>enemy.name).join(' / ');
      data.fight=startCrossroadsFight(data.character,enemies,rules,rules.enemyOnly?null:rules.heroDamage??{dice:number('weaponDice',0,10),add:number('weaponAdd',-100,1000)});
      data.log.push(data.encounterName);
    }));
    const selectedAlly=fight=>fight.rules.mechanics?.holdOff?.damage?Number(el('allyTarget').value):null;
    el('useGauntlet').addEventListener('change',()=>{if(!active(state.read()?.fight))saveSetup();});
    el('round').addEventListener('click',()=>change(data=>logEvents(data,crossroadsRound(data.fight,{target:Number(el('target').value),allyTarget:selectedAlly(data.fight),useGauntlet:el('useGauntlet').checked}))));
    for(const action of ['healingSpell','misdirection','repulsion'])el(action).addEventListener('click',()=>change(data=>{
      if(active(data.fight))logEvents(data,crossroadsRound(data.fight,{target:Number(el('target').value),action}));
      else if(action==='healingSpell'){
        const resources=(preset()?.rules??definition.getCustomRules?.())?.mechanics?.resources,event=healingSpell(data.character,resources);
        data.character.hp+=event.amount;data.fight=null;data.log.push(tk('restored',{n:event.amount}));
      }
    }));
    for(const action of ['retrieve','escapeGrip','flee','surrender','partingShot','escapeCheck','sourceExit','pursue','continueFight','subdue'])el(action).addEventListener('click',()=>change(data=>logEvents(data,crossroadsRound(data.fight,{target:Number(el('target').value),action,sourceExitIndex:Number(el('sourceExitChoice').value)}))));
    el('heal').addEventListener('click',()=>change(data=>{
      const amount=number('healing',1);
      if(active(data.fight))logEvents(data,crossroadsRound(data.fight,{healing:amount,allyTarget:selectedAlly(data.fight)}));
      else {const resources=(preset()?.rules??definition.getCustomRules?.())?.mechanics?.resources,restored=consumeHealing(data.character,resources,amount);data.character.hp+=restored;data.fight=null;data.log.push(tk('restored',{n:restored}));}
    }));
    el('abilityCheck').addEventListener('click',()=>change(data=>{if(active(data.fight))return;const key=el('ability').value;if(!abilities.includes(key))return;const result=crossroadsAbilityCheck(Math.max(0,Math.min(100,data.character[key]+number('abilityModifier',-100,100))));data.log.push(tk('check',{name:tk(key),dice:result.dice.join('+'),result:tk(result.passed?'passed':'failed')}));}));
    el('cancel').addEventListener('click',()=>confirm('cancelConfirm',data=>{if(!active(data.fight))return;if(data.fight.rules.nonfatal)data.fight.hero.hp=data.fight.startingHp;data.fight.status='cancelled';data.fight.events=[];}));
    registerShortcut({button:trigger,overlay,open,close});
  }
  return {init,render,open,close,setVisible(value){if(el('btn'))el('btn').style.display=value?'':'none';if(!value){close();shownRun=null;}}};
}
