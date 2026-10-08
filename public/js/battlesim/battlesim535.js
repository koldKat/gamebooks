import { currentPlaythrough, currentBookId, saveState } from '../core/state.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { showAlert, showConfirm } from '../ui-helpers/confirm.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';
import { FIRE_WOLF_ATTRIBUTES, FIRE_WOLF_WEAPONS, resolveFireWolfInitiative } from './engines/demonspawn/fire-wolf.js';
import { CRYPTS_ENCOUNTERS, prepareCryptsEncounter, rollCryptsCharacter } from './engines/demonspawn/crypts-of-terror-encounters.js';
import { createCryptsFight, cryptsEnemyActive, checkCryptsOutcome, rollCryptsAttack, advanceCryptsRound,
  resolveCryptsDeathLuck, applyCryptsWightHit } from './engines/demonspawn/crypts-of-terror.js';
import { FIRE_WOLF_SPELLS } from './engines/demonspawn/fire-wolf-magic.js';
import { createCryptsMagicSection, castCryptsPlayerSpell, castCryptsEnemySpell,
  useCryptsRosewoodBox, tryCryptsOrb, useCryptsWand } from './engines/demonspawn/crypts-of-terror-magic.js';

const ID='sim535';
const tk=(key,params)=>t(`battlesim535.${key}`,params);
const el=key=>document.getElementById(`${ID}-${key}`);
const fields=[...FIRE_WOLF_ATTRIBUTES,'skill','lifePoints','maxLife','power','maxPower','wandCharges'];
const options=['haroldWarning','cursedStone','orb','clementineUnarmed'];
const actions=['initiative','player_attack','enemy_attack','end_round','death_luck','box','orb_test','wand','wight_hit'];

