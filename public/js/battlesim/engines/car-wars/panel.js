import {createOpponentEditor} from '../../opponents.js';
import {validateCombatant, startFight, resumeFight, fightRound, tactic, repairVehicle, replaceDriver, combatantOut} from './core.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => structuredClone(value);
const locked = game => ['fighting','awaitingDriver'].includes(game?.fight?.status);
const labels = {hp:'HP',maxHp:'Maximum HP',defenseClass:'Defense Class',gunnery:'Gunnery',driving:'Driving',mechanic:'Mechanic',
  handling:'Handling',controlRoll:'Control roll',driverHp:'Driver HP',driverArmour:'Driver armour',gunnerHp:'Gunner HP',
  gunnerArmour:'Gunner armour',gunnerGunnery:'Gunner Gunnery',computerBonus:'Targeting bonus',cargo:'Cargo boxes',
  smokeCharges:'Smoke charges',grenades:'Hand grenades',armour:'Armour',boxes:'Boxes',bonus:'To-hit bonus',damageDice:'Damage dice',
  flatDamage:'Fixed damage',ammo:'Shots left',prestige:'Prestige',wealth:'Wealth'};
const fields = [
  {key:'gunnery',label:'Gunnery',min:0,max:100},
  {key:'defenseClass',label:'Defense Class',min:0,max:100},
  {key:'hp',label:'HP',min:1,max:10000},
];
const blankPerson = () => ({name:'You',key:'player',kind:'person',hp:3,maxHp:3,defenseClass:9,gunnery:1,driving:1,mechanic:1,
  prestige:1,wealth:1,armour:3,weapon:{name:'Machine pistol',flatDamage:2,vehicleFlatDamage:1,bonus:0}});
const customEnemy = kind => kind === 'person'
  ? {name:'Opponent',key:'custom-1',kind:'person',hp:3,defenseClass:9,gunnery:1,weapon:{name:'Hand weapon',flatDamage:1,bonus:0}}
  : {name:'Opponent vehicle',key:'custom-1',kind:'vehicle',hp:10,defenseClass:9,gunnery:1,handling:0,controlRoll:3,driverHp:3,
    powerPlant:{boxes:3},weapons:[{name:'Machine-gun',direction:'front',bonus:0,damageDice:1,boxes:3}]};

