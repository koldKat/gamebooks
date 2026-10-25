import { createDemonOpponentSetup } from '../../engines/demonspawn/setup.js';
import { DEMONDOOM_ROSTER, DEMONDOOM_RULES } from '../../engines/demonspawn/demondoom-roster.js';
let customSetup;
import { actions } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ customSetup, ALL_PANEL_OVERLAY_IDS, DEMONDOOM_ENCOUNTERS, DEMONDOOM_SPELLS, FIRE_WOLF_ATTRIBUTES, FIRE_WOLF_WEAPONS, ID, act, actions, active, append, applyDemondoomManualDamage, button, cast, castDemondoomEnemySpell, castDemondoomPlayerSpell, character, checkDemondoomFight, close, createDemondoomFight, currentBookId, currentPlaythrough, data, demondoomCastAvailability, demondoomEnemyActive, determineDemondoomInitiative, el, endDemondoomGroupRound, escapeHtml, field, fields, finishDemondoomFight, getPlayBtnRow, initSim536, number, open, prepareDemondoomEncounter, record, registerPanelShortcut, renderSim536, replaceCharacter, resolveDemondoomDeathLuck, result, rollDemondoomAttack, rollDemondoomCharacter, saveState, setSim536Visible, shortcutLabel, showAlert, showConfirm, start, store, t, target, tk, toggle, tradeDemondoomLifeForPower, transformedDemondoomCharacter, useDemondoomTalisman });
const { data } = createState(simulatorContext);
const { append, record, store, result, start, act } = createCombat(simulatorContext);
const { cast } = createEffects(simulatorContext);
// END SIMULATOR WIRING
import {currentPlaythrough,currentBookId,saveState} from "../../../core/state.js";
import {getPlayBtnRow} from "../../../play/charsheet.js";
import {showAlert,showConfirm} from "../../../ui-helpers/confirm.js";
import {escapeHtml,registerPanelShortcut,shortcutLabel,ALL_PANEL_OVERLAY_IDS} from "../../../core/util.js";
import {t} from "../../../i18n.js";
import {FIRE_WOLF_ATTRIBUTES,FIRE_WOLF_WEAPONS} from "../.././engines/demonspawn/fire-wolf.js";
import {rollDemondoomCharacter,transformedDemondoomCharacter} from "../.././engines/demonspawn/demondoom-character.js";
import {DEMONDOOM_ENCOUNTERS,prepareDemondoomEncounter} from "../.././engines/demonspawn/demondoom-encounters.js";
import {createDemondoomFight,demondoomEnemyActive,checkDemondoomFight,determineDemondoomInitiative,
  rollDemondoomAttack,resolveDemondoomDeathLuck,endDemondoomGroupRound,applyDemondoomManualDamage,
  castDemondoomPlayerSpell,castDemondoomEnemySpell} from "../.././engines/demonspawn/demondoom.js";
import {DEMONDOOM_SPELLS,demondoomCastAvailability,tradeDemondoomLifeForPower} from "../.././engines/demonspawn/demondoom-magic.js";
import {useDemondoomTalisman,finishDemondoomFight} from "../.././engines/demonspawn/demondoom-rules.js";

const ID='sim536',tk=(key,params)=>t(`battlesim536.${key}`,params),el=key=>document.getElementById(`${ID}-${key}`);
const fields=[...FIRE_WOLF_ATTRIBUTES,'skill','lifePoints','maxLife','power','maxPower','talismanUses'];

const number=key=>el(key).value.trim()===''?undefined:Number(el(key).value);

const character=d=>d.fight?.player??d.player;
const active=d=>Boolean(d.fight&&!d.fight.outcome);
function replaceCharacter(transform=false) {
  const d=data(),pt=currentPlaythrough();if(!d||active(d))return;
  showConfirm(tk(transform?'transform_confirm':'new_character_confirm'),()=>{
    if(Number(currentBookId)!==536||currentPlaythrough()!==pt||active(d))return;
    d.player=transform?transformedDemondoomCharacter(character(d)):{...rollDemondoomCharacter(),weapon:'doombringer',armour:'none'};
    d.fight=null;store(d);
  });
}

function close(){el('overlay')?.classList.remove('active');}
function open(){if(!data()){showAlert(t('battlesim.no_active_playthrough'));return;}renderSim536();el('overlay').classList.add('active');}