function data() {
  if (Number(currentBookId)!==535) return null;
  const pt=currentPlaythrough();
  if (!pt) return null;
  return pt[ID] ||= {player:{...rollCryptsCharacter(),weapon:'doombringer',armour:'none',wandCharges:0},
    fight:null,magic:null,nextOptions:{},log:[],history:[]};
}
function character(d) {return d.fight?.player??d.player;}
function active(d) {return Boolean(d.fight&&!d.fight.outcome);}
function close() {el('overlay')?.classList.remove('active');}
function open() {
  if (!data()) {showAlert(t('battlesim.no_active_playthrough'));return;}
  renderSim535();el('overlay').classList.add('active');
}
function append(d,message) {d.log.push(message);d.log=d.log.slice(-150);}
function record(d) {
  const f=d.fight;
  if (!f||f.recorded||!['win','loss'].includes(f.outcome)) return;
  f.recorded=true;
  d.history.push({enemy:`${[...new Set(f.encounter.enemies)].join(', ')} (${tk('section',{section:f.encounter.section})})`,outcome:f.outcome,
    ts:Math.max(Date.now(),(d.history.at(-1)?.ts??0)+1)});
}
function store(d) {record(d);saveState();renderSim535();}
function rollCharacter() {
  const d=data(),pt=currentPlaythrough();if (!d||active(d)) return;
  showConfirm(tk('new_character_confirm'),()=>{
    if (Number(currentBookId)!==535||currentPlaythrough()!==pt||active(d)) return;
    d.player={...character(d),...rollCryptsCharacter()};d.fight=d.magic=null;store(d);
  });
}
function start() {
  const d=data();if (!d||active(d)||character(d).lifePoints<=0) return;
  try {
    const manual=Object.fromEntries([...FIRE_WOLF_ATTRIBUTES,'skill','lifePoints','power'].map(key=>
      [key,el(`manual-${key}`).value===''?null:Number(el(`manual-${key}`).value)]));
    const prepared=prepareCryptsEncounter(el('encounter').value,character(d),{...d.nextOptions,manual});
    d.fight=createCryptsFight(prepared);
    if (d.magic?.section!==String(prepared.encounter.section)) {
      d.magic=createCryptsMagicSection(prepared.encounter.section,d.fight.player,d.fight.enemies);
      d.fight.player.magicArmour=0;delete d.fight.player.magicFear;
    }
    d.fight.player.magicArmour=d.magic.armour;
    d.player={...d.fight.player};
    append(d,tk('section',{section:prepared.encounter.section}));store(d);
  } catch {showAlert(tk('invalid'));}
}
function target() {return Number(el('target').value);}
function resultLog(d,result) {
  if (result?.error) {showAlert(tk(`error.${result.error}`));return;}
  if (result?.kind==='attack') append(d,tk('attack_log',{...result,side:tk(result.side)}));
  else append(d,tk('result',{result:typeof result==='boolean'?tk(result?'success':'failure'):result?.damage??result?.kind??''}));
}
function act(action) {
  const d=data(),f=d?.fight;if (!f||f.outcome) return;
  let result;
  if (action==='death_luck') result=resolveCryptsDeathLuck(f);
  else if (f.pending) return;
  else if (action==='initiative') result=resolveFireWolfInitiative(f);
  else if (action==='player_attack'||action==='enemy_attack') result=rollCryptsAttack(f,action==='player_attack'?'player':'enemy',target());
  else if (action==='end_round') result=advanceCryptsRound(f);
  else if (action==='box') result=useCryptsRosewoodBox(f);
  else if (action==='orb_test') result=tryCryptsOrb(f);
  else if (action==='wand') result=useCryptsWand(f,target());
  else if (action==='wight_hit') {
    const value=el('wight-damage').value;
    if (value==='') return;
    result=applyCryptsWightHit(f,Number(value));
  }
  if (result===null||result===undefined) return;
  resultLog(d,result);store(d);
}
function cast(side) {
  const d=data(),f=d?.fight;if (!f||!d.magic) return;
  const spell=el('spell').value;
  const result=side==='enemy'?castCryptsEnemySpell(f,target(),spell):castCryptsPlayerSpell(f,d.magic,spell,{
    target:target(),useLife:el('useLife').checked,destination:el('destination').value.trim(),
    cryptStart:Number(el('cryptStart').value),visited:currentPlaythrough()?.path??[],
  });
  if (!result.error) {
    append(d,tk('spell_log',{spell:tk(`spell.${spell}`),side:tk(side),cost:result.cost,result:tk(result.success?'success':'failure')}));
    if (result.manualEffect) append(d,tk('manual_effect'));
    if (result.destination!=null) append(d,tk('destination_log',{section:result.destination}));
    if (result.rerollCharacter&&side==='player') {
      const used=d.magic.used.slice(),inclination=d.magic.inclination;
      Object.assign(f.player,rollCryptsCharacter());
      f.pending=f.outcome=null;f.recorded=f.skillAwarded=false;f.turn=null;
      f.round=f.attacks=f.enemyTurns=f.rest=f.paralysedPlayerRounds=f.playerDamage=f.ratHits=0;
      f.enemyDamage.fill(0);f.openingStrikes=[];
      d.magic=createCryptsMagicSection(f.encounter.section,f.player,f.enemies);
      // Returning to the same section preserves its spell restrictions.
      d.magic.used=used;d.magic.inclination=inclination;
    }
  } else showAlert(tk(`error.${result.error}`));
  store(d);
}
function field(key,prefix='') {
  return `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk(key)}</span><input id="${ID}-${prefix}${key}" class="inv-edit-input inv-qty-input" type="number" min="0" step="0.5"></label>`;
}
function button(key) {return `<button id="${ID}-${key}" class="inv-add-btn">${tk(key)}</button>`;}
function toggle(key) {return `<label class="inv-edit-row"><input id="${ID}-${key}" type="checkbox">${tk(key)}</label>`;}

