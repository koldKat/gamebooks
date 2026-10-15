import { ID, fields, supplies, flags, options } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, ID, REALM_COMPANION, REALM_ENCOUNTERS, REALM_EQUIPMENT, action, active, availableLizard, character, close, confirm, currentBookId, currentPlaythrough, data, dream, el, escapeHtml, fields, flags, getPlayBtnRow, initSim531, label, open, options, record, registerPanelShortcut, renderSim531, rules, saveState, setSim531Visible, shortcutLabel, showAlert, showConfirm, start, supplies, t, tk, update });
const { data } = createState(simulatorContext);
const { label, record, update, action, confirm, start, dream } = createCombat(simulatorContext);
// END SIMULATOR WIRING
import { currentPlaythrough, currentBookId, saveState } from "../../../core/state.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { showAlert, showConfirm } from "../../../ui-helpers/confirm.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { REALM_ENCOUNTERS, REALM_EQUIPMENT, REALM_COMPANION } from "../.././engines/grailquest/realm-of-chaos-roster.js";
import * as rules from "../.././engines/grailquest/realm-of-chaos.js";

const tk=(key,params)=>t(`battlesim531.${key}`,params);
const el=key=>document.getElementById(`${ID}-${key}`);

const character=d=>d.fight?.player??d.player;
const active=d=>d?.fight?.status==='fighting';
const availableLizard=f=>f.player.dreamCompanions.findIndex((ally,index)=>ally.life>5
  && ![f.ally,...(f.extraAllies||[])].some(active=>active?.source==='dream' && active.sourceIndex===index));

function close(){el('overlay')?.classList.remove('active');}
function open(){
  if(!data()){showAlert(t('battlesim.no_active_playthrough'));return;}
  renderSim531();el('overlay').classList.add('active');
}

export function renderSim531(){
  if(!el('overlay'))return;
  const d=data();if(!d){close();return;}
  const p=character(d),f=d.fight,fighting=active(d);
  for(const key of [...fields,...supplies]){
    const effective=fighting?({hit:f.playerHit,bonus:f.playerBonus,armour:f.playerArmour})[key]:undefined;
    if(document.activeElement!==el(key))el(key).value=effective??p[key];
    el(key).disabled=fighting;
  }
  for(const key of flags){el(key).checked=!!p[key];el(key).disabled=fighting;}
  for(const key of options)el('option-'+key).disabled=fighting;
  for(const id of REALM_EQUIPMENT){el('gear-'+id).checked=p.equipment.includes(id);el('gear-'+id).disabled=fighting;}
  const spec=REALM_ENCOUNTERS.find(row=>row.id===Number(el('encounter').value));
  el('manual-stats').hidden=!spec?.manualStats;
  el('manualBonus-row').hidden=!spec?.manualStats && !spec?.manualBonus;
  for(const key of ['manualLife','manualHit','manualBonus'])el(key).disabled=fighting;
  const selected=el('target').value,targets=f?rules.realmTargets(f):[];
  el('target').innerHTML=targets.map(({index,foe})=>`<option value="${index}">${escapeHtml(tk('target_label',{enemy:foe.name,life:foe.life}))}</option>`).join('');
  if(targets.some(row=>String(row.index)===selected))el('target').value=selected;
  el('target').disabled=!fighting;
  el('status').textContent=!f?tk('pick'):tk(f.status)+(fighting?` · ${f.first?tk('round',{round:f.rounds}):tk('tie')}`:'');
  el('roll').disabled=!fighting || !f.first;
  el('initiative').hidden=!fighting || !!f.first;
  const target=Number(el('target').value);
  el('friendly').disabled=!fighting || f.rounds>0 || f.friendlyAttempts.includes(target);
  el('bribe').disabled=!fighting || f.rounds>0 || !f.spec.bribe || p.gold<f.spec.bribe || f.bribeAttempts.includes(target);
  el('spook').hidden=!f?.spec.spookBasher;
  el('spook').disabled=!fighting || !p.spookBasher || f.rounds>0 || f.spookBasherTried;
  el('gem').disabled=!fighting || !p.horrorgem || f.rounds>0 || f.spec.dream;
  el('call_dragon').disabled=!fighting || f.spec.dream || !p.dragonStone || !!f.ally
    || p.dragonCalls>=(f.options.oneUseStone?1:3);
  el('use_mastiff').disabled=!fighting || f.spec.dream || f.rounds>0 || !!f.ally || !(p.companion?.life>5);
  el('use_lizard').disabled=!fighting || f.spec.dream || f.rounds>0 || availableLizard(f)<0;
  el('companion_life').value=p.companion?.life??0;el('companion_life').disabled=fighting || !p.companion;
  el('dream_companions').textContent=tk('dream_companions',{count:p.dreamCompanions.filter(ally=>ally.life>5).length});
  for(const key of ['new_character','take_mastiff','sleep','wand','astral','walk','strength'])el(key).disabled=fighting;
  el('wand').disabled||=!p.healingWand || p.life<=0;
  el('heal_potion').disabled=fighting || p.potions<=0 || p.life<=0;
  el('heal_salve').disabled=fighting || p.salves<=0 || p.life<=0;
  el('sleep').disabled||=p.life<=0;
  el('walk').disabled||=p.pathwalker<=0;
  el('next_dream').hidden=!d.dream?.redream && !d.sleepDream;
  el('next_dream').disabled=fighting;
  el('wake_roll').hidden=d.dream?.number!==4 || d.dream.wake;
  el('wake_roll').disabled=fighting;
  el('fight_warthog').hidden=!d.dream?.optionalEncounter;
  el('fight_warthog').disabled=fighting || p.life<=5;
  el('log').innerHTML=d.log.slice(-100).reverse().map(text=>`<div>${escapeHtml(text)}</div>`).join('');
  el('history').innerHTML=d.history.slice(-50).reverse().map(row=>`<div class="bsim-history-row">${escapeHtml(row.enemy)}: ${escapeHtml(tk(row.outcome))}</div>`).join('');
}
export function setSim531Visible(visible){
  if(el('btn'))el('btn').style.display=visible?'':'none';
  if(!visible)close();
}