const target=()=>Number(el('target').value);

export function renderSim536() {
  if(!el('overlay'))return;
  const d=data();if(!d){close();return;}
  customSetup?.render();
  const fight=d.fight,player=character(d),fighting=active(d),pending=Boolean(fight?.pending);
  for(const key of fields){if(document.activeElement!==el(key))el(key).value=player[key]??0;el(key).disabled=pending;}
  for(const key of ['weapon','armour']){el(key).value=player[key]??'none';el(key).disabled=pending;}
  for(const key of ['shield','healingTalisman']){el(key).checked=Boolean(player[key]);el(key).disabled=pending;}
  el('encounter').disabled=fighting;el('spawnCount').disabled=fighting;
  el('start').disabled=fighting||player.lifePoints<=0;
  el('roll_character').disabled=el('transform').disabled=fighting;
  const selected=DEMONDOOM_ENCOUNTERS.find(entry=>String(entry.section)===el('encounter').value);
  el('spawn-row').hidden=!selected?.rolledCount;
  const previous=target();
  el('target').innerHTML=(fight?.enemies??[]).map((enemy,index)=>`<option value="${index}" ${!demondoomEnemyActive(fight,index)?'disabled':''}>${escapeHtml(enemy.name)} (${Math.max(0,enemy.lifePoints)} LP)</option>`).join('');
  const available=fight?.enemies.findIndex((enemy,index)=>demondoomEnemyActive(fight,index))??-1;
  el('target').value=String(fight&&demondoomEnemyActive(fight,previous)?previous:Math.max(0,available));
  for(const action of actions)el(action).disabled=!fighting||pending;
  el('death_luck').hidden=fight?.pending!=='death-luck';el('death_luck').disabled=fight?.pending!=='death-luck';
  el('initiative').hidden=Boolean(fight?.encounter.manualGroup);el('initiative').disabled||=Boolean(fight?.turn);
  el('end_round').hidden=!fight?.encounter.manualGroup;
  el('manual_group').hidden=!fight?.encounter.manualGroup;
  el('player_attack').disabled||=!fight?.encounter.manualGroup&&fight?.turn!=='player'||fight?.encounter.mode==='magic';
  el('enemy_attack').disabled||=!fight?.encounter.manualGroup&&fight?.turn!=='enemy'||['web','amoebix'].includes(fight?.encounter.rule)||fight?.encounter.magicImmune&&!fight?.guardSpellPaid;
  el('leprosy_tick').hidden=!fight?.leprosy;
  el('poison').hidden=fight?.encounter.rule!=='assassin';
  const spell=el('spell').value,guardPayment=fight?.encounter.magicImmune&&!fight?.guardSpellPaid;
  const state=player.magicSections?.[String(fight?.encounter.section)];
  const availability=demondoomCastAvailability(player,fight?.encounter.section,spell,number('manual_cost'));
  const blocked=availability.error&&!(availability.error==='inclination-required'&&!state);
  el('cast').disabled=!fight||Boolean(blocked)||Boolean(fight.outcome)&&!(spell==='resurrection'&&player.lifePoints<=0)
    ||pending&&spell!=='resurrection'||spell==='resurrection'&&player.lifePoints>0
    ||spell!=='resurrection'&&!guardPayment&&!fight?.encounter.manualGroup&&fight?.turn!=='player';
  const cost=DEMONDOOM_SPELLS.find(entry=>entry.id===spell)?.cost??number('manual_cost');
  el('cast').disabled||=!Number.isFinite(cost)||player.power<cost;
  el('manual_cost_row').hidden=DEMONDOOM_SPELLS.find(entry=>entry.id===spell)?.cost!==null;
  el('destination_row').hidden=spell!=='retrace';
  el('enemy_cast').disabled=!fighting||pending||!['regent','village-spawn','captain'].includes(fight?.encounter.rule)
    ||!fight?.encounter.manualGroup&&fight?.turn!=='enemy';
  el('trade').disabled=pending||player.lifePoints<=0;
  el('heal').disabled=fight?.outcome!=='win'||player.lifePoints<=0||player.lifePoints>=player.maxLife||!player.healingTalisman||player.talismanUses>=10||player.talismanUsedAfterFight;
  el('foes').innerHTML=(fight?.enemies??[]).map((enemy,index)=>`<label class="inv-edit-row"><span class="inv-edit-label">${escapeHtml(enemy.name)} LP</span><input data-enemy="${index}" class="inv-edit-input inv-qty-input" type="number" step="0.5" min="0" value="${Math.max(0,enemy.lifePoints)}" ${pending||!fighting?'disabled':''}></label>${enemy.manualWeapon?`<label class="inv-edit-row"><span class="inv-edit-label">${tk('enemy_weapon')}</span><input data-weapon="${index}" class="inv-edit-input inv-qty-input" type="number" step="0.5" min="0" value="${Number.isFinite(enemy.weapon)?enemy.weapon:''}" ${pending||!fighting?'disabled':''}></label>`:''}`).join('');
  el('status').textContent=tk(`status.${fight?.outcome??fight?.pending??(fight?fight.turn??'initiative':'ready')}`);
  if(fight?.outcome&&fight.encounter.returnTo)el('status').textContent+=' '+tk('continue',{section:fight.encounter.returnTo});
  else if(fight?.outcome==='win'&&fight.encounter.win)el('status').textContent+=' '+tk('continue',{section:fight.encounter.win});
  el('log').innerHTML=d.log.slice().reverse().map(line=>`<div>${escapeHtml(line)}</div>`).join('');
  el('history').innerHTML=d.history.slice(-50).reverse().map(entry=>`<div class="bsim-history-row">${escapeHtml(entry.enemy)}: ${tk(`status.${entry.outcome}`)}</div>`).join('');
}