export function renderSim535() {
  if (!el('overlay')) return;
  const d=data();if (!d) {close();return;}
  const f=d.fight,p=character(d),pending=Boolean(f?.pending),fighting=active(d);
  for (const key of fields) {
    if (document.activeElement!==el(key)) el(key).value=p[key]??0;
    el(key).disabled=pending;
  }
  for (const key of ['armour','weapon']) {el(key).value=p[key]??'none';el(key).disabled=pending;}
  for (const key of ['shield','rosewoodBox']) {el(key).checked=Boolean(p[key]);el(key).disabled=pending;}
  el('encounter').disabled=fighting;el('start').disabled=fighting||p.lifePoints<=0;
  el('roll_character').disabled=fighting;
  const selected=CRYPTS_ENCOUNTERS.find(e=>String(e.section)===el('encounter').value);
  el('manual').hidden=!['wizard-duel','nonfatal-50'].includes(selected?.rule);
  for (const key of options) {el(key).checked=Boolean(fighting?f.options[key]:d.nextOptions[key]);el(key).disabled=fighting;}
  const previous=target();
  el('target').innerHTML=(f?.enemies??[]).map((e,i)=>`<option value="${i}" ${!cryptsEnemyActive(f,i)?'disabled':''}>${escapeHtml(e.name)} (${Math.max(0,e.lifePoints)} LP)</option>`).join('');
  const available=f?.enemies.findIndex((e,i)=>cryptsEnemyActive(f,i))??-1;
  el('target').value=String(f&&cryptsEnemyActive(f,previous)?previous:Math.max(0,available));
  for (const action of actions) el(action).disabled=!fighting||pending;
  el('death_luck').hidden=f?.pending!=='death-luck';el('death_luck').disabled=f?.pending!=='death-luck';
  el('initiative').hidden=Boolean(f?.manualGroup);el('initiative').disabled||=Boolean(f?.turn);
  el('end_round').hidden=!f?.manualGroup;
  el('player_attack').disabled||=!f?.manualGroup&&f?.turn!=='player'||f?.encounter.rule==='wizard-duel';
  el('enemy_attack').disabled||=!f?.manualGroup&&f?.turn!=='enemy'||f?.encounter.rule==='wizard-duel';
  el('box').disabled||=!p.rosewoodBox||f?.encounter.noArtifacts||!f?.enemies.some((e,i)=>e.name==='Alchiller'&&cryptsEnemyActive(f,i));
  el('orb_test').disabled||=!f?.options.orb||f?.orbTested||f?.encounter.noArtifacts;
  el('wand').disabled||=p.wandCharges<1||p.power<5||f?.encounter.noArtifacts;
  el('wight_hit').hidden=f?.encounter.rule!=='wights';el('wight-damage').hidden=f?.encounter.rule!=='wights';
  const spell=el('spell').value,cost=FIRE_WOLF_SPELLS[spell];
  el('cast').disabled=!f||f.encounter.noMagic||Boolean(f.outcome)&&spell!=='resurrection'||pending&&spell!=='resurrection'
    ||d.magic?.used.includes(spell)||d.magic?.inclination===false
    ||(spell==='resurrection'?p.lifePoints>0:p.lifePoints<=0)
    ||(p.power<cost&&(!el('useLife').checked||p.lifePoints<=cost-p.power))
    ||f.encounter.rule==='wizard-duel'&&(f.turn!=='player'||el('useLife').checked)
    ||f.encounter.noPoisonNeedle&&spell==='poisonNeedle';
  const enemy=f?.enemies[target()];
  el('enemy_cast').disabled=!fighting||pending||f?.encounter.noMagic
    ||!f?.manualGroup&&f?.turn!=='enemy'
    ||!(enemy?.spells==='all'||enemy?.spells?.includes(spell)||f?.encounter.rule==='wizard-duel')
    ||f?.encounter.noPoisonNeedle&&spell==='poisonNeedle';
  el('foes').innerHTML=(f?.enemies??[]).map((e,i)=>`<label class="inv-edit-row"><span class="inv-edit-label">${escapeHtml(e.name)} LP</span><input data-enemy="${i}" class="inv-edit-input inv-qty-input" type="number" min="0" step="0.5" value="${Math.max(0,e.lifePoints)}" ${pending||!fighting?'disabled':''}></label>
    ${e.manualWeapon?`<label class="inv-edit-row">${tk('enemy_weapon')}<select data-weapon="${i}" class="inv-edit-input" ${pending||!fighting?'disabled':''}><option value="">${tk('select_weapon')}</option>${Object.keys(FIRE_WOLF_WEAPONS).map(key=>`<option value="${key}" ${e.weapon===key?'selected':''}>${tk(`weapon.${key}`)}</option>`).join('')}</select></label>`:''}`).join('');
  el('status').textContent=tk(`status.${f?.outcome??f?.pending??(f?f.turn??'initiative':'ready')}`);
  el('manual_group').hidden=!f?.manualGroup;
  el('log').innerHTML=d.log.slice().reverse().map(line=>`<div>${escapeHtml(line)}</div>`).join('');
  el('history').innerHTML=d.history.slice(-50).reverse().map(entry=>`<div class="bsim-history-row">${escapeHtml(entry.enemy)}: ${tk(`status.${entry.outcome}`)}</div>`).join('');
}

