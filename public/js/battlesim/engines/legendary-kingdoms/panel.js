import { LEGENDARY_SKILLS, legendarySkillCheck, legendaryHeal, newValleySkullcracker } from './character.js';
import { VALLEY_FIGHTS, VALLEY_ARMIES, VALLEY_NAVAL, startValleyFight, startValleyArmy, startValleyNaval } from './valley.js';
import { legendaryCanAct, legendaryPlayerAttack, legendarySkipAttack, legendaryPlayerSpell,
  legendaryEnemyAttack, legendaryAssignDamage, legendaryFlee, legendaryDrinkPotion,
  legendaryTakeGuardWeapon, legendaryTommulReward } from './combat.js';
import { activeLegendaryEnemy } from './enemy-actions.js';
import { legendaryArmyStep, legendaryArmyEffect } from './army.js';
import { legendaryNavalAttack, legendaryWarpWood, legendaryTilt } from './naval.js';
import { VALLEY_SPELLS, learnLegendarySpell, forgetLegendarySpell, drainLegendarySpell,
  rechargeLegendarySpells } from './spells.js';
import { legendaryEscape as escape, legendarySetupHTML as defaultSetupHTML, wireLegendarySetup as defaultWireSetup, readLegendarySetup as defaultReadSetup,
  renderLegendaryParty, readLegendaryParty } from './party-form.js';

