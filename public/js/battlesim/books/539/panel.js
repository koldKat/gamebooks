import { createCustomOpponentSetup } from '../../custom-setup.js';
import { shadowsOpponentFields } from '../../engines/gateway-opponents.js';
let customSetup;
import { ID, fields, flags } from './definition.js';
import { createState } from './state.js';
import { createCombat } from './combat.js';

// BEGIN SIMULATOR WIRING
const simulatorContext = () => ({ ALL_PANEL_OVERLAY_IDS, ID, SHADOWS_CHECKS, action, active, close, confirm, currentBookId, currentPlaythrough, data, el, escapeHtml, fields, flags, getPlayBtnRow, initSim539, label, log, open, player, record, registerPanelShortcut, renderSim539, report, resolveShadowsCheck, rules, saveState, setSim539Visible, shortcutLabel, showAlert, showConfirm, t, tk });
const { data } = createState(simulatorContext);
const { log, record, report, action, confirm } = createCombat(simulatorContext);
// END SIMULATOR WIRING
import { currentPlaythrough, currentBookId, saveState } from "../../../core/state.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { showAlert, showConfirm } from "../../../ui-helpers/confirm.js";
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import * as rules from "../.././engines/forbidden-gateway.js";
import { SHADOWS_CHECKS, resolveShadowsCheck } from "../.././engines/forbidden-gateway-checks.js";

const tk = (key, params) => t(`battlesim539.${key}`, params);
const el = key => document.getElementById(`${ID}-${key}`);

const player = data => data.fight?.player ?? data.player;
const active = data => data?.fight?.status === 'fighting';
const label = spec => spec.custom ? spec.name : tk('encounter_label',{ enemy:tk('names.'+spec.name),section:spec.id ?? spec.section });

function close() { el('overlay')?.classList.remove('active'); }
function open() {
  if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  renderSim539(); el('overlay').classList.add('active');
}