export function setSim535Visible(value) {
  if (el('btn')) el('btn').style.display=value?'':'none';
  if (!value) close();
}
export function initSim535() {
  if (el('overlay')) return;
  const overlay=document.createElement('div');overlay.id=`${ID}-overlay`;overlay.className='inv-overlay';
  overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${tk('title')}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div>
    <div class="bsim-body"><div class="bsim-col bsim-col-left"><div class="bsim-side"><div class="bsim-side-title">${tk('player')}</div>${fields.map(k=>field(k)).join('')}
    <label class="inv-edit-row">${tk('weapon')}<select id="${ID}-weapon" class="inv-edit-input">${Object.keys(FIRE_WOLF_WEAPONS).map(k=>`<option value="${k}">${tk(`weapon.${k}`)}</option>`).join('')}</select></label>
    <label class="inv-edit-row">${tk('armour')}<select id="${ID}-armour" class="inv-edit-input">${['none','leather','chain','plate'].map(k=>`<option value="${k}">${tk(k)}</option>`).join('')}</select></label>
    ${toggle('shield')}${toggle('rosewoodBox')}${button('roll_character')}</div>
    <div class="bsim-side"><label class="inv-edit-row">${tk('encounter')}<select id="${ID}-encounter" class="inv-edit-input">${CRYPTS_ENCOUNTERS.map(e=>`<option value="${e.section}">${escapeHtml([...new Set(e.enemies)].join(', '))} (${escapeHtml(tk('section',{section:e.section}))})</option>`).join('')}</select></label>
    ${options.map(toggle).join('')}<div id="${ID}-manual" hidden><p>${tk('manual_stats')}</p>${[...FIRE_WOLF_ATTRIBUTES,'skill','lifePoints','power'].map(k=>field(k,'manual-')).join('')}</div>
    <p>${tk('manual_note')}</p>${button('start')}<p id="${ID}-manual_group" hidden>${tk('manual_group')}</p><select id="${ID}-target" class="inv-edit-input" aria-label="${tk('enemy')}"></select>
    <div id="${ID}-foes"></div><div id="${ID}-status" class="bsim-status"></div>${actions.map(button).join('')}
    <input id="${ID}-wight-damage" class="inv-edit-input" type="number" min="0" step="0.5" aria-label="${tk('wight_damage')}"></div>
    <div class="bsim-side"><label class="inv-edit-row">${tk('spell')}<select id="${ID}-spell" class="inv-edit-input">${Object.entries(FIRE_WOLF_SPELLS).map(([k,cost])=>`<option value="${k}">${tk(`spell.${k}`)} (${cost})</option>`).join('')}</select></label>
    ${toggle('useLife')}<label class="inv-edit-row">${tk('destination')}<input id="${ID}-destination" class="inv-edit-input"></label><label class="inv-edit-row">${tk('cryptStart')}<select id="${ID}-cryptStart" class="inv-edit-input"><option value="6">6</option><option value="74">74</option></select></label>
    ${button('cast')}${button('enemy_cast')}</div></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${tk('history')}</summary><div id="${ID}-history" class="bsim-history-list"></div></details><div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
  document.body.appendChild(overlay);
  const btn=document.createElement('button');btn.id=`${ID}-btn`;btn.innerHTML=shortcutLabel(t('battlesim.title'));btn.style.display='none';
  getPlayBtnRow().appendChild(btn);btn.addEventListener('click',open);el('close').addEventListener('click',close);
  let backdropDown=false;
  overlay.addEventListener('mousedown',event=>{backdropDown=event.target===overlay;});
  overlay.addEventListener('click',event=>{if (backdropDown&&event.target===overlay) close();});
  registerPanelShortcut('KeyS',{getButton:()=>btn,getOverlay:()=>overlay,otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  el('start').addEventListener('click',start);
  for (const key of ['encounter','spell','useLife','target']) el(key).addEventListener('change',renderSim535);
  for (const action of actions) el(action).addEventListener('click',()=>act(action));
  el('cast').addEventListener('click',()=>cast('player'));el('enemy_cast').addEventListener('click',()=>cast('enemy'));
  for (const key of fields) el(key).addEventListener('change',()=>{
    const d=data(),input=el(key),value=Number(input.value);if (!d||d.fight?.pending) return;
    if (input.value!==''&&Number.isFinite(value)&&value>=0) {character(d)[key]=value;if (d.fight) checkCryptsOutcome(d.fight);}
    store(d);
  });
  for (const key of ['weapon','armour','shield','rosewoodBox']) el(key).addEventListener('change',()=>{
    const d=data();if (!d||d.fight?.pending) return;
    character(d)[key]=['shield','rosewoodBox'].includes(key)?el(key).checked:el(key).value;store(d);
  });
  for (const key of options) el(key).addEventListener('change',()=>{
    const d=data();if (!d||active(d)) return;d.nextOptions[key]=el(key).checked;store(d);
  });
  el('foes').addEventListener('change',event=>{
    const d=data(),f=d?.fight,input=event.target;if (!f||f.pending||f.outcome) return;
    if (input.dataset.enemy!==undefined) {
      const enemy=f.enemies[Number(input.dataset.enemy)],value=Number(input.value);
      if (enemy&&input.value!==''&&Number.isFinite(value)&&value>=0) {enemy.lifePoints=value;checkCryptsOutcome(f);}
    } else if (input.dataset.weapon!==undefined&&input.value in FIRE_WOLF_WEAPONS) {
      const enemy=f.enemies[Number(input.dataset.weapon)];if (enemy?.manualWeapon) enemy.weapon=input.value;
    }
    store(d);
  });
  el('roll_character').addEventListener('click',rollCharacter);
}