export function createLegendaryPanel({ document, t, getRun, getBookId, saveState, showAlert, showConfirm,
  getButtonRow, registerShortcut=()=>{} }, configuration = {}) {
  const {bookId = 689,stateKey = 'sim'+bookId,i18nPrefix = 'battlesim'+bookId,
    fights = VALLEY_FIGHTS,armies = VALLEY_ARMIES,naval = VALLEY_NAVAL,
    startFight = startValleyFight,startArmy = startValleyArmy,startNaval = startValleyNaval,
    spells = VALLEY_SPELLS,partySetup} = configuration;
  const ID=stateKey,tk=(key,params)=>t(i18nPrefix+'.'+key,params);
  const LEGENDARY_SPELLS = spells;
  const checkBoostSpells = {survival:'wolfSpirit',lore:'wisdom',charisma:'silverTongue',...configuration.checkBoostSpells};
  const legendarySetupHTML = (id,translate) => defaultSetupHTML(id,translate,partySetup);
  const wireLegendarySetup = (id,element) => defaultWireSetup(id,element,partySetup);
  const readLegendarySetup = (element,readNumber) => defaultReadSetup(element,readNumber,partySetup);
  const el=key=>document.getElementById(ID+'-'+key);
  const busy=game=>game?.fight?.status==='active';
  let shownRun;
  let extension;
  function data() {
    if (Number(getBookId())!==bookId) return null;
    const run=getRun();
    return run ? run[ID] ||= {party:[],silver:0,ship:null,units:[],fight:null,history:[],log:[],setup:{}} : null;
  }
  const supported=game=>game && ['party','units','history','log'].every(key=>Array.isArray(game[key])) &&
    (!game.fight || game.fight.rulesVersion===1);
  function number(key) {
    const raw=el(key).value.trim(),value=Number(raw);
    if (!raw || !Number.isSafeInteger(value)) throw new RangeError('Invalid integer');
    return value;
  }
  function close() {el('overlay')?.classList.remove('active');}
  function open() {
    if (!data()) {showAlert(t('battlesim.no_active_playthrough'));return;}
    render();el('overlay').classList.add('active');el('close').focus();
  }
  function title(fight) {
    if (fight.kind==='army') return tk('army.'+fight.rules.section);
    if (fight.kind==='naval') return fight.enemy.name;
    return [...new Set(fight.enemies.map(enemy=>enemy.name))].join(' / ');
  }
  function sync(game) {
    const fight=game.fight;
    if (!fight) return;
    if (fight.kind==='personal') game.party=structuredClone(fight.party);
    if (fight.kind==='naval') game.ship=structuredClone(fight.ship);
    if (fight.kind==='army') {
      for (const unit of [...fight.player.flat().filter(Boolean),...fight.routed.player]) {
        const index=game.units.findIndex(other=>other.uid===unit.uid);
        if (index>=0) game.units[index]=structuredClone(unit);
      }
    }
    if (!fight.recorded && ['won','lost'].includes(fight.status)) {
      if (fight.status === 'lost' && fight.rules.halveSilverOnLoss && Number.isSafeInteger(fight.silver))
        game.silver = fight.silver;
      fight.recorded=true;
      game.history.push({enemy:title(fight),outcome:fight.status==='won'?'win':'loss',
        ts:Math.max(Date.now(),(game.history.at(-1)?.ts??0)+1)});
    }
  }
  function action(update) {
    const run=getRun(),original=data();
    if (!supported(original)) return;
    try {
      const next=structuredClone(original);
      update(next);sync(next);
      if (run!==getRun() || original!==data() || Number(getBookId())!==bookId) return;
      next.log=next.log.slice(-60);run[ID]=next;saveState();render();
    } catch (_) {showAlert(tk('invalid'));}
  }
  function confirm(update,message) {
    const run=getRun(),original=data();
    showConfirm(tk(message),()=>{if (run===getRun() && original===data()) action(update);});
  }
  const button=key=>`<button class="bsim-action-btn" type="button" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const check=key=>`<label class="bsim-checkbox" id="${ID}-${key}-row"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  const field=(key,value=0,min=0,max=1000000)=>`<label class="inv-edit-row"><span class="inv-edit-label">${escape(tk(key))}</span>`+
    `<input class="inv-edit-input" type="number" id="${ID}-${key}" value="${value}" min="${min}" max="${max}" step="1"></label>`;
  const select=(key,options=[])=>`<label class="inv-edit-row"><span class="inv-edit-label">${escape(tk(key))}</span>`+
    `<select class="inv-edit-input" id="${ID}-${key}">${options.map(([value,label])=>`<option value="${escape(value)}">${escape(label)}</option>`).join('')}</select></label>`;
  function options(key,rows) {
    const input=el(key),previous=input.value;
    const selected=input.multiple?new Set([...input.selectedOptions].map(option=>option.value)):null;
    input.innerHTML=rows.map(([value,label])=>`<option value="${escape(value)}">${escape(label)}</option>`).join('');
    if (selected) for (const option of input.options) option.selected=selected.has(option.value);
    else if (rows.some(([value])=>String(value)===previous)) input.value=previous;
  }
  function selectedIndices(key) {return [...el(key).selectedOptions].map(option=>Number(option.value));}
  function report(game,fight,kind) {game.fight={...fight,kind};}
  function contextOptions() {
    const mode=el('mode').value;
    if (mode==='personal') return fights.map(f=>[f.section,(f.dynamic?tk('enchanted'):f.enemies[0].name)+' ('+f.section+')']);
    if (mode==='naval') return Object.entries(naval).map(([section,f])=>[section,f.name+' ('+section+')']);
    return Object.keys(armies).map(section=>[section,tk('army.'+section)+' ('+section+')']);
  }
  function contextChanged() {options('context',contextOptions());render();}
  function spellOptions(game) {
    if (!game) {options('spell',[]);return;}
    const index=Number(el('caster').value),caster=game.party[index];
    const scope=busy(game)?game.fight.kind==='personal'?'combat':game.fight.kind:null;
    options('spell',(caster?.spells??[]).filter(spell=>!scope||LEGENDARY_SPELLS[spell.id].scopes.includes(scope))
      .map(spell=>[spell.id,tk('spell.'+spell.id)+(spell.charged?'':' - '+tk('drained'))]));
    const friendly=['armourOfHeaven','soothingTouch'].includes(el('spell').value);
    const fight=game.fight;
    const rows=friendly?game.party.flatMap((hero,index)=>hero.health>0&&(!busy(game)||fight.kind!=='personal'||fight.participants.includes(index))?[[index,hero.name]]:[]):
      fight?.kind==='personal'?fight.enemies.flatMap((enemy,index)=>activeLegendaryEnemy(fight,index)?[[index,enemy.name]]:[]):[];
    options('spellTarget',rows);options('spellTarget2',rows);
    if (el('spellTarget2').value===el('spellTarget').value&&rows.length>1)
      el('spellTarget2').value=String(rows.find(([value])=>String(value)!==el('spellTarget').value)[0]);
  }
  function render() {
    if (!el('overlay')) return;
    const game=data();
    if (!game) {shownRun=undefined;close();return;}
    if (!supported(game)) {
      el('status').textContent=tk('unsupported');
      el('personalActions').hidden=true;el('strategicActions').hidden=true;
      for (const input of el('overlay').querySelectorAll('input,select,button')) if (input!==el('close')) input.disabled=true;
      return;
    }
    if (shownRun!==getRun()) {
      if (shownRun) close();shownRun=getRun();
      el('mode').value=game.setup.mode??'personal';
      options('context',contextOptions());el('context').value=String(game.setup.context??el('context').value);
    }
    const fight=game.fight,active=busy(game),blocked=!supported(game);
    renderLegendaryParty(el('party'),game.party,ID,tk,active||blocked,document);
    el('partyStatus').textContent=game.party.map(hero=>`${hero.name}: ${tk('health')} ${hero.health}/${hero.maxHealth}`).join('\n');
    for (const key of ['mode','context','create','applyParty','applySilver','addUnit','applyShip','codes']) el(key).disabled=active||blocked;
    for (const input of el('setup').querySelectorAll('input,select')) input.disabled=active||blocked;
    const living=game.party.flatMap((hero,index)=>hero.health>0?[[index,hero.name]]:[]);
    if (el('recruitSlot')) {
      options('recruitSlot',game.party.map((hero,index)=>[index,hero.name]));
      el('recruitSkullcracker').disabled=active||!game.party.length||game.party.some(hero=>hero.profileId==='skullcracker');
      el('recruitSlot').disabled=active;
    }
    const actorRows=fight?.kind==='personal'&&active ? living.filter(([index])=>legendaryCanAct(fight,index)) : living;
    options('actor',actorRows);
    let recipients=fight?.kind==='personal'?living.filter(([index])=>fight.participants.includes(index)):living;
    if(active&&fight.kind==='personal'&&fight.pending?.forcedMember!==undefined)
      recipients=recipients.filter(([index])=>index===fight.pending.forcedMember);
    else if(active&&fight.kind==='personal'&&fight.pending?.distinct&&recipients.length>1)
      recipients=recipients.filter(([index])=>index!==fight.enemyRecipients[fight.pending.enemyIndex]);
    options('recipient',configuration.recipientRows?.({game,fight,rows:recipients})??recipients);
    el('members').multiple=true;options('members',living);el('members').size=Math.min(4,Math.max(1,living.length));
    options('checkMember1',living);options('checkMember2',[['',tk('none')],...living]);
    options('cursedMember',living);options('stealthHero',living);
    options('caster',living.filter(([index])=>game.party[index].spellcaster));spellOptions(game);
    if (fight?.kind==='personal') options('target',fight.enemies.flatMap((enemy,index)=>activeLegendaryEnemy(fight,index)?[[index,enemy.name]]:[]));
    else options('target',[]);
    el('start').disabled=active||blocked||!game.party.length;
    el('personalActions').hidden=!active||fight.kind!=='personal';
    el('strategicActions').hidden=!active||fight.kind==='personal';
    for (const key of ['attack','skip','cast']) el(key).disabled=!active||fight?.kind!=='personal'||fight.phase!=='player';
    const loot=fight?.kind==='personal'&&['active','won'].includes(fight.status)&&fight.rules.special==='guardWeapon';
    const reward=fight?.kind==='personal'&&fight.rules.section===239&&fight.round<=3&&fight.enemies[0].health===0&&
      !fight.tommulRewardTaken&&fight.party[fight.participants[0]].health>0;
    el('lootActions').hidden=!loot&&!reward;
    el('takeWeapon').hidden=!loot;el('tommulReward').hidden=!reward;
    el('takeWeapon').disabled=!loot||fight.enemies.filter(enemy=>enemy.health===0).length<=fight.guardWeaponsTaken;
    el('takeWeapon').disabled ||= !!fight?.guardWeapons?.[Number(el('recipient').value)];
    el('tommulReward').disabled=!reward;
    const recipientRow=el('recipient').closest('label');
    if(active&&fight.kind==='personal') el('assign').before(recipientRow);
    else if(loot) el('lootActions').prepend(recipientRow);
    el('enemyRoll').disabled=!active||fight?.kind!=='personal'||fight.phase!=='enemy'||!!fight.pending||!!fight.pendingChoice;
    el('assign').disabled=!active||fight?.kind!=='personal'||!fight.pending;
    el('flee').disabled=!active||fight?.kind!=='personal'||fight.phase!=='player'||!!fight.acted.length||!fight.rules.flee;
    el('potion').disabled=!active||fight?.kind!=='personal';
    const selectedCaster=Number(el('caster').value),selectedSpell=game.party[selectedCaster]?.spells?.find(spell=>spell.id===el('spell').value);
    el('cast').disabled ||= !el('caster').value||!selectedSpell?.charged||!legendaryCanAct(fight,selectedCaster);
    el('spellTarget2').closest('label').hidden=!['poisonStream','whipsnake'].includes(el('spell').value);
    const eligibleCount=active&&fight.kind==='personal'?fight.participants.filter(index=>fight.party[index].health>0&&
      (fight.rules.heroArrivalRounds?.[index]??1)<=fight.round&&
      !(fight.rules.controlledMember===index&&fight.enemies[fight.rules.controllerIndex].health>0)).length:0;
    const lastOnly=active&&fight.kind==='personal'&&((fight.pending?.distinct&&eligibleCount===1)||
      (fight.pending?.distinctGroup&&eligibleCount<fight.pending.requiredRecipients));
    el('sameRecipient-row').hidden=!lastOnly;
    if (!lastOnly) el('sameRecipient').checked=false;
    el('cancel').disabled=!active||blocked;
    el('castStrategy').disabled=!active||fight.kind==='personal'||!el('caster').value;
    el('castAdventure').disabled=active||blocked||!selectedSpell?.charged||
      !LEGENDARY_SPELLS[selectedSpell?.id]?.scopes.includes('adventure')||Object.values(checkBoostSpells).includes(selectedSpell?.id);
    if(active&&fight.kind==='army') {
      options('armyPosition',fight.enemy[number('armyTarget')]?.flatMap((unit,index)=>unit?[[index,tk(index===0?'front':'support')]]:[])??[]);
    }
    el('castStrategy').disabled ||= !selectedSpell?.charged || (fight?.kind==='army'&&(fight.zone!==0||!el('armyPosition').value));
    if (configuration.limitArmyCasters && fight?.kind==='army')
      el('castStrategy').disabled ||= fight.position>0 || fight.armyCasterRounds?.[selectedCaster]===fight.round;
    el('strategyStep').disabled=!active||fight.kind==='personal';
    for (const key of ['learn','forget','recharge','checkRoll','boostCheck']) el(key).disabled=active||blocked||!game.party.length;
    if (document.activeElement!==el('silver')) el('silver').value=game.silver;
    if (game.ship) for (const [key,value] of [['shipName',game.ship.name],['shipFighting',game.ship.fighting],['shipHealth',game.ship.health]])
      if (document.activeElement!==el(key)) el(key).value=value;
    const mode=el('mode').value;
    el('shipSetup').hidden=mode!=='naval';el('armySetup').hidden=mode!=='army';
    el('personalSetup').hidden=mode!=='personal';
    for (const container of ['personalSetup','shipSetup','armySetup']) for (const input of el(container).querySelectorAll('input,select')) input.disabled=active||blocked;
    el('checkResult').textContent=game.check?tk('checkEvent',{successes:game.check.successes,required:game.check.required}):'';
    el('status').textContent=fight?[tk('status.'+fight.status),tk('round',{round:fight.round}),
      ...(fight.kind==='personal'?fight.enemies.map(enemy=>`${enemy.name}: ${enemy.health} ${tk('health')}`):
        fight.kind==='naval'?[`${fight.ship.name}: ${fight.ship.health}`,`${fight.enemy.name}: ${fight.enemy.health}`]:
        fight.player.map((zone,index)=>tk('zone.'+index)+': '+zone.filter(Boolean).map(unit=>`${unit.name} (${unit.strength}/${unit.morale})`).join(' / '))),
      ...(fight.destination?[tk('destination',{section:fight.destination})]:[])].join('\n'):'';
    el('phase').textContent=active&&fight.kind==='personal'?tk(fight.pending?'assignPrompt':fight.phase==='player'?'playerPrompt':'enemyPrompt'):'';
    el('history').innerHTML=game.history.slice(-30).reverse().map(row=>`<div>${escape(row.enemy)} - ${escape(tk('status.'+(row.outcome==='win'?'won':'lost')))}</div>`).join('');
    el('log').innerHTML=[...game.log,...(fight?.log??[]).map(event=>eventText(event,game))].slice(-60).map(line=>`<div>${escape(line)}</div>`).join('');
    el('log').scrollTop=el('log').scrollHeight;
    const units=game.units.filter(unit=>!unit.routed);
    for (let i=0;i<6;i++) options('formation-'+i,[['',tk('none')],...units.map(unit=>[unit.uid,`${unit.name} (${unit.strength}/${unit.morale})`])]);
    el('units').textContent=game.units.map(unit=>`${unit.name}: ${unit.strength}/${unit.morale}${unit.routed?' - '+tk('routed'):''}`).join('\n');
    options('editUnit',game.units.map(unit=>[unit.uid,unit.name+(unit.routed?' - '+tk('routed'):'')]));
    const selectedUnit=game.units.find(unit=>unit.uid===el('editUnit').value);
    if(selectedUnit&&!el('unitEditor').contains(document.activeElement)) {
      el('editUnitName').value=selectedUnit.name;el('editUnitStrength').value=selectedUnit.strength;el('editUnitMorale').value=selectedUnit.morale;
    }
    el('updateUnit').disabled=active||blocked||!selectedUnit;
    extension?.render?.(game);
  }
  function eventText(event,game) {
    const hero=game.party[event.memberIndex]?.name??'',enemy=game.fight?.enemies?.[event.enemyIndex??event.targetIndex]?.name??'';
    if (game.fight?.kind==='naval' && ['shipAttack','enemyAttack'].includes(event.type))
      return tk('attackEvent',{name:event.type==='shipAttack'?game.fight.ship.name:game.fight.enemy.name,
        target:event.type==='shipAttack'?game.fight.enemy.name:game.fight.ship.name,damage:event.damage,dice:event.dice.join(' + ')});
    if (game.fight?.kind==='army' && event.type===undefined)
      return tk('armyEvent',{zone:tk('zone.'+event.zone),player:event.playerScore,enemy:event.enemyScore});
    if (event.type==='playerAttack'||event.type==='spellAttack'||event.type==='surpriseAttack'||event.type==='yuYanAttack')
      return tk('attackEvent',{name:event.type==='yuYanAttack'?'Yu Yan':hero,target:enemy,damage:event.damage,dice:(event.dice??[]).join(' + ')});
    if (event.type==='enemyAttack') return tk('enemyEvent',{name:enemy,hits:event.hits,dice:event.dice.join(' + ')});
    if (event.type==='damage') return tk('damageEvent',{name:hero,damage:event.lost});
    return tk('event.'+(event.type??'round'),{...event,name:hero,enemy});
  }
  function init() {
    if (el('overlay')) return;
    const overlay=document.createElement('div');overlay.id=ID+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form legendary-panel"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(tk('title'))}</span><button class="inv-close-btn" type="button" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div id="${ID}-setup">${legendarySetupHTML(ID,tk)}</div>${button('create')}<div class="bsim-status" id="${ID}-partyStatus"></div><div id="${ID}-party"></div>${button('applyParty')}${field('silver')}${button('applySilver')}${select('mode',['personal','naval','army'].map(mode=>[mode,tk('mode.'+mode)]))}${select('context')}<details id="${ID}-personalSetup"><summary>${escape(tk('encounterOptions'))}</summary>${select('members')}${select('cursedMember')}${select('stealthHero')}${select('stealthOutcome',[['',tk('none')],['success',tk('success')],['failure',tk('failure')]])}${field('slaveDamage',1,0,2)}${['hygliph','enlightened','shipInMordain','rage','knockout','undercover','escortBeforePotion'].map(check).join('')}<label class="inv-edit-row"><span class="inv-edit-label">${escape(tk('codes'))}</span><input class="inv-edit-input" id="${ID}-codes" placeholder="A8, A13"></label></details><details id="${ID}-shipSetup"><summary>${escape(tk('ship'))}</summary><label class="inv-edit-row"><span class="inv-edit-label">${escape(tk('name'))}</span><input class="inv-edit-input" id="${ID}-shipName"></label>${field('shipFighting',4)}${field('shipHealth',7,1)}${button('applyShip')}</details><details id="${ID}-armySetup"><summary>${escape(tk('army'))}</summary><label class="inv-edit-row"><span class="inv-edit-label">${escape(tk('name'))}</span><input class="inv-edit-input" id="${ID}-unitName"></label>${field('unitStrength',2)}${field('unitMorale',3)}${button('addUnit')}<div class="bsim-status" id="${ID}-units"></div>${Array.from({length:6},(_,i)=>select('formation-'+i)).join('')}</details>${button('start')}<div class="bsim-status" id="${ID}-status"></div><div class="bsim-status" id="${ID}-phase"></div><div id="${ID}-personalActions">${select('actor')}${select('target')}${field('focus',0,0,100)}<div class="bsim-btn-row">${['attack','skip','enemyRoll','flee'].map(button).join('')}</div>${select('recipient')}${check('sameRecipient')}${button('assign')}${select('potionType',[['healing',tk('healing')],['invulnerability',tk('invulnerability')]])}${button('potion')}${button('takeWeapon')}${button('tommulReward')}</div><details><summary>${escape(tk('spellbook'))}</summary>${select('caster')}${select('spell')}${select('spellTarget')}${select('spellTarget2')}${['opening','precombat','rechargeAllowed','freeRecharge'].map(check).join('')}<div class="bsim-btn-row">${button('cast')}${button('castStrategy')}</div>${select('learnSpell',Object.keys(LEGENDARY_SPELLS).map(id=>[id,tk('spell.'+id)]))}<div class="bsim-btn-row">${['learn','forget','recharge'].map(button).join('')}</div></details><div id="${ID}-strategicActions">${field('armyTarget',0,0,2)}${button('strategyStep')}</div>${button('cancel')}<details><summary>${escape(tk('checks'))}</summary>${select('checkMember1')}${select('checkMember2')}${select('skill',LEGENDARY_SKILLS.map(skill=>[skill,tk(skill)]))}${field('dc',4,1,6)}${field('required',1)}${field('checkFocus',0,0,100)}${button('checkRoll')}${button('boostCheck')}<div class="bsim-status" id="${ID}-checkResult"></div></details></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details><div class="bsim-log" id="${ID}-log"></div></div></div></div>`;
    document.body.appendChild(overlay);wireLegendarySetup(ID,el);
    el('personalSetup').after(el('codes').closest('label'));
    const lootActions=document.createElement('div');lootActions.id=ID+'-lootActions';lootActions.className='bsim-btn-row';
    el('personalActions').after(lootActions);lootActions.append(el('takeWeapon'),el('tommulReward'));
    const editor=document.createElement('details');editor.id=ID+'-unitEditor';
    editor.innerHTML=`<summary>${escape(tk('editUnitTitle'))}</summary>${select('editUnit')}`+
      `<label class="inv-edit-row"><span class="inv-edit-label">${escape(tk('name'))}</span><input class="inv-edit-input" id="${ID}-editUnitName"></label>`+
      field('editUnitStrength',2)+field('editUnitMorale',3)+check('restoreRouted')+button('updateUnit');
    el('armySetup').appendChild(editor);
    el('castStrategy').after(document.createRange().createContextualFragment(button('castAdventure')));
    el('armyTarget').closest('label').outerHTML=select('armyTarget',[0,1,2].map(index=>[index,tk('zone.'+index)]));
    el('armyTarget').closest('label').after(document.createRange().createContextualFragment(select('armyPosition',[[0,tk('front')],[1,tk('support')]])));
    const btn=document.createElement('button');btn.id=ID+'-btn';btn.textContent=t('battlesim.title');btn.style.display='none';
    getButtonRow().appendChild(btn);btn.addEventListener('click',open);el('close').addEventListener('click',close);
    let backdrop=false;
    overlay.addEventListener('mousedown',event=>{backdrop=event.target===overlay;});
    overlay.addEventListener('click',event=>{if(backdrop&&event.target===overlay)close();});
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();}});
    registerShortcut({button:btn,overlay,open,close});
    el('mode').addEventListener('change',contextChanged);
    for (const key of ['caster','spell','armyTarget','context']) el(key).addEventListener('change',render);
    el('recipient').addEventListener('change',render);
    el('editUnit').addEventListener('change',()=>{
      const unit=data()?.units.find(unit=>unit.uid===el('editUnit').value);
      if(unit){el('editUnitName').value=unit.name;el('editUnitStrength').value=unit.strength;el('editUnitMorale').value=unit.morale;}
    });
    el('create').addEventListener('click',()=>{
      if (busy(data())) return;
      const update=game=>{game.party=readLegendarySetup(el,number);game.fight=null;game.check=null;};
      if (data()?.party.length) confirm(update,'replaceConfirm');else action(update);
    });
    if (configuration.allowSkullcracker !== false) {
    el('applyParty').insertAdjacentHTML('afterend',`<details><summary>${escape(tk('recruitSkullcracker'))}</summary><p>${escape(tk('skullcrackerNote'))}</p>${select('recruitSlot')}${button('recruitSkullcracker')}</details>`);
    el('recruitSkullcracker').addEventListener('click',()=>{
      if(busy(data()))return;
      const index=number('recruitSlot');
      confirm(game=>{
        if(busy(game)||!game.party[index]||game.party.some(hero=>hero.profileId==='skullcracker'))return;
        game.party[index]=newValleySkullcracker();game.fight=null;game.check=null;
      },'recruitConfirm');
    });
    }
    el('applyParty').addEventListener('click',()=>action(game=>{
      if(busy(game))return;
      game.party=readLegendaryParty(game.party,el,number).map((hero,index)=>
        ({...hero,...configuration.heroOptions?.({el,number,index,hero})}));
      game.fight=null;game.check=null;
    }));
    el('applySilver').addEventListener('click',()=>action(game=>{if(busy(game))return;const silver=number('silver');if(silver<0)throw Error();game.silver=silver;}));
    el('applyShip').addEventListener('click',()=>action(game=>{if(busy(game))return;
      const ship={name:el('shipName').value.trim(),fighting:number('shipFighting'),health:number('shipHealth')};
      if(!ship.name||ship.fighting<0||ship.health<0)throw Error();
      game.ship={...ship,...configuration.shipOptions?.({el,number,game})};game.fight=null;
    }));
    el('addUnit').addEventListener('click',()=>action(game=>{if(busy(game))return;
      const name=el('unitName').value.trim(),strength=number('unitStrength'),morale=number('unitMorale');
      if(!name||strength<0||morale<0)throw Error();
      game.units.push({uid:String(Date.now())+'-'+game.units.length,name,strength,morale,
        ...configuration.unitOptions?.({el,number,editing:false})});
    }));
    el('updateUnit').addEventListener('click',()=>action(game=>{
      if(busy(game))return;
      const index=game.units.findIndex(unit=>unit.uid===el('editUnit').value),name=el('editUnitName').value.trim(),
        strength=number('editUnitStrength'),morale=number('editUnitMorale');
      if(index<0||!name||strength<0||morale<0)throw Error();
      game.units[index]={...game.units[index],name,strength,morale,routed:el('restoreRouted').checked?false:!!game.units[index].routed,
        ...configuration.unitOptions?.({el,number,editing:true})};
      game.fight=null;el('restoreRouted').checked=false;
    }));
    el('start').addEventListener('click',()=>action(game=>{
      if(busy(game))return;
      const section=number('context'),mode=el('mode').value,codes=el('codes').value.split(/[\s,]+/).filter(Boolean).map(code=>code.toUpperCase());
      game.setup={mode,context:section};
      if(mode==='personal') {
        const config={codes,cursedMember:number('cursedMember'),stealthHero:number('stealthHero'),slaveDamage:number('slaveDamage'),
          ...Object.fromEntries(['hygliph','enlightened','shipInMordain','rage','knockout','undercover'].map(key=>[key,el(key).checked]))};
        const members=selectedIndices('members');if(members.length)config.participants=members;
        if(el('stealthOutcome').value)config.stealthOutcome=el('stealthOutcome').value;
        const fight=startFight(game.party,section,{...config,...configuration.personalOptions?.({game,el,number,selectedIndices})});
        fight.rules.escortBeforePotion=el('escortBeforePotion').checked;report(game,fight,mode);
      } else if(mode==='naval') report(game,startNaval(game.ship,section),mode);
      else {
        const slots=Array.from({length:6},(_,i)=>el('formation-'+i).value);
        const units=slots.map(uid=>uid?game.units.find(unit=>unit.uid===uid&&!unit.routed):null);
        const formation=Array.from({length:3},(_,i)=>{
          const row=units.slice(i*2,i*2+2);
          return armies[section]?.twoFrontLines?row:row.filter(Boolean);
        });
        report(game,startArmy(formation,section,codes),mode);
      }
    }));
    const fightAction=update=>action(game=>{if(!busy(game)||game.fight.kind!=='personal')return;report(game,update(game.fight),'personal');});
    el('attack').addEventListener('click',()=>fightAction(fight=>legendaryPlayerAttack(fight,number('actor'),number('target'),{focus:number('focus')})));
    el('skip').addEventListener('click',()=>fightAction(fight=>legendarySkipAttack(fight,number('actor'))));
    el('enemyRoll').addEventListener('click',()=>fightAction(legendaryEnemyAttack));
    el('assign').addEventListener('click',()=>fightAction(fight=>legendaryAssignDamage(fight,
      configuration.readRecipient?.({el,number})??number('recipient'),undefined,
      {allowSameRecipient:el('sameRecipient').checked,...configuration.assignOptions?.({el,number,fight})})));
    el('flee').addEventListener('click',()=>fightAction(legendaryFlee));
    el('potion').addEventListener('click',()=>fightAction(fight=>legendaryDrinkPotion(fight,number('recipient'),el('potionType').value)));
    el('takeWeapon').addEventListener('click',()=>action(game=>report(game,legendaryTakeGuardWeapon(game.fight,number('recipient')),'personal')));
    el('tommulReward').addEventListener('click',()=>action(game=>report(game,legendaryTommulReward(game.fight),'personal')));
    el('cast').addEventListener('click',()=>fightAction(fight=>{
      const id=el('spell').value,targets=['armourOfHeaven','soothingTouch'].includes(id)?[number('spellTarget')]:
        ['sandstorm','dazingLights','wither','stingtailRune'].includes(id)?[]:['poisonStream','whipsnake'].includes(id)?[number('spellTarget'),number('spellTarget2')]:[number('spellTarget')];
      return legendaryPlayerSpell(fight,number('caster'),id,targets,undefined,{opening:el('opening').checked,precombat:el('precombat').checked});
    }));
    el('strategyStep').addEventListener('click',()=>action(game=>{if(!busy(game))return;report(game,game.fight.kind==='army'?legendaryArmyStep(game.fight):legendaryNavalAttack(game.fight),game.fight.kind);}));
    el('castStrategy').addEventListener('click',()=>action(game=>{
      if(!busy(game)||game.fight.kind==='personal')return;
      const index=number('caster'),id=configuration.selectStrategySpell?el('spell').value:game.fight.kind==='army'?'clingingDread':'warpWood';
      const hero=drainLegendarySpell(game.party[index],id,game.fight.kind);
      if(game.fight.kind==='army'&&(game.fight.zone!==0||(configuration.limitArmyCasters&&
        (game.fight.position>0||game.fight.armyCasterRounds?.[index]===game.fight.round))))throw Error();
      if(game.fight.kind==='naval'&&!['warpWood','tilt'].includes(id))throw Error();
      const fight=game.fight.kind==='army'?legendaryArmyEffect(game.fight,'enemy',number('armyTarget'),id,undefined,{position:number('armyPosition')}):
        id==='tilt'?legendaryTilt(game.fight):legendaryWarpWood(game.fight);
      if(fight.kind==='army'&&configuration.limitArmyCasters) (fight.armyCasterRounds??={})[index]=fight.round;
      game.party[index]=hero;report(game,fight,game.fight.kind);
    }));
    el('castAdventure').addEventListener('click',()=>action(game=>{
      if(busy(game))return;
      const index=number('caster'),id=el('spell').value;
      if(Object.values(checkBoostSpells).includes(id))throw Error();
      game.party[index]=drainLegendarySpell(game.party[index],id,'adventure');
      if(id==='soothingTouch') {const target=number('spellTarget');game.party[target]=legendaryHeal(game.party[target],5);}
      game.fight=null;game.log.push(tk('adventureCast',{name:game.party[index].name,spell:tk('spell.'+id)}));
    }));
    el('cancel').addEventListener('click',()=>confirm(game=>{if(!busy(game))return;game.fight.status='cancelled';game.fight.phase='ended';game.fight.pending=null;if(game.fight.party)game.fight.party.forEach(hero=>{hero.invulnerable=false;});},'cancelConfirm'));
    for(const kind of ['learn','forget','recharge']) el(kind).addEventListener('click',()=>action(game=>{
      if(busy(game))return;
      const index=number('caster'),hero=game.party[index];
      if(kind==='learn')game.party[index]=configuration.learnSpell?
        configuration.learnSpell(hero,el('learnSpell').value,{el}):learnLegendarySpell(hero,el('learnSpell').value);
      else if(kind==='forget')game.party[index]=forgetLegendarySpell(hero,el('spell').value);
      else {const result=rechargeLegendarySpells(hero,[el('spell').value],game.silver,{allowed:el('rechargeAllowed').checked,free:el('freeRecharge').checked});game.party[index]=result.character;game.silver=result.silver;}
      game.fight=null;
    }));
    el('checkRoll').addEventListener('click',()=>action(game=>{
      if(busy(game))return;
      const first=number('checkMember1'),second=el('checkMember2').value;
      const members=second===''?[game.party[first]]:[game.party[first],game.party[Number(second)]];
      game.check={...legendarySkillCheck(members,el('skill').value,number('dc'),number('required'),{focus:number('checkFocus')}),skill:el('skill').value,required:number('required')};
      game.log.push(tk('checkEvent',{successes:game.check.successes,required:game.check.required}));
    }));
    el('boostCheck').addEventListener('click',()=>action(game=>{
      if(busy(game)||!game.check||game.check.passed)throw Error();
      const id=checkBoostSpells[game.check.skill],index=number('caster');
      if(!id)throw Error();game.party[index]=drainLegendarySpell(game.party[index],id,'adventure');
      game.check.successes+=3;game.check.passed=game.check.successes>=game.check.required;
      game.log.push(tk('checkEvent',{successes:game.check.successes,required:game.check.required}));
    }));
    extension=configuration.mount?.({document,ID,el,number,tk,button,check,field,select,options,selectedIndices,
      action,report,data,render,busy});
    render();
  }
  return {init,render,setVisible(visible){const btn=el('btn');if(btn)btn.style.display=visible?'':'none';if(!visible)close();}};
}
