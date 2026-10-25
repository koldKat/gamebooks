import {beginDestinyChallenge} from './challenges.js';
import {createDestinyOpponent} from './core.js';
import {reformDestinyOpponent, spawnDestinyRoundOpponents, advanceDestinyAspectCycle} from './round-events.js';
import {createOpponentEditor} from '../../opponents.js';
import {createDestinySession, beginDestinySession, applyDestinySessionAction} from './session.js';
import {DESTINY_ABILITIES, destinyAbilitySpec, destinyUnusedAbilities} from './abilities.js';
import {hasDestinyAbility, isDestinyOpponentActive, destinyStat, destinyDamageAllowed} from './effects.js';
import {DESTINY_PENALTIES, createDestinyCharacter} from './character.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title = value => String(value).split('-').map(word => word.charAt(0).toUpperCase()+word.slice(1)).join(' ');
const attributes = ['speed','brawn','magic','armour','health','maxHealth'];
const defaultSlots = ['mainHand','leftHand','feet','head','chest','cloak','ring1','ring2','transport'];
const equipmentStats = ['speed','brawn','magic','armour','health','stability','toughness'];

export function createDestinyPanel({document, definition, state, getRoster, t, showAlert, showConfirm, getButtonRow, registerShortcut = () => {}}) {
  const slots=definition.equipmentSlots||defaultSlots;
  const id = 'sim'+definition.id, tk = (key, values) => t(definition.i18nPrefix+'.'+key, values);
  const el = key => document.getElementById(id+'-'+key);
  let opponents, owned, gearAbilities, currentRun, hydrated, wasLocked, gear = {}, gearSlot = 'mainHand', selectedAbility = '';
  const data = () => state.read() ?? createDestinySession();
  const locked = d => d.challenge?.status === 'active' || d.fight?.status === 'active' || d.character?.pendingRingDestruction ||
    d.fight && !d.character?.outcomeIds?.includes(d.fightId);
  const label = name => data().fight?.encounter?.grantedAbilities?.[name]?.label || title(name);
  const row = (key, content, text = tk(key)) => `<label class="inv-edit-row"><span>${escape(text)}</span>${content}</label>`;
  const number = (key, value = 0, min = 0, max = 1000000, text) => row(key,
    `<input class="inv-edit-input" type="number" id="${id}-${key}" min="${min}" max="${max}" step="1" value="${escape(value)}">`,text);
  const select = (key, choices, value, text) => row(key,`<select class="inv-edit-input" id="${id}-${key}">${choices.map(choice => {
    const [v,l] = Array.isArray(choice)?choice:[choice,tk(choice)];
    return `<option value="${escape(v)}"${String(v)===String(value)?' selected':''}>${escape(l)}</option>`;
  }).join('')}</select>`,text);
  const check = (key, checked = false, text = tk(key)) => `<label class="bsim-checkbox"><input type="checkbox" id="${id}-${key}"${checked?' checked':''}>${escape(text)}</label>`;
  const button = (name, text = tk(name)) => `<button type="button" class="bsim-action-btn" id="${id}-${name}" data-do="${name}">${escape(text)}</button>`;
  const textInput = (key, value = '') => row(key,`<input class="inv-edit-input" id="${id}-${key}" value="${escape(value)}">`);
  function integer(key, min = 0, max = 1000000) {
    const raw = el(key)?.value?.trim(), value = Number(raw);
    if (raw === '' || raw == null || !Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(tk('invalidNumber'));
    return value;
  }
  const indices = key => [...el(key)?.querySelectorAll('input:checked') || []].map(input => Number(input.value));
  const targets = (fight, aliveOnly = false) => fight.opponents.flatMap((opponent, index) =>
    aliveOnly && !isDestinyOpponentActive(fight,index)?[]:[[index,`${index+1}. ${opponent.name} (${opponent.health ?? '-'})`]]);
  function checklist(key, choices, text) {
    return `<fieldset id="${id}-${key}" class="bsim-side"><legend>${escape(text)}</legend>${choices.map(([value,name]) =>
      `<label class="bsim-checkbox"><input type="checkbox" value="${escape(value)}">${escape(name)}</label>`).join('')}</fieldset>`;
  }
  function inventoryEditor(container, counts) {
    let inventory = {};
    container.innerHTML = `<div data-owned></div><div class="bsim-btn-row"><select class="inv-edit-input" aria-label="${escape(tk('ability'))}">${Object.keys(DESTINY_ABILITIES).sort().map(name=>`<option value="${name}">${escape(title(name))}</option>`).join('')}</select><button type="button" class="bsim-action-btn">${escape(tk('addAbility'))}</button></div>`;
    const list = container.querySelector('[data-owned]'), picker = container.querySelector('select');
    function render() {
      list.innerHTML = Object.entries(inventory).map(([name,count]) => `<div class="inv-edit-row"><span>${escape(title(name))}</span>${counts?`<input class="inv-edit-input" type="number" min="1" max="100" value="${count}" data-count="${name}" aria-label="${escape(title(name))}">`:''}<button type="button" class="bsim-action-btn" data-remove="${name}" aria-label="${escape(tk('removeAbility',{name:title(name)}))}">×</button></div>`).join('');
    }
    container.querySelector('button').addEventListener('click',()=>{inventory[picker.value]=1;render();saveSetup();});
    list.addEventListener('click',event=>{const name=event.target.dataset.remove;if(name){delete inventory[name];render();saveSetup();}});
    list.addEventListener('change',event=>{event.stopPropagation();if(event.target.dataset.count){const value=Number(event.target.value);
      if(Number.isInteger(value)&&value>=1&&value<=100){inventory[event.target.dataset.count]=value;saveSetup();}}});
    return {read:()=>({...inventory}),set:value=>{inventory=Object.fromEntries(Object.entries(value||{}).filter(([,count])=>count>0));render();}};
  }
  function storeGear() {
    if (!el('gearPresent').checked) {delete gear[gearSlot];return;}
    const previous=gear[gearSlot]||{};
    gear[gearSlot] = {...previous,type:el('gearType').selectedIndex<0?(previous.type||''):el('gearType').value,
      id:el('synsHeart').checked?'syns-heart':previous.id==='syns-heart'?'':previous.id||'',
      abilities:Object.keys(gearAbilities.read()),...Object.fromEntries(equipmentStats.map(key=>[key,integer('gear-'+key)]))};
  }
  function loadGear() {
    const item = gear[gearSlot],picker=el('gearType');el('gearPresent').checked=!!item;
    if(item?.type&&![...picker.options].some(option=>option.value===item.type)){
      const option=document.createElement('option');option.value=item.type;option.textContent=title(item.type);picker.appendChild(option);
    }
    picker.value=item?.type||'';
    el('synsHeart').checked=item?.id==='syns-heart';
    for (const key of equipmentStats) el('gear-'+key).value=item?.[key]??0;
    gearAbilities.set(Object.fromEntries((item?.abilities||[]).map(name=>[name,1])));
  }
  function setup() {
    storeGear();
    return {hero:Object.fromEntries(attributes.map(key=>[key,integer(key,key==='health'||key==='maxHealth'?1:0)])),
      section:el('encounter').value.replace(/^challenge:/,'')||null,challenge:el('encounter').value.startsWith('challenge:'),leif:el('leif').checked,useOptionalAbilities:el('useOptionalAbilities').checked,opponents:opponents.read().map(enemy=>({...enemy,name:enemy.displayName})),
      abilities:owned.read(),equipment:structuredClone(gear),fimbulwinter:el('fimbulwinter').checked,
      bannerLit:el('bannerLit').checked,roughRide:el('roughRide').checked};
  }
  function profile(previous) {
    const items = [...(previous.items||[])].filter(item=>!['captains-conch','dragons-horn'].includes(item));
    if(el('conch').checked)items.push('captains-conch');if(el('horn').checked)items.push('dragons-horn');
    const defeats=integer('defeats');
    return createDestinyCharacter({...previous,career:el('career').value.trim().toLowerCase(),items,
      keywords:el('keywords').value.split(',').map(value=>value.trim().toLowerCase()).filter(Boolean),
      gold:integer('gold'),tarBarrels:integer('tarBarrels'),defeats,
      nextPenaltyAt:defeats===previous.defeats?previous.nextPenaltyAt:(Math.floor(defeats/5)+1)*5,
      penalties:Object.values(DESTINY_PENALTIES).filter(name=>name!=='fingerless'&&el('penalty-'+name).checked)});
  }
  function saveSetup() {
    if(!state.current()||locked(data()))return;
    try {const snapshot=state.capture(),next=createDestinySession(data());next.setup=setup();next.character=profile(next.character);
      if(state.commit(snapshot,next)){hydrated=JSON.stringify([next.setup,next.character]);render();}}
    catch(error){showAlert(error.message);}
  }
  function hydrate(d) {
    for(const key of attributes)el(key).value=d.setup.hero?.[key]??definition.defaultHero?.[key]??(key==='health'||key==='maxHealth'?1:0);
    el('encounter').value=d.setup.section?(d.setup.challenge?'challenge:':'')+d.setup.section:'';owned.set(d.setup.abilities||{});gear=structuredClone(d.setup.equipment||d.character.equipment||{});
    gearSlot='mainHand';el('gearSlot').value=gearSlot;loadGear();
    opponents.set(d.setup.opponents?.length?d.setup.opponents:[{displayName:'',speed:0,brawn:0,magic:0,armour:0,health:1,damageStat:'brawn'}]);
    for(const key of ['fimbulwinter','bannerLit','roughRide','leif'])el(key).checked=!!d.setup[key];
    el('useOptionalAbilities').checked=d.setup.useOptionalAbilities!==false;
    el('career').value=d.character.career||'';el('keywords').value=(d.character.keywords||[]).join(', ');
    for(const key of ['gold','tarBarrels','defeats'])el(key).value=d.character[key]||0;
    el('conch').checked=d.character.items?.includes('captains-conch');el('horn').checked=d.character.items?.includes('dragons-horn');
    for(const name of Object.values(DESTINY_PENALTIES).filter(name=>name!=='fingerless'))el('penalty-'+name).checked=d.character.penalties?.includes(name);
  }
  function dice() {
    const raw=el('manualDice').value.trim();if(!raw)return {roll:undefined,remaining:()=>''};
    const values=raw.split(/[\s,]+/).map(Number);
    if(values.some(value=>!Number.isInteger(value)||value<1||value>6))throw new RangeError(tk('invalidDice'));
    return {roll:()=>{if(!values.length)throw new RangeError(tk('moreDice'));return values.shift();},remaining:()=>values.join(' ')};
  }
  function apply(name,payload={}) {
    if(!state.current())return;
    try {const snapshot=state.capture(),source=dice();const next=applyDestinySessionAction(data(),name,payload,{roster:getRoster(),roll:source.roll});
      if(state.commit(snapshot,next)){el('manualDice').value=source.remaining();render();}}
    catch(error){showAlert(error.message);}
  }
  function start() {
    if(!state.current()||locked(data()))return;
    try {const snapshot=state.capture(),next=createDestinySession(data());next.character=profile(next.character);
      const config=setup(),options={roster:getRoster(),outcomeId:`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`};
      const result=config.challenge?beginDestinyChallenge(next,config,{...options,leif:config.leif,useOptionalAbilities:config.useOptionalAbilities}):beginDestinySession(next,config,options);
      if(state.commit(snapshot,result))render();}
    catch(error){showAlert(error.message);}
  }
  function nextAction(fight) {
    if(fight.phase==='encounter-start')return fight.encounter?.pathProgress?'advance-path':fight.encounter?.openingTest&&!fight.encounter.openingTestRolled?'opening-test':'sequence-test';
    return {start:'start-round',speed:'roll-speed','speed-rolled':'resolve-speed',damage:'roll-damage',
      'damage-rolled':'resolve-damage',end:'end-round','death-move':'skip-death-move','ability-rolled':'resolve-ability'}[fight.phase];
  }
  function abilityOptions(fight,name) {
    const spec=destinyAbilitySpec(fight,name);if(!spec)return '';
    let html=(spec.enemy||spec.advanced||spec.afterHit||spec.hit&&spec.hit!=='all'||spec.opening&&['first-blood','first-cut'].includes(name))?select('abilityTarget',targets(fight),fight.target,tk('target')):'';
    const pending=fight.turn?.pendingAbility;
    const groups=pending?.groups;
    if(groups)html+=select('group',groups.map((group,index)=>[index,`${index+1}. ${group.targets.map(i=>fight.opponents[i].name).join(', ')}`]),0,tk('diceGroup'));
    const speedDice=fight.phase==='speed-rolled'&&['watchful','sneak'].includes(spec.dieAction)?fight.turn.opponentSpeedDice:fight.turn?.heroSpeedDice;
    const values=groups?.[0]?.dice||pending?.dice||fight.turn?.damageDice||speedDice||[];
    const dieChoices=values.map((value,index)=>[index,`${index+1}: ${value}`]);
    if(spec.dieAction||spec.reroll||['hooked','roll-with-it','shoulder-charge'].includes(name))html+=select('die',dieChoices,0,tk('die'));
    if(['hero-speed','both-speed'].includes(spec.reroll))html+=checklist('rerollDice',(fight.turn?.heroSpeedDice||[]).map((value,index)=>[index,`${index+1}: ${value}`]),tk('rerollDice'));
    if(['trickster','deceive'].includes(name))html+=select('heroDie',(fight.turn.heroSpeedDice||[]).map((v,i)=>[i,`${i+1}: ${v}`]),0,tk('heroDie'))+select('opponentDie',(fight.turn.opponentSpeedDice||[]).map((v,i)=>[i,`${i+1}: ${v}`]),0,tk('opponentDie'));
    if(spec.chooseAttribute||spec.weaken||name==='parasite')html+=select('attribute',(spec.chooseAttribute|| (name==='parasite'?['speed','brawn','magic','armour']:['brawn','magic'])),undefined,tk('attribute'));
    if(spec.regain)html+=select('restore',Object.keys(fight.abilities).filter(key=>fight.used[key]>0&&spec.regain.includes(destinyAbilitySpec(fight,key)?.category)&&hasDestinyAbility(fight,key)).map(key=>[key,label(key)]),undefined,tk('restore'));
    if(['two','adjacent'].includes(spec.hit)||['twin-blade','poison-cloud'].includes(name))html+=checklist('abilityTargets',targets(fight,true),tk('targets'));
    if(name==='wave')html+=targets(fight,true).map(([index,name])=>number('allocation-'+index,0,0,1000000,name)).join('');
    if(name==='torrent')html+=select('torrentAbility',['cleave','lash','shadow-thorns'].map(key=>[key,label(key)]),undefined,tk('ability'));
    if(name==='shatter')html+=select('variant',[['armour-minus-two',tk('shatterPermanent')],['armour-zero-next-round',tk('shatterNext')]],undefined,tk('variant'));
    if(name==='best-laid-plans')html+=select('trap',['snap-jack','cluster-mine'].map(value=>[value,title(value)]),undefined,tk('trap'));
    if(name==='sweet-spot')html+=number('chosenNumber',1,1,6,tk('chosenNumber'));
    if(name==='ice-mantle')html+=check('bonusAlreadyIncluded');
    return html;
  }
  function readAbilityOptions(fight) {
    const options={deferDamage:true};
    for(const key of ['attribute','restore','variant','trap'])if(el(key))options[key]=el(key).value;
    for(const [field,key]of [['abilityTarget','target'],['group','group'],['die','die'],['heroDie','heroDie'],['opponentDie','opponentDie'],['chosenNumber','number']])if(el(field))options[key]=integer(field);
    if(el('rerollDice'))options.dice=indices('rerollDice');if(el('abilityTargets'))options.targets=indices('abilityTargets');
    if(el('torrentAbility'))options.ability=el('torrentAbility').value;
    if(el('bonusAlreadyIncluded'))options.bonusAlreadyIncluded=el('bonusAlreadyIncluded').checked;
    if(selectedAbility==='wave')options.allocations=fight.opponents.map((_,index)=>el('allocation-'+index)?integer('allocation-'+index):0);
    return options;
  }
  function choiceTargets(fight, socket) {
    if (fight.phase === 'encounter-orbs') {
      const progress = fight.encounter.pathProgress, board = fight.encounter.pathChallenge;
      socket ??= progress.pendingSockets[0];
      const cell = board.cells.findIndex(value=>value.sockets.includes(socket));
      const orb = board.orbs[progress.placements[socket]];
      return targets(fight).filter(([index])=>fight.opponents[index].health>0&&progress.positions[index]===cell&&
        (orb?.kind!=='curse'||!progress.cursed.includes(index)));
    }
    const pending = fight.turn?.pendingAbility;
    if (pending?.type === 'defeat-choice') return targets(fight,true).filter(([index])=>fight.encounter.opponentGroups[pending.event.group].includes(index));
    let upcoming=fight;
    if(fight.phase==='start'){
      upcoming=structuredClone(fight);
      advanceDestinyAspectCycle(upcoming,fight.round+1);
      reformDestinyOpponent(upcoming,fight.round+1);
      spawnDestinyRoundOpponents(upcoming,fight.round+1,createDestinyOpponent);
    }
    return targets(upcoming,true).filter(([index])=>!['start','speed'].includes(fight.phase)||
      (!upcoming.encounter?.unselectableTargets?.includes(index)&&(!upcoming.encounter?.restrictProtectedTargets||destinyDamageAllowed(upcoming,index))));
  }
  function renderControls(fight) {
    const challenge=data().challenge;
    if(challenge){
      el('controls').innerHTML=challenge.status==='finished'?`<p>${escape(tk('challengeDestination',{section:challenge.destination}))}</p>`:
        button(challenge.phase==='ready'?'challenge-roll':'challenge-resolve')+(challenge.turns===0&&challenge.phase==='ready'?button('challenge-cancel'):'');
      return;
    }
    if(!fight){el('controls').innerHTML='';return;}
    if(fight.status!=='active'){
      const recorded=data().character.outcomeIds?.includes(data().fightId);
      el('controls').innerHTML=recorded?`<p>${escape(tk('outcomeRecorded'))}</p>`:button('record-outcome');
      if(data().character.pendingRingDestruction)el('controls').innerHTML+=select('ringSlot',Object.keys(data().character.equipment||{}).filter(key=>/^ring[12]$/.test(key)&&data().character.equipment[key]).map(key=>[key,title(key)]),undefined,tk('ringSlot'))+button('ring-loss');
      return;
    }
    let html=select('target',choiceTargets(fight),fight.target,tk('target'));
    if(fight.phase==='speed')html+=button('retarget');
    if(fight.phase==='encounter-setup'){
      const board=fight.encounter.pathChallenge;
      html+=`<p>${escape(tk('placeOrbs'))}</p><div class="bsim-path-board" style="--bsim-board-columns:${Math.max(...board.cells.map(cell=>cell.x))+1}">${board.cells.map((cell,index)=>`<fieldset class="bsim-side" style="grid-column:${cell.x+1};grid-row:${cell.y+1}"><legend>${escape(tk('square',{n:index+1}))}</legend>${cell.sockets.map(socket=>select('orb-'+socket,[['',tk('none')],...Object.entries(board.orbs).map(([name,orb])=>[name,orb.name])],'',tk('orb'))).join('')}</fieldset>`).join('')}</div>`;
      html+=Object.entries(board.orbs).map(([name,orb])=>number('extra-'+name,0,0,100,tk('additionalOrbs',{name:orb.name,n:orb.count}))).join('')+button('begin-path');
    }else if(fight.phase==='encounter-orbs'){
      html+=select('socket',fight.encounter.pathProgress.pendingSockets.map(socket=>[socket,`${tk('square',{n:fight.encounter.pathChallenge.cells.findIndex(cell=>cell.sockets.includes(socket))+1})}: ${title(fight.encounter.pathProgress.placements[socket])}`]),undefined,tk('orb'))+button('path-orb');
    }else if(fight.phase==='ability-choice'){
      const pending=fight.turn.pendingAbility;
      if(pending.type==='defeat-choice')html+=button('defeat-choice',pending.name);
      else{const names=pending.type==='ability-sacrifice'?destinyUnusedAbilities(fight):Object.keys(fight.abilities).filter(name=>fight.used[name]>0&&['sp','mo'].includes(destinyAbilitySpec(fight,name)?.category)&&hasDestinyAbility(fight,name));
        html+=select('choiceAbility',[['',tk(pending.type==='ability-sacrifice'?'takeDamage':'skip')],...names.map(name=>[name,label(name)])],undefined,tk('ability'))+button(pending.type==='ability-sacrifice'?'sacrifice-choice':'gambit-choice');}
    }else if(nextAction(fight)){
      if(fight.phase==='damage'&&fight.turn.winner==='hero'&&fight.turn.soundCharge&&!fight.turn.used.co)html+=check('soundCharge',true);
      if(fight.phase==='end'&&fight.turn.winner==='hero'&&fight.encounter?.iceLake?.position<fight.encounter.iceLake.columns)html+=check('advanceOnIce',true);
      html+=button('next',tk(nextAction(fight)));
    }
    if(fight.phase==='start'&&fight.trap&&!fight.trap.fired&&fight.trap.trigger===fight.round+1)html+=checklist('trapTargets',targets(fight,true),tk('trapTargets'));
    const actions=getRoster().find(entry=>entry.section===fight.encounter?.sourceSection)?.adapter?.actions;
    if(actions)html+=`<details><summary>${escape(tk('encounterActions'))}</summary>${select('bookAction',Object.entries(actions).map(([name,settings])=>[name,settings.name||title(name)]),undefined,tk('action'))}${number('actionCount',1,1,100,tk('count'))}${button('book-action')}</details>`;
    const names=Object.keys(fight.abilities).filter(name=>hasDestinyAbility(fight,name)&&destinyAbilitySpec(fight,name)?.phases.includes(fight.phase));
    if(names.length){if(!names.includes(selectedAbility))selectedAbility=names[0];html+=`<details open><summary>${escape(tk('abilities'))}</summary>${select('useAbility',names.map(name=>[name,`${label(name)} (${destinyAbilitySpec(fight,name).category.toUpperCase()})`]),selectedAbility,tk('ability'))}<div id="${id}-abilityOptions"></div>${button('ability',tk('useAbility'))}</details>`;}
    html+=button('finishFight',tk(fight.round===0&&!fight.history.length&&!Object.keys(fight.used).length?'cancelFight':'concede'));
    el('controls').innerHTML=html;
    if(el('abilityOptions'))el('abilityOptions').innerHTML=abilityOptions(fight,selectedAbility);
  }
  function eventText(event,fight) {
    const who=Number.isInteger(event.target)?fight.opponents[event.target]?.name:'';
    if(event.type==='speed')return tk('speedResult',{hero:event.hero,opponent:event.opponent});
    if(event.type==='damage')return tk('damageResult',{name:event.attacker==='hero'?who:tk('hero'),n:event.damage});
    if(event.type==='ability-damage'||event.type==='passive')return tk('damageResult',{name:event.target==='hero'?tk('hero'):who,n:event.damage});
    if(event.type==='outcome')return tk(event.status);
    if(event.dice)return `${event.name||tk('dice')}: ${event.dice.join(', ')}${event.total!==undefined?' = '+event.total:''}`;
    if(event.name)return `${label(event.name)}${who?' · '+who:''}`;
    return title(event.type);
  }
  function render() {
    if(!el('overlay'))return;
    const run=state.current();if(!run){close();return;}
    const d=data(),stamp=JSON.stringify([d.setup,d.character]);
    if(run!==currentRun||stamp!==hydrated){hydrate(d);currentRun=run;hydrated=stamp;}
    if(wasLocked!==!!locked(d)){el('setupDetails').open=!locked(d);wasLocked=!!locked(d);}
    el('setup').disabled=!!locked(d);opponents.lock(!!locked(d));
    el('start').disabled=!!locked(d);el('manualOpponent').hidden=!!el('encounter').value;
    const preset=getRoster().find(entry=>entry.section===el('encounter').value);
    el('rules').innerHTML=preset?`<summary>${escape(tk('encounterRules'))}</summary>${preset.printedRules.map(rule=>`<p>${escape(rule)}</p>`).join('')}`:'';
    renderControls(d.fight);
    const f=d.challenge?null:d.fight;
    el('status').textContent=f?`${tk('round',{n:f.round})} · ${tk(f.status)} · ${tk('phase.'+f.phase)}`:tk('ready');
    el('combatants').innerHTML=f?`<div class="bsim-status">${escape(tk('hero'))}: ${f.hero.health}/${f.hero.maxHealth} · ${['speed','brawn','magic','armour'].map(key=>`${escape(tk(key))} ${destinyStat(f,'hero',key)}`).join(' · ')}</div>`+f.opponents.map((enemy,index)=>`<div class="bsim-combatant">${index+1}. ${escape(enemy.name)}: ${enemy.health??'-'}/${enemy.maxHealth??'-'}${isDestinyOpponentActive(f,index)?'':' · '+escape(tk('inactive'))}<br>${['speed',enemy.damageStat,'armour'].filter(Boolean).map(key=>`${escape(tk(key))} ${enemy[key]===null?'-':destinyStat(f,index,key)}`).join(' · ')}</div>`).join(''):'';
    const pending=f?.turn?.pendingAbility, lines=[];
    if(f?.turn?.heroSpeedDice?.length)lines.push(tk('heroDice')+': '+f.turn.heroSpeedDice.join(', '));
    if(f?.turn?.opponentSpeedDice?.length)lines.push(tk('enemyDice')+': '+f.turn.opponentSpeedDice.join(', '));
    if(f?.turn?.damageDice?.length)lines.push(tk('damageDice')+': '+f.turn.damageDice.join(', '));
    if(pending?.dice)lines.push(pending.name+': '+pending.dice.join(', '));
    if(pending?.groups)for(const group of pending.groups)lines.push(group.targets.map(index=>f.opponents[index].name).join(', ')+': '+group.dice.join(', '));
    el('result').innerHTML=lines.map(line=>`<div>${escape(line)}</div>`).join('');
    if(f?.encounter?.iceLake){const lake=f.encounter.iceLake;el('combatants').innerHTML+=`<p>${escape(tk('icePosition',{position:lake.position,columns:lake.columns,cracked:lake.cracked}))}</p>`;}
    el('log').innerHTML=(f?.history||[]).slice(-120).reverse().map(event=>`<div>${escape(eventText(event,f))}</div>`).join('');
    if(d.challenge){
      const challenge=d.challenge;el('status').textContent=tk('challengeProgress',{name:challenge.name,turns:challenge.turns,total:challenge.rules.turns,failures:challenge.failures});
      el('combatants').textContent=tk('challengeTarget',{attribute:tk(challenge.rules.attribute),value:challenge.attribute,bonus:challenge.rules.rollBonus,target:challenge.rules.threshold});
      el('result').textContent=challenge.dice?tk('dice')+': '+challenge.dice.join(', '):'';
      el('log').innerHTML=challenge.history.slice().reverse().map(entry=>`<div>${escape(tk(entry.success?'challengePassed':'challengeFailed',{total:entry.total}))}</div>`).join('');
    }
    el('history').innerHTML=d.history.slice(-30).reverse().map(item=>`<div>${escape(item.opponents.join(', '))} · ${escape(tk(item.outcome))}</div>`).join('');
  }
  function close(){el('overlay')?.classList.remove('active');}
  function open(){if(!state.current()){showAlert(t('battlesim.no_active_playthrough'));return;}render();el('overlay').classList.add('active');}
  function init(){
    if(el('overlay'))return;
    const overlay=document.createElement('div');overlay.id=id+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(tk('title'))}</span><button class="inv-close-btn" id="${id}-close" aria-label="${escape(t('btn.close'))}">×</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><details id="${id}-setupDetails" open><summary>${escape(tk('setup'))}</summary><fieldset id="${id}-setup" class="bsim-side"><legend>${escape(tk('setup'))}</legend>${attributes.map(key=>number(key,key==='health'||key==='maxHealth'?1:0,key==='health'||key==='maxHealth'?1:0)).join('')}${select('encounter',[['',tk('custom')],...getRoster().filter(entry=>entry.adapter?.implemented).map(entry=>[entry.section,entry.label]),...Object.entries(Object.assign({},...getRoster().map(entry=>entry.challenges||{}))).map(([section,entry])=>['challenge:'+section,`§${section}: ${entry.rules.name}`])],'',tk('encounter'))}<div id="${id}-manualOpponent"></div><details><summary>${escape(tk('abilities'))}</summary><div id="${id}-owned"></div></details><details><summary>${escape(tk('equipment'))}</summary><p>${escape(tk('loadoutNote'))}</p>${select('gearSlot',slots.map(key=>[key,tk(key)]),'mainHand',tk('slot'))}${check('gearPresent')}${select('gearType',['','axe','sword','dagger','spear','mace','hammer','bow','crossbow','shield','horn','totem','grapple','staff'].map(key=>[key,key?title(key):tk('none')]),'',tk('type'))}${check('synsHeart')}${equipmentStats.map(key=>number('gear-'+key,0,0,1000000,tk(key))).join('')}<div id="${id}-gearAbilities"></div></details><details><summary>${escape(tk('character'))}</summary>${textInput('career')}${textInput('keywords')}${number('gold')}${number('tarBarrels')}${number('defeats')}${check('conch')}${check('horn')}${Object.values(DESTINY_PENALTIES).filter(key=>key!=='fingerless').map(name=>check('penalty-'+name,false,title(name))).join('')}</details><details><summary>${escape(tk('storyConditions'))}</summary>${check('fimbulwinter')}${check('bannerLit')}${check('roughRide')}${check('leif')}${check('useOptionalAbilities',true)}</details></fieldset></details>${button('start')}<details id="${id}-rules"></details>${textInput('manualDice')}<p>${escape(tk('manualDiceNote'))}</p><div id="${id}-controls"></div><p id="${id}-status" role="status"></p></div><div class="bsim-col bsim-col-right"><div id="${id}-combatants" class="bsim-side" role="status"></div><div id="${id}-result" class="bsim-side" role="status"></div><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div id="${id}-history" class="bsim-history-list"></div></details><div id="${id}-log" class="bsim-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    opponents=createOpponentEditor({document,id,t,fields:[...['speed','brawn','magic','armour','health'].map(key=>({key,label:tk(key),min:key==='health'?1:0})),{key:'damageStat',label:tk('damageStat'),options:[{value:'brawn',label:tk('brawn')},{value:'magic',label:tk('magic')}]}],presets:getRoster().flatMap(entry=>entry.parts.filter(part=>part.role==='opponent').map(part=>({...part,displayName:part.name,section:entry.section}))) });
    el('manualOpponent').appendChild(opponents.element);owned=inventoryEditor(el('owned'),true);gearAbilities=inventoryEditor(el('gearAbilities'),false);
    const launcher=document.createElement('button');launcher.id=id+'-btn';launcher.textContent=t('battlesim.title');launcher.style.display='none';getButtonRow().appendChild(launcher);launcher.addEventListener('click',open);
    registerShortcut({button:launcher,overlay,open,close});el('close').addEventListener('click',close);
    let backdrop=false;overlay.addEventListener('mousedown',event=>{backdrop=event.target===overlay;});
    overlay.addEventListener('click',event=>{if(backdrop&&event.target===overlay)close();const name=event.target.closest('[data-do]')?.dataset.do;if(!name)return;
      if(name==='start'){start();return;}
      if(name.startsWith('challenge-')){apply(name);return;}
      const fight=data().fight;if(!fight)return;
      try{
        if(name==='finishFight'){
          const snapshot=state.capture(),untouched=fight.round===0&&!fight.history.length&&!Object.keys(fight.used).length;
          showConfirm(tk(untouched?'cancelFightConfirm':'concedeConfirm'),()=>{if(state.matches(snapshot))apply(untouched?'cancel-fight':'concede');},{confirmLabel:tk(untouched?'cancelFight':'concede')});return;
        }
        if(name==='next'){const options={deferTrapDamage:true};if(el('trapTargets'))options.trapTargets=indices('trapTargets');if(el('soundCharge'))options.soundCharge=el('soundCharge').checked;if(el('advanceOnIce'))options.advanceOnIce=el('advanceOnIce').checked;apply(nextAction(fight),{target:el('target')?.value?integer('target'):undefined,options});}
        else if(name==='ability')apply('ability',{name:selectedAbility,options:readAbilityOptions(fight)});
        else if(['retarget','defeat-choice'].includes(name))apply(name,{target:integer('target')});
        else if(['sacrifice-choice','gambit-choice'].includes(name))apply(name,{name:el('choiceAbility').value||null});
        else if(name==='book-action')apply(name,{name:el('bookAction').value,options:{count:integer('actionCount',1)}});
        else if(name==='path-orb')apply(name,{socket:el('socket').value,target:integer('target')});
        else if(name==='begin-path'){const board=fight.encounter.pathChallenge;apply(name,{placements:Object.fromEntries(board.cells.flatMap(cell=>cell.sockets).filter(socket=>el('orb-'+socket).value).map(socket=>[socket,el('orb-'+socket).value])),additionalOrbs:Object.fromEntries(Object.keys(board.orbs).map(key=>[key,integer('extra-'+key)]))});}
        else if(name==='ring-loss')apply(name,{slot:el('ringSlot').value||null});
        else apply(name);
      }catch(error){showAlert(error.message);}
    });
    overlay.addEventListener('change',event=>{
      if(event.target.id===id+'-gearSlot'){try{storeGear();gearSlot=event.target.value;loadGear();saveSetup();}catch(error){showAlert(error.message);}return;}
      if(event.target.id===id+'-group'&&el('die')){const values=data().fight.turn.pendingAbility.groups[integer('group')].dice;el('die').innerHTML=values.map((value,index)=>`<option value="${index}">${index+1}: ${value}</option>`).join('');return;}
      if(event.target.id===id+'-socket'){el('target').innerHTML=choiceTargets(data().fight,event.target.value).map(([value,name])=>`<option value="${value}">${escape(name)}</option>`).join('');return;}
      if(event.target.id===id+'-useAbility'){selectedAbility=event.target.value;el('abilityOptions').innerHTML=abilityOptions(data().fight,selectedAbility);return;}
      if(event.target.closest('#'+id+'-setup'))saveSetup();
    });
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();}});
  }
  return {init,render,open,close,setVisible(visible){const launcher=el('btn');if(launcher)launcher.style.display=visible?'':'none';if(!visible)close();else render();}};
}