export function renderSim539() {
  if (!el('overlay')) return;
  const d=data(); if (!d) { close(); return; }
  customSetup?.render();
  const p=player(d),f=d.fight,fighting=active(d);
  for (const key of fields) {
    if (document.activeElement!==el(key)) el(key).value=p[key];
    el(key).disabled=fighting;
  }
  for (const key of flags) { el(key).checked=!!p[key]; el(key).disabled=fighting; }
  el('upgraded').checked=p.knobkerrieDamage===4; el('upgraded').disabled=fighting;
  el('weapon').value=p.weapon;
  el('weapon').disabled=fighting && (f.spec.unarmed || f.spec.id===257
    || f.spec.mode==='ordinary' && f.queue[0]!==-1
    || f.spec.mode==='lurker' && !['choice','gun'].includes(f.phase));
  el('new_character').disabled=fighting;
  el('rest').disabled=fighting || p.stamina<=0 || p.endurance<=0;
  const spec=rules.SHADOWS_ENCOUNTERS.find(row => String(row.id)===el('encounter').value);
  el('remaining-row').hidden=!spec || spec.enemies.length!==1 || !!spec.enemies[0].copyPlayer;
  el('remaining').disabled=fighting; el('diningRoom').disabled=fighting;
  el('start').disabled=p.stamina<=0 || p.endurance<=0;
  const selected=el('target').value,targets=f ? rules.shadowsTargets(f) : [];
  el('target').innerHTML=targets.map(({enemy,index}) => `<option value="${index}">${escapeHtml(tk('target_label',{
    enemy:enemy.displayName || tk('names.'+enemy.name),health:enemy.stamina ?? enemy.endurance,
    pool:tk(enemy.stamina===undefined ? 'endurance':'stamina') }))}</option>`).join('');
  if (targets.some(row => String(row.index)===selected)) el('target').value=selected;
  el('target').disabled=!fighting;
  el('status').textContent=f ? tk('status.'+f.status)+(f.destination ? ' · '+tk('destination',{section:f.destination}) : '') : tk('pick');
  el('turn').textContent=fighting && f.spec.mode==='ordinary' && !f.opening
    ? tk('turn',{round:f.round,actor:f.queue[0]===-1 ? tk('you'):(f.enemies[f.queue[0]]?.displayName || tk('names.'+f.enemies[f.queue[0]]?.name))}) : '';
  el('opening').hidden=!fighting || !f.opening;
  el('flee').hidden=!fighting || !f.opening || f.spec.id!==257;
  el('attack').disabled=!fighting || !!f.opening || !['ordinary','twoStrikes','gunOnly'].includes(f?.spec.mode)
    || f.spec.mode==='gunOnly' && (p.weapon!=='revolver' || p.bullets<1)
    || f.spec.mode!=='gunOnly' && f.queue?.[0]===-1 && p.weapon==='revolver' && p.bullets<1;
  el('finishShots').hidden=!fighting || f.spec.mode!=='gunOnly';
  for (const kind of ['slime','breakFree','resist','escape','salt','gun','finishLurkerShots']) {
    const phases={slime:['slime'],breakFree:['held','lastBreakFree'],resist:['knockdown'],
      escape:['choice','escape'],salt:['choice'],gun:['choice','gun'],finishLurkerShots:['gun']};
    el(kind).hidden=!fighting || f.spec.mode!=='lurker' || !phases[kind].includes(f.phase);
    el(kind).disabled=kind==='gun' && (p.weapon!=='revolver' || p.bullets<1);
  }
  for (const key of ['roll_check','manual_success','manual_failure','roll_attribute']) el(key).disabled=fighting || p.stamina<=0 || p.endurance<=0;
  el('log').innerHTML=d.log.slice(-100).reverse().map(text => `<div>${escapeHtml(text)}</div>`).join('');
  el('history').innerHTML=d.history.slice(-50).reverse().map(row => `<div class="bsim-history-row">${escapeHtml(row.enemy)}: ${escapeHtml(tk('status.'+row.outcome))}</div>`).join('');
}
export function setSim539Visible(visible) {
  if (el('btn')) el('btn').style.display=visible ? '' : 'none';
  if (!visible) close();
}
export function initSim539() {
  if (el('overlay')) return;
  const input=key => `<label id="${ID}-${key}-row" class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk(key)}</span><input id="${ID}-${key}" class="inv-edit-input inv-qty-input" type="number" min="0" step="1"></label>`;
  const button=key => `<button id="${ID}-${key}" class="inv-add-btn">${tk(key)}</button>`;
  const check=key => `<label class="inv-edit-row"><input id="${ID}-${key}" type="checkbox">${tk(key)}</label>`;
  const overlay=document.createElement('div'); overlay.id=`${ID}-overlay`; overlay.className='inv-overlay';
  overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${tk('title')}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div>
    <div class="bsim-body"><div class="bsim-col bsim-col-left"><div class="bsim-side"><div class="bsim-side-title">${tk('character')}</div>${fields.map(input).join('')}
    <label class="inv-edit-row">${tk('weapon')}<select id="${ID}-weapon" class="inv-edit-input">${Object.keys(rules.SHADOWS_WEAPONS).map(key => `<option value="${key}">${tk(key)}</option>`).join('')}</select></label>
    <details><summary>${tk('equipment')}</summary>${flags.map(check).join('')}${check('upgraded')}</details><div class="bsim-btn-row">${button('new_character')}${button('rest')}</div></div>
    <div class="bsim-side"><label class="inv-edit-row">${tk('encounter')}<select id="${ID}-encounter" class="inv-edit-input">${rules.SHADOWS_ENCOUNTERS.map(spec => `<option value="${spec.id}">${escapeHtml(label(spec))}</option>`).join('')}</select></label>
    ${input('remaining')}${check('diningRoom')}${button('start')}<div id="${ID}-status" class="bsim-status"></div><div id="${ID}-turn"></div>
    <label class="inv-edit-row">${tk('target')}<select id="${ID}-target" class="inv-edit-input"></select></label><div class="bsim-btn-row">${['opening','flee','attack','finishShots','slime','breakFree','resist','escape','salt','gun','finishLurkerShots'].map(button).join('')}</div></div>
    <details class="bsim-side"><summary>${tk('checks')}</summary><label class="inv-edit-row">${tk('printed_check')}<select id="${ID}-check" class="inv-edit-input">${SHADOWS_CHECKS.map(spec => `<option value="${spec.section}">${escapeHtml(label(spec))}</option>`).join('')}</select></label>
    <div class="bsim-btn-row">${['roll_check','manual_success','manual_failure'].map(button).join('')}</div><p>${tk('manual_note')}</p>
    <label class="inv-edit-row">${tk('attribute')}<select id="${ID}-attribute" class="inv-edit-input">${['strength','mentality','dexterity'].map(key => `<option value="${key}">${tk(key)}</option>`).join('')}</select></label>${button('roll_attribute')}</details><p>${tk('note')}</p></div>
    <div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${tk('history')}</summary><div id="${ID}-history" class="bsim-history-list"></div></details><div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
  document.body.appendChild(overlay);
  customSetup = createCustomOpponentSetup({document, id: ID, t, getRun: currentPlaythrough, getData: data,
    fields: shadowsOpponentFields.map(f => ({...f, label: tk(f.key)})),
    defaults: {mentality: 2, mental: 0, disbelief: 0, enduranceDamage: 0},
    presets: rules.SHADOWS_ENCOUNTERS.filter(e => e.mode === 'ordinary').flatMap(e => e.enemies.filter(enemy => !enemy.copyPlayer).map(enemy => ({
      displayName: tk('names.' + enemy.name), dexterity: enemy.dexterity ?? 0, mentality: enemy.mentality ?? 2,
      health: enemy.stamina ?? enemy.endurance, mental: Number(enemy.stamina === undefined), disbelief: Number(!!enemy.disbelief),
      staminaDamage: enemy.damage.stamina, enduranceDamage: enemy.damage.endurance,
    }))),
  });
  const btn=document.createElement('button'); btn.id=`${ID}-btn`; btn.innerHTML=shortcutLabel(t('battlesim.title')); btn.style.display='none';
  getPlayBtnRow().appendChild(btn); btn.addEventListener('click',open); el('close').addEventListener('click',close);
  let backdrop=false;
  overlay.addEventListener('mousedown',event => { backdrop=event.target===overlay; });
  overlay.addEventListener('click',event => { if (event.target===overlay && backdrop) close(); });
  registerPanelShortcut('KeyS',{getButton:() => btn,getOverlay:() => overlay,
    otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id!==`${ID}-overlay`),open,close});
  el('encounter').addEventListener('change',renderSim539);
  for (const key of fields) el(key).addEventListener('change',() => action(d => {
    if (active(d)) return;
    const p=player(d),value=Number(el(key).value);
    if (!el(key).value.trim() || !Number.isSafeInteger(value) || value<0
      || ['strength','mentality','dexterity'].includes(key) && value>9 || key==='bullets' && value>6
      || key==='stamina' && value>p.maxStamina || key==='endurance' && value>p.maxEndurance
      || key==='maxStamina' && value<p.stamina || key==='maxEndurance' && value<p.endurance) throw new RangeError('Invalid character');
    p[key]=value;
  }));
  for (const key of flags) el(key).addEventListener('change',() => action(d => {
    if (active(d)) return;
    const p=player(d); p[key]=el(key).checked;
    if (!p[key] && p.weapon===key) p.weapon='knobkerrie';
  }));
  el('upgraded').addEventListener('change',() => action(d => { if (!active(d)) player(d).knobkerrieDamage=el('upgraded').checked ? 4 : 3; }));
  el('weapon').addEventListener('change',() => action(d => {
    if (el('weapon').disabled) return;
    if (!rules.equipShadows(player(d),el('weapon').value)) throw new RangeError('Unavailable weapon');
  }));
  el('new_character').addEventListener('click',() => confirm(tk('new_confirm'),d => {
    if (active(d)) return;
    d.player=rules.createShadowsCharacter(); d.fight=null;
  }));
  el('rest').addEventListener('click',() => action(d => {
    if (active(d)) return;
    const recovery=rules.recoverShadows(player(d)); log(d,tk('recovery',recovery));
  }));
  el('start').addEventListener('click',() => {
    const id=Number(el('encounter').value),options={diningRoom:el('diningRoom').checked};
    if (!el('remaining-row').hidden && el('remaining').value.trim()) options.remainingHealth=Number(el('remaining').value);
    const apply=d => { const fight=rules.startShadowsFight(player(d),id,customSetup.settings(d,options)); record(d); d.fight=fight; };
    if (active(data())) confirm(tk('replace_fight'),apply); else action(apply);
  });
  for (const key of ['opening','flee']) el(key).addEventListener('click',() => action(d => {
    if (active(d)) report(d,rules.resolveShadowsOpening(d.fight,Math.random,key==='flee'));
  }));
  el('attack').addEventListener('click',() => action(d => {
    if (!active(d)) return;
    report(d,d.fight.spec.mode==='ordinary' ? rules.shadowsAttack(d.fight,Number(el('target').value)) : rules.shadowsScriptStrike(d.fight));
  }));
  el('finishShots').addEventListener('click',() => action(d => {
    if (active(d)) rules.finishShadowsShots(d.fight);
  }));
  for (const key of ['slime','breakFree','resist','escape','salt','gun','finishLurkerShots']) el(key).addEventListener('click',() => action(d => {
    if (active(d)) report(d,rules.shadowsLurker(d.fight,key==='finishLurkerShots' ? 'finishShots' : key));
  }));
  for (const [key,manual] of [['roll_check',undefined],['manual_success',true],['manual_failure',false]]) {
    el(key).addEventListener('click',() => action(d => {
      if (!active(d)) report(d,resolveShadowsCheck(player(d),Number(el('check').value),Math.random,manual));
    }));
  }
  el('roll_attribute').addEventListener('click',() => action(d => {
    if (!active(d)) report(d,rules.shadowsTest(player(d),el('attribute').value));
  }));
}

export { initSim539 as init, renderSim539 as render, setSim539Visible as setVisible };