export function setSim536Visible(value){if(el('btn'))el('btn').style.display=value?'':'none';if(!value)close();}
export function initSim536() {
  if(el('overlay'))return;
  const overlay=document.createElement('div');overlay.id=`${ID}-overlay`;overlay.className='inv-overlay';
  overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${tk('title')}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div>
  <div class="bsim-body"><div class="bsim-col bsim-col-left"><div class="bsim-side"><div class="bsim-side-title">${tk('player')}</div>${fields.map(field).join('')}
  <label class="inv-edit-row">${tk('weapon')}<select id="${ID}-weapon" class="inv-edit-input">${Object.keys(FIRE_WOLF_WEAPONS).map(key=>`<option value="${key}">${tk(`weapon.${key}`)}</option>`).join('')}</select></label>
  <label class="inv-edit-row">${tk('armour')}<select id="${ID}-armour" class="inv-edit-input">${['none','leather','chain','plate'].map(key=>`<option value="${key}">${tk(key)}</option>`).join('')}</select></label>
  ${toggle('shield')}${toggle('healingTalisman')}${button('roll_character')}${button('transform')}${button('heal')}</div>
  <div class="bsim-side"><label class="inv-edit-row">${tk('encounter')}<select id="${ID}-encounter" class="inv-edit-input">${DEMONDOOM_ENCOUNTERS.map(entry=>`<option value="${entry.section}">${escapeHtml(entry.enemy??entry.enemies.join(', '))} (${tk('section',{section:entry.section})})</option>`).join('')}</select></label>
  <label id="${ID}-spawn-row" class="inv-edit-row">${tk('spawnCount')}<input id="${ID}-spawnCount" class="inv-edit-input inv-qty-input" type="number" min="${DEMONDOOM_RULES.spawnMin}" max="${DEMONDOOM_RULES.spawnMax}" step="1"></label>
  <p>${tk('manual_note')}</p>${button('start')}<p id="${ID}-manual_group" hidden>${tk('manual_group')}</p>
  <select id="${ID}-target" class="inv-edit-input" aria-label="${tk('enemy')}"></select><div id="${ID}-foes"></div><div id="${ID}-status" class="bsim-status"></div>
  ${actions.filter(key=>key!=='apply_damage').map(button).join('')}${field('manual_damage')}${button('apply_damage')}</div>
  <div class="bsim-side"><label class="inv-edit-row">${tk('spell')}<select id="${ID}-spell" class="inv-edit-input">${DEMONDOOM_SPELLS.map(spell=>`<option value="${spell.id}">${tk(`spell.${spell.id}`)}${spell.cost===null?'':` (${spell.cost})`}</option>`).join('')}</select></label>
  <div id="${ID}-manual_cost_row">${field('manual_cost')}<p>${tk('manual_cost_note')}</p></div>
  <label id="${ID}-destination_row" class="inv-edit-row">${tk('destination')}<input id="${ID}-destination" class="inv-edit-input"></label>${button('cast')}
  <label class="inv-edit-row">${tk('enemy_spell')}<select id="${ID}-enemy_spell" class="inv-edit-input">${Object.keys(DEMONDOOM_RULES.enemyMagic.thresholds).map(spell=>`<option value="${spell}">${tk(`spell.${spell}`)}</option>`).join('')}</select></label>${button('enemy_cast')}
  ${field('trade_amount')}${button('trade')}</div></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${tk('history')}</summary><div id="${ID}-history" class="bsim-history-list"></div></details><div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
  document.body.appendChild(overlay);
  customSetup = createDemonOpponentSetup({document, id: ID, t, tk, roster: DEMONDOOM_ROSTER, getRun: currentPlaythrough, getData: data});
  const btn=document.createElement('button');btn.id=`${ID}-btn`;btn.innerHTML=shortcutLabel(t('battlesim.title'));btn.style.display='none';
  getPlayBtnRow().appendChild(btn);btn.addEventListener('click',open);el('close').addEventListener('click',close);
  let backdropDown=false;overlay.addEventListener('mousedown',event=>{backdropDown=event.target===overlay;});
  overlay.addEventListener('click',event=>{if(backdropDown&&event.target===overlay)close();});
  registerPanelShortcut('KeyS',{getButton:()=>btn,getOverlay:()=>overlay,otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  el('start').addEventListener('click',start);
  for(const key of ['encounter','spell','target','manual_cost','destination','enemy_spell'])el(key).addEventListener('change',renderSim536);
  for(const action of actions)el(action).addEventListener('click',()=>act(action));
  el('cast').addEventListener('click',()=>cast());el('enemy_cast').addEventListener('click',()=>cast(true));
  el('roll_character').addEventListener('click',()=>replaceCharacter());el('transform').addEventListener('click',()=>replaceCharacter(true));
  el('heal').addEventListener('click',()=>{const d=data();if(!d||d.fight?.outcome!=='win')return;result(d,useDemondoomTalisman(character(d),Math.floor(Math.random()*6)+Math.floor(Math.random()*6)+2));});
  el('trade').addEventListener('click',()=>{const d=data();if(!d||d.fight?.pending)return;result(d,tradeDemondoomLifeForPower(character(d),number('trade_amount')));});
  for(const key of fields)el(key).addEventListener('change',()=>{
    const d=data(),value=number(key);if(!d||d.fight?.pending||!Number.isFinite(value)||value<0)return;
    if(key==='skill'&&value>96)return;
    character(d)[key]=value;if(d.fight)checkDemondoomFight(d.fight);store(d);
  });
  for(const key of ['weapon','armour','shield','healingTalisman'])el(key).addEventListener('change',()=>{
    const d=data();if(!d||d.fight?.pending)return;
    character(d)[key]=['shield','healingTalisman'].includes(key)?el(key).checked:el(key).value;store(d);
  });
  el('foes').addEventListener('change',event=>{
    const d=data(),fight=d?.fight,input=event.target;if(!fight||fight.pending||fight.outcome)return;
    const value=input.value===''?undefined:Number(input.value);if(!Number.isFinite(value)||value<0)return;
    if(input.dataset.enemy!==undefined){const enemy=fight.enemies[Number(input.dataset.enemy)];if(enemy){enemy.lifePoints=value;checkDemondoomFight(fight);}}
    else if(input.dataset.weapon!==undefined){const enemy=fight.enemies[Number(input.dataset.weapon)];if(enemy?.manualWeapon)enemy.weapon=value;}
    store(d);
  });
}

function field(key){
return `<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk(key)}</span><input id="${ID}-${key}" class="inv-edit-input inv-qty-input" type="number" min="0" step="0.5"></label>`;}

function button(key){
return `<button id="${ID}-${key}" class="inv-add-btn">${tk(key)}</button>`;}

function toggle(key){
return `<label class="inv-edit-row"><input id="${ID}-${key}" type="checkbox">${tk(key)}</label>`;}

export { initSim536 as init, renderSim536 as render, setSim536Visible as setVisible };