export function createCarWarsPanel({document,definition,getRoster,getVehicles,t,getRun,getBookId,saveState,getButtonRow,
  showAlert,showConfirm,registerShortcut=()=>{}}) {
  const id = definition.stateKey, el = key => document.getElementById(id+'-'+key);
  let shownRun, editor, modelHero, modelEnemies = [], settingUp = false;
  const preset = () => getRoster().find(entry=>entry.section===el('context').value);
  const data = () => Number(getBookId()) === definition.id ? getRun()?.[id] : null;
  const kind = () => preset()?.rules.kind === 'vehicle' || !preset() && el('customKind').value === 'vehicle' ? 'vehicle' : 'person';
  const busy = () => locked(data());
  const close = () => el('overlay')?.classList.remove('active');
  const button = (key,title) => `<button type="button" class="bsim-action-btn" id="${id}-${key}">${esc(title)}</button>`;
  const number = (path,value,title,minimum=0,maximum=10000) => `<label class="inv-edit-row"><span>${esc(title??labels[path.split('.').at(-1)]??path)}</span><input class="inv-edit-input" type="number" step="1" min="${minimum}" max="${maximum}" data-path="${esc(path)}" value="${esc(value)}"></label>`;
  const text = (path,value,title) => `<label class="inv-edit-row"><span>${esc(title)}</span><input class="inv-edit-input" data-path="${esc(path)}" value="${esc(value)}" maxlength="100"></label>`;
  const check = (path,value,title) => `<label class="bsim-checkbox"><input type="checkbox" data-path="${esc(path)}" ${value?'checked':''}>${esc(title)}</label>`;
  const selectedOption = (values,current) => values.map(value=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(value)}</option>`).join('');
  function unitForm(unit, hero=false) {
    let html = hero ? ['hp','maxHp','defenseClass','gunnery',...(unit.kind==='person'?['armour','driving','mechanic','prestige','wealth']:[])].map(key=>number(key,unit[key]??0)).join('') : '';
    if (unit.kind==='person') {
      html += text('weapon.name',unit.weapon.name,'Weapon') + number('weapon.bonus',unit.weapon.bonus??0,'To-hit bonus',-100);
      html += unit.weapon.flatDamage!=null ? number('weapon.flatDamage',unit.weapon.flatDamage,'Fixed damage') : number('weapon.damageDice',unit.weapon.damageDice,'Damage dice',1,10);
      return html;
    }
    html += ['handling',...(hero?['driving']:['controlRoll']),'driverHp','driverArmour','gunnerHp','gunnerArmour','gunnerGunnery',
      'computerBonus','cargo',...(hero?['smokeCharges','grenades']:[])].filter(key=>key!=='handling'||unit.handling!=null)
      .map(key=>number(key,unit[key]??0,undefined,key==='handling'?-100:0)).join('');
    html += number('powerPlant.boxes',unit.powerPlant.boxes,'Power plant boxes');
    if (hero) html += check('gunnerSeat',unit.gunnerSeat,'Second vehicle firing station') + check('ramplate',unit.ramplate,'Ramplate');
    html += unit.weapons.map((w,index)=>`<details><summary>${esc(w.name)} (${esc(w.direction)})</summary>${text(`weapons.${index}.name`,w.name,'Weapon')}
      <label class="inv-edit-row">Facing<select class="inv-edit-input" data-path="weapons.${index}.direction">${selectedOption(['front','rear','left','right','turret'],w.direction)}</select></label>
      ${number(`weapons.${index}.boxes`,w.boxes,'Boxes')}${number(`weapons.${index}.bonus`,w.bonus??0,'To-hit bonus',-100)}
      ${number(`weapons.${index}.damageDice`,w.damageDice??1,'Damage dice',1,10)}
      ${number(`weapons.${index}.ammo`,w.ammo??w.shots??(/machine|vulcan|paint|oil/i.test(w.name)?20:10),'Shots left')}
      ${text(`weapons.${index}.linkedGroup`,w.linkedGroup??'','Linked group (blank for separate)')}
      ${check(`weapons.${index}.oneShot`,w.oneShot||w.shots!=null,'Single-use weapon')}</details>`).join('');
    return html;
  }
  function readForm(container,source) {
    const result = clone(source);
    for (const input of container.querySelectorAll('[data-path]')) {
      const path = input.dataset.path.split('.'), key = path.pop(); let object = result;
      for (const part of path) object = object[part];
      if (input.type==='checkbox') object[key]=input.checked;
      else if (input.type==='number') {
        const value=Number(input.value);
        if (!input.value.trim()||!Number.isSafeInteger(value)||value<Number(input.min)||value>Number(input.max)) throw new RangeError('Check '+(labels[key]??key));
        object[key]=value;
      } else object[key]=input.value.trim();
    }
    return result;
  }
  function freshVehicle(game,profile=getVehicles()[0]) {
    const person=game?.character??blankPerson();
    return {...clone(profile),maxHp:profile.repairableMaximumHp??profile.maxHp,ramplate:!!profile.ramPlate,kind:'vehicle',name:'Your '+profile.name,key:'player',driving:person.driving,gunnery:person.gunnery,
      driverHp:person.hp,driverArmour:person.armour,gunnerHp:0,gunnerGunnery:1,gunnerArmour:0,smokeCharges:0,grenades:0,cargo:0};
  }
  function setupForms(game) {
    settingUp=true;
    modelHero = kind()==='person' ? clone(game?.character??blankPerson()) : clone(game?.vehicle??freshVehicle(game));
    if (modelHero.kind==='vehicle'&&game?.character) Object.assign(modelHero,{driverHp:game.character.hp,driverArmour:game.character.armour,driving:game.character.driving,gunnery:game.character.gunnery});
    el('hero').innerHTML=unitForm(modelHero,true);
    const entry=preset();
    modelEnemies=clone(game?.setup?.context===el('context').value&&game?.setup?.opponents?.length?game.setup.opponents:entry?.enemies??[customEnemy(el('customKind').value)]);
    editor.set(modelEnemies); editor.fixCount(!!entry);
    enemyForms();
    el('customKindRow').hidden=!!entry;
    el('vehicleRow').hidden=kind()!=='vehicle';
    el('contextNote').textContent=entry?.note??'Preset opponents are editable. Custom fights use your own opponents.';
    settingUp=false;
  }
  function enemyForms() {
    const rows=editor.snapshot();
    el('components').innerHTML=rows.map((row,index)=>`<details data-enemy="${index}"><summary>${esc(row.displayName||row.name||'Opponent')} equipment</summary>
      <p>${esc(row.driverHpBasis??'')}</p>${unitForm({...customEnemy(row.kind??el('customKind').value),...row})}</details>`).join('');
    modelEnemies=rows.map(row=>({...customEnemy(row.kind??el('customKind').value),...row}));
  }
  function opponents() {
    return editor.read().map((row,index)=>{
      const container=el('components').querySelector(`[data-enemy="${index}"]`);
      const details=container?readForm(container,modelEnemies[index]):modelEnemies[index]??customEnemy(el('customKind').value);
      return {...details,...Object.fromEntries(fields.map(field=>[field.key,row[field.key]])),name:row.displayName||row.name,displayName:row.displayName,key:row.key??'custom-'+index};
    });
  }
  function snapshot(game) {
    game.setup={context:el('context').value,customKind:el('customKind').value,advancedAmmo:el('advancedAmmo').checked,
      sustainedFire:el('sustainedFire').checked,opponents:opponents()};
    const hero=validateCombatant(readForm(el('hero'),modelHero));
    if (hero.kind==='person') game.character=hero; else game.vehicle=hero;
    return hero;
  }
  function update(apply) {
    if (shownRun!==getRun()||!el('overlay').classList.contains('active')||Number(getBookId())!==definition.id) return;
    const run=getRun(),before=data();
    try {
      const game=clone(before??{character:blankPerson(),vehicle:null,setup:{},fight:null,carried:{},history:[],log:[]});
      const previousFight=game.fight;
      apply(game);
      if (run!==getRun()||data()!==before||Number(getBookId())!==definition.id) return;
      if (game.fight&&game.fight!==previousFight) {
        const fight=game.fight;
        game.log.push(...fight.events); fight.events=[];
        if (fight.hero.kind==='vehicle') {
          game.vehicle=clone(fight.hero);
          game.character={...(game.character??blankPerson()),hp:fight.hero.driverHp,armour:fight.hero.driverArmour,gunnery:fight.hero.gunnery,driving:fight.hero.driving};
        } else game.character=clone(fight.hero);
        if (fight.baseSection) game.carried[fight.baseSection]=clone(fight);
        if (['win','loss','escaped'].includes(fight.status)&&!fight.recorded) {
          fight.recorded=true;game.history.push({enemy:fight.encounter,outcome:fight.status,ts:Math.max(Date.now(),(game.history.at(-1)?.ts??0)+1)});
        }
      }
      game.log=game.log.slice(-100);game.history=game.history.slice(-50);
      run[id]=game;saveState();render();
    } catch(error) { showAlert(error.message||'Check the simulator inputs.'); }
  }
  function start(game) {
    if (locked(game)) return;
    const hero=snapshot(game),entry=preset();
    const selected=entry?{...clone(entry),enemies:opponents()}:{label:opponents().map(e=>e.name).join(' / '),section:null,enemies:opponents(),
      rules:{kind:el('customKind').value==='vehicle'?'vehicle':'personal',playerFacing:['front','rear','left','right','turret'],enemyFacing:['front']}};
    const prior=entry&&game.carried[entry.baseSection];
    if (prior&&['fighting','paused','branch'].includes(prior.status)) {
      game.fight=resumeFight(prior,entry);
    } else {
      if (entry?.rules.resumePrior) throw new RangeError('Resume the earlier fight first; this entry must retain its damage.');
      game.fight=startFight(hero,selected,game.setup);
    }
  }
  function render() {
    if (!el('overlay')) return;
    if (Number(getBookId())!==definition.id||!getRun()) {close();shownRun=undefined;return;}
    const game=data();
    if (shownRun!==getRun()) {
      shownRun=getRun();el('context').value=game?.setup.context??'';el('customKind').value=game?.setup.customKind??'vehicle';
      el('advancedAmmo').checked=game?.setup.advancedAmmo??false;el('sustainedFire').checked=game?.setup.sustainedFire??false;
      setupForms(game);
    }
    const fight=game?.fight,active=locked(game);
    editor.lock(active);el('setup').disabled=active;el('start').disabled=active;
    el('step').disabled=fight?.status!=='fighting';el('hold').disabled=fight?.status!=='fighting';el('cancel').disabled=!active&&fight?.status!=='paused';
    el('replaceRow').hidden=fight?.status!=='awaitingDriver';
    if (!active) {
      modelHero=kind()==='person'?clone(game?.character??modelHero):clone(game?.vehicle??modelHero);
      el('hero').innerHTML=unitForm(modelHero,true);
    }
    const target=el('target').value;
    el('target').innerHTML=fight?.enemies.map((enemy,i)=>combatantOut(enemy,fight.rules)?'':`<option value="${i}">${esc(enemy.displayName||enemy.name)} (${enemy.hp} HP)</option>`).join('')??'';
    if ([...el('target').options].some(option=>option.value===target)) el('target').value=target;
    const checked=new Set([...el('weapons').querySelectorAll('input:checked')].map(input=>input.value));
    el('weapons').innerHTML=fight?.hero.kind==='vehicle'?fight.hero.weapons.map((weapon,i)=>`<label class="bsim-checkbox"><input type="checkbox" value="${i}" ${checked.has(String(i))?'checked':''} ${weapon.boxes>0&&(fight.rules.playerFacing??[]).includes(weapon.direction)?'':'disabled'}>${esc(weapon.name)} (${esc(weapon.direction)}, ${weapon.boxes} boxes${weapon.oneShot||fight.options.advancedAmmo?`, ${weapon.ammo??'∞'} shots`:''})</label>`).join(''):'';
    el('smokeRow').hidden=!fight?.rules.canUseSmoke;el('grenadeRow').hidden=!fight?.rules.gunnerGrenades;
    el('smoke').checked=false;el('grenade').checked=false;
    for (const key of ['foam','smokeEscape','grenadeEscape','escape','continue','leave','ram']) {
      el(key).hidden=!fight?.rules.tactics?.[key];el(key).disabled=!(fight?.status==='fighting'||fight?.status==='paused'&&['continue','leave'].includes(key));
    }
    el('repair').disabled=active||!game?.vehicle;el('apply').disabled=active;
    el('status').textContent=fight?`${fight.encounter}: ${fight.status} · turn ${fight.round}${fight.section?' · continue at §'+fight.section:''}`:'Ready. Allocate your ten starting skill points, or enter your current stats.';
    el('units').innerHTML=fight?[fight.hero,...fight.enemies].map(unit=>`<div class="bsim-status">${esc(unit.displayName||unit.name)}: ${unit.hp} HP / DC ${unit.defenseClass}${unit.kind==='vehicle'?` · driver ${unit.driverHp} HP · plant ${unit.powerPlant.boxes} boxes`:''}</div>`).join(''):'';
    el('log').innerHTML=(game?.log??[]).slice(-100).reverse().map(line=>`<div>${esc(line)}</div>`).join('');
    el('history').innerHTML=(game?.history??[]).slice(-50).reverse().map(item=>`<div>${esc(item.enemy)} · ${esc(item.outcome)}</div>`).join('');
    const component=el('repairPart').value;
    el('repairPart').innerHTML='<option value="hp">General HP</option><option value="plant">Power plant</option>'+(game?.vehicle?.weapons??[]).map((w,i)=>`<option value="${i}">${esc(w.name)} (${esc(w.direction)})</option>`).join('');
    if ([...el('repairPart').options].some(o=>o.value===component)) el('repairPart').value=component;
  }
  function open() {
    if (!getRun()) {showAlert(t('battlesim.no_active_playthrough'));return;}
    render();el('overlay').classList.add('active');
  }
  function init() {
    if (el('overlay')) return;
    const overlay=document.createElement('div');overlay.id=id+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${esc(t(definition.i18nPrefix+'.title'))}</span><button class="inv-close-btn" id="${id}-close" aria-label="${esc(t('btn.close'))}">&times;</button></div>
      <div class="bsim-body"><div class="bsim-col bsim-col-left"><p>Attack with 2d6 + Gunnery + weapon and targeting bonuses, strictly above Defense Class. Vehicle damage dice showing 1 also cause special damage and a Control Roll. Basic ammunition is unlimited except single-use weapons. Setup changes stay in this simulator.</p>
      <fieldset id="${id}-setup"><label class="inv-edit-row">Encounter<select class="inv-edit-input" id="${id}-context"><option value="">Custom fight</option>${getRoster().map(entry=>`<option value="${esc(entry.section)}">${esc(entry.label)}</option>`).join('')}</select></label>
      <label class="inv-edit-row" id="${id}-customKindRow">Combat<select class="inv-edit-input" id="${id}-customKind"><option value="vehicle">Vehicle</option><option value="person">On foot</option></select></label><p id="${id}-contextNote"></p>
      <div id="${id}-vehicleRow"><label class="inv-edit-row">Vehicle profile<select class="inv-edit-input" id="${id}-vehicleProfile">${getVehicles().map((vehicle,i)=>`<option value="${i}">${esc(vehicle.name)}</option>`).join('')}</select></label>${button('loadVehicle','Use vehicle profile')}</div>
      <details><summary>Your current stats and weapons</summary><p>Starting skills: ten points across Driving, Gunnery, Mechanic, Prestige and Wealth, at least one each. Armour is tracked separately from personal HP. Enter a gunner only when one is aboard; gunner Driving is requested if they must take over.</p><div id="${id}-hero"></div>${button('apply','Save stats')}</details>
      <div id="${id}-opponents"></div><details><summary>Opponent components and weapons</summary><div id="${id}-components"></div></details>
      <label class="bsim-checkbox"><input type="checkbox" id="${id}-advancedAmmo">Advanced ammunition</label><label class="bsim-checkbox"><input type="checkbox" id="${id}-sustainedFire">Sustained-fire bonus</label></fieldset>
      ${button('start','Start / resume fight')}
      <label class="inv-edit-row">Target<select class="inv-edit-input" id="${id}-target"></select></label><div id="${id}-weapons"></div>
      <label class="bsim-checkbox" id="${id}-smokeRow"><input type="checkbox" id="${id}-smoke">Gunner: smoke (+3 DC this turn)</label><label class="bsim-checkbox" id="${id}-grenadeRow"><input type="checkbox" id="${id}-grenade">Gunner: throw a hand grenade</label>
      <div class="bsim-btn-row">${button('step','Play turn')}${button('hold','Hold fire')}${button('cancel','End fight')}</div>
      <div class="bsim-btn-row">${[['foam','Apply fireproof foam'],['smokeEscape','Smoke escape'],['grenadeEscape','Drop grenade'],['escape','Attempt escape'],['continue','Fight on'],['leave','Leave'],['ram','Ram']].map(([key,title])=>button(key,title)).join('')}</div>
      <div id="${id}-replaceRow"><label class="inv-edit-row">Replacement driver’s Driving<input class="inv-edit-input" type="number" min="0" max="100" id="${id}-replacementDriving"></label>${button('replace','Take over driving')}</div>
      <details><summary>Repairs between fights</summary><p>Use only the repair allowance and time specified by your section. Computers, armour and people cannot be repaired here.</p><label class="inv-edit-row">Component<select class="inv-edit-input" id="${id}-repairPart"></select></label>
      <label class="inv-edit-row">Mechanic<input type="number" class="inv-edit-input" min="0" max="100" value="1" id="${id}-mechanic"></label><label class="inv-edit-row">Repair allowance<input type="number" class="inv-edit-input" min="1" max="100" value="1" id="${id}-repairAmount"></label>${button('repair','Roll repair')}</details>
      </div><div class="bsim-col bsim-col-right"><div id="${id}-status" class="bsim-status"></div><div id="${id}-units"></div><details class="bsim-history"><summary>Battle history</summary><div class="bsim-history-list" id="${id}-history"></div></details><div class="bsim-log" id="${id}-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    editor=createOpponentEditor({document,id,t,fields,presets:getRoster().flatMap(entry=>entry.enemies),onSelect:()=>{if(!settingUp)enemyForms();}});
    el('opponents').appendChild(editor.element);
    editor.element.addEventListener('click',()=>{if(!busy()&&editor.snapshot().length!==modelEnemies.length)enemyForms();});
    const launch=document.createElement('button');launch.id=id+'-btn';launch.textContent=t('battlesim.title');launch.style.display='none';getButtonRow().appendChild(launch);launch.addEventListener('click',open);
    el('close').addEventListener('click',close);
    let backdrop=false;overlay.addEventListener('mousedown',event=>{backdrop=event.target===overlay;});
    overlay.addEventListener('click',event=>{if(backdrop&&event.target===overlay)close();});
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();}});
    registerShortcut({button:launch,overlay,open,close});
    for (const key of ['context','customKind']) el(key).addEventListener('change',()=>{if(!busy())setupForms(data());});
    el('loadVehicle').addEventListener('click',()=>{
      const run=getRun(),before=data();
      const apply=()=>{if(run!==getRun()||before!==data()||busy()||Number(getBookId())!==definition.id)return;
        modelHero=freshVehicle(before,getVehicles()[Number(el('vehicleProfile').value)]);el('hero').innerHTML=unitForm(modelHero,true);};
      if (before?.vehicle) showConfirm('Replace the simulator vehicle with this profile? Existing vehicle damage will be replaced.',apply);else apply();
    });
    el('apply').addEventListener('click',()=>update(game=>{if(!locked(game))snapshot(game);}));
    el('start').addEventListener('click',()=>update(start));
    for(const key of ['step','hold'])el(key).addEventListener('click',()=>update(game=>{
      game.fight=fightRound(game.fight,{target:Number(el('target').value),weapons:key==='hold'?[]:[...el('weapons').querySelectorAll('input:checked')].map(input=>Number(input.value)),smoke:el('smoke').checked,grenade:el('grenade').checked});
    }));
    for(const key of ['foam','smokeEscape','grenadeEscape','escape','continue','leave','ram']) el(key).addEventListener('click',()=>update(game=>{game.fight=tactic(game.fight,key,{target:Number(el('target').value)});}));
    el('cancel').addEventListener('click',()=>{
      const run=getRun(),fight=data()?.fight;
      showConfirm('End this fight? Current damage will be kept.',()=>{if(run===getRun()&&data()?.fight===fight)update(game=>{game.fight={...game.fight,status:'ended',events:['Fight ended; current damage retained.']};});});
    });
    el('replace').addEventListener('click',()=>update(game=>{
      if(!el('replacementDriving').value.trim())throw new RangeError('Enter the replacement driver’s Driving.');
      game.fight=replaceDriver(game.fight,Number(el('replacementDriving').value));
    }));
    el('repair').addEventListener('click',()=>update(game=>{
      if(locked(game))return;
      for(const key of ['mechanic','repairAmount'])if(!el(key).value.trim())throw new RangeError('Enter the repair values.');
      const result=repairVehicle(game.vehicle,el('repairPart').value==='hp'||el('repairPart').value==='plant'?el('repairPart').value:Number(el('repairPart').value),Number(el('mechanic').value),undefined,Number(el('repairAmount').value));
      game.vehicle=result.unit;game.log.push(`Repair roll ${result.roll}: ${result.success?'success':'failed'}.`);
      if(game.fight?.hero.kind==='vehicle')game.fight.hero=clone(game.vehicle);
    }));
  }
  return {init,render,setVisible(value){if(el('btn'))el('btn').style.display=value?'':'none';if(!value)close();}};
}