export function initSim531(){
  if(el('overlay'))return;
  const input=key=>`<label id="${ID}-${key}-row" class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk(key)}</span><input id="${ID}-${key}" class="inv-edit-input inv-qty-input" type="number" min="0" step="1"></label>`;
  const button=key=>`<button id="${ID}-${key}" class="inv-add-btn">${tk(key)}</button>`;
  const check=(key,prefix='')=>`<label class="inv-edit-row"><input id="${ID}-${prefix}${key}" type="checkbox">${tk(key)}</label>`;
  const overlay=document.createElement('div');overlay.id=`${ID}-overlay`;overlay.className='inv-overlay';
  overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${tk('title')}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div>
    <div class="bsim-body"><div class="bsim-col bsim-col-left"><div class="bsim-side"><div class="bsim-side-title">${tk('character')}</div>${fields.map(input).join('')}${button('new_character')}
    <details><summary>${tk('supplies')}</summary>${supplies.map(input).join('')}${flags.map(key=>check(key)).join('')}${input('companion_life')}${button('take_mastiff')}<p id="${ID}-dream_companions"></p></details>
    <details><summary>${tk('equipment')}</summary>${REALM_EQUIPMENT.map(key=>check(key,'gear-')).join('')}</details></div>
    <div class="bsim-side"><label class="inv-edit-row">${tk('encounter')}<select id="${ID}-encounter" class="inv-edit-input">${REALM_ENCOUNTERS.map(spec=>`<option value="${spec.id}">${escapeHtml(label(spec.id))}</option>`).join('')}</select></label>
    <details><summary>${tk('settings')}</summary>${options.map(key=>check(key,'option-')).join('')}</details>
    <div id="${ID}-manual-stats">${input('manualLife')}${input('manualHit')}</div>${input('manualBonus')}<p>${tk('missing_note')}</p>${button('start')}<div id="${ID}-status" class="bsim-status"></div>
    <label class="inv-edit-row">${tk('target')}<select id="${ID}-target" class="inv-edit-input"></select></label>
    <div class="bsim-btn-row">${['initiative','roll','friendly','bribe','spook','gem','use_mastiff','use_lizard','call_dragon'].map(button).join('')}</div>
    <div class="bsim-btn-row">${['heal_potion','heal_salve','wand','sleep','next_dream','wake_roll','fight_warthog'].map(button).join('')}</div>
    <div class="bsim-btn-row">${['astral','walk','strength'].map(button).join('')}</div></div><p>${tk('note')}</p><p>${tk('manual')}</p></div>
    <div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${tk('history')}</summary><div id="${ID}-history" class="bsim-history-list"></div></details><div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
  document.body.appendChild(overlay);
  const btn=document.createElement('button');btn.id=`${ID}-btn`;btn.innerHTML=shortcutLabel(t('battlesim.title'));btn.style.display='none';
  getPlayBtnRow().appendChild(btn);btn.addEventListener('click',open);el('close').addEventListener('click',close);
  let backdrop=false;
  overlay.addEventListener('mousedown',event=>{backdrop=event.target===overlay;});
  overlay.addEventListener('click',event=>{if(event.target===overlay && backdrop)close();});
  registerPanelShortcut('KeyS',{getButton:()=>btn,getOverlay:()=>overlay,
    otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==`${ID}-overlay`),open,close});
  for(const key of ['encounter','target'])el(key).addEventListener('change',renderSim531);
  for(const key of [...fields,...supplies])el(key).addEventListener('change',()=>action(d=>{
    if(active(d))return;
    const value=Number(el(key).value),p=character(d);
    if(!Number.isSafeInteger(value) || value<0 || key==='life' && value>p.maxLife || key==='maxLife' && value<p.life
      || key==='hit' && (value<1 || value>12) || key==='dragonCalls' && value>3 || key==='pathwalker' && value>2)throw new RangeError('Invalid character');
    p[key]=value;
  }));
  for(const key of flags)el(key).addEventListener('change',()=>action(d=>{if(!active(d))character(d)[key]=el(key).checked;}));
  for(const id of REALM_EQUIPMENT)el('gear-'+id).addEventListener('change',()=>action(d=>{
    if(!active(d))rules.realmChooseEquipment(character(d),REALM_EQUIPMENT.filter(key=>el('gear-'+key).checked));
  }));
  el('companion_life').addEventListener('change',()=>action(d=>{
    const p=character(d),value=Number(el('companion_life').value);
    if(!active(d) && p.companion && Number.isSafeInteger(value) && value>=0 && value<=25)p.companion.life=value;
  }));
  el('take_mastiff').addEventListener('click',()=>action(d=>{
    if(!active(d) && !character(d).companion)character(d).companion={...REALM_COMPANION};
  }));
  el('new_character').addEventListener('click',()=>confirm(tk('new_confirm'),d=>{
    if(active(d))return;
    record(d);const p=character(d);rules.realmReincarnate(p);
    d.player=p;d.fight=null;d.dream=null;d.sleepDream=false;d.loggedEvents=0;
  }));
  el('start').addEventListener('click',()=>{
    const settings=Object.fromEntries(options.map(key=>[key,el('option-'+key).checked]));
    settings.enemyBonus=el('manualBonus').value===''?null:Number(el('manualBonus').value);
    settings.manualStats={life:Number(el('manualLife').value),hit:Number(el('manualHit').value),bonus:settings.enemyBonus};
    const apply=d=>{start(d,Number(el('encounter').value),settings);d.dream=null;d.sleepDream=false;};
    if(active(data()))confirm(tk('replace_fight'),apply);else action(apply);
  });
  const combat=(key,apply)=>el(key).addEventListener('click',()=>action(d=>{if(active(d))apply(d.fight,Number(el('target').value));}));
  combat('roll',rules.rollRealmRound);combat('initiative',f=>rules.rerollRealmInitiative(f));
  combat('friendly',rules.realmTryFriendly);combat('bribe',rules.realmTryBribe);
  combat('spook',f=>rules.realmUseSpookBasher(f));combat('gem',rules.realmUseHorrorgem);
  combat('call_dragon',f=>rules.realmCallDragon(f));combat('use_mastiff',f=>rules.realmUseCompanion(f,'mastiff'));
  combat('use_lizard',f=>rules.realmUseCompanion(f,'dream',availableLizard(f)));
  for(const [key,kind]of [['heal_potion','potion'],['heal_salve','salve']])el(key).addEventListener('click',()=>action(d=>{if(!active(d))rules.realmHeal(character(d),kind);}));
  el('wand').addEventListener('click',()=>action(d=>{if(!active(d) && character(d).healingWand)rules.realmHealingWand(character(d));}));
  el('sleep').addEventListener('click',()=>action(d=>{
    if(active(d))return;const result=rules.realmSleep(character(d));
    if(result?.dream){d.sleepDream=true;d.dream=null;}
  }));
  el('next_dream').addEventListener('click',()=>action(d=>{
    if(!active(d) && (d.sleepDream || d.dream?.redream)){d.sleepDream=false;dream(d,rules.realmDreamScore());}
  }));
  el('wake_roll').addEventListener('click',()=>action(d=>{if(!active(d) && d.dream?.number===4 && !d.dream.wake)dream(d,4);}));
  el('fight_warthog').addEventListener('click',()=>action(d=>{if(!active(d) && d.dream?.optionalEncounter){start(d,'dream12');d.dream.optionalEncounter=null;}}));
  el('astral').addEventListener('click',()=>action(d=>{
    if(active(d))return;const result=rules.realmAstralRoll(character(d));
    d.log.push(tk('travel_result',{roll:result.roll,result:result.destination?tk('destination',{section:result.destination}):tk('path_result')}));
  }));
  el('walk').addEventListener('click',()=>action(d=>{if(!active(d))rules.realmWalkPath(character(d));}));
  el('strength').addEventListener('click',()=>action(d=>{
    if(active(d))return;const result=rules.realmStrengthContest(character(d));
    if(result)d.log.push(tk(result.outcome==='win'?'strength_win':result.outcome==='loss'?'strength_loss':'strength_tie'));
  }));
}

export { initSim531 as init, renderSim531 as render, setSim531Visible as setVisible };
