import { currentPlaythrough, currentBookId, saveState } from '../core/state.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { showAlert, showConfirm } from '../ui-helpers/confirm.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';
import { LEGION_ENCOUNTERS, LEGION_DREAMS, LEGION_EQUIPMENT } from './engines/grailquest/legion-of-the-dead-roster.js';
import * as rules from './engines/grailquest/legion-of-the-dead.js';

const ID = 'sim533';
const tk = (key, params) => t(`battlesim533.${key}`, params);
const el = key => document.getElementById(`${ID}-${key}`);
const fields = ['life','maxLife','armour','permanent','experience','gold'];
const stocks = ['bolts','fireballs','cubeUses','waterUses','brandyUses','amuletUses','wandUses','ringUses','teaUses'];
const flags = ['jadeGarlic','monkey','germ','deathOde','sunstone','leek','collar','wandWord','poisonImmune'];
const settings = ['killEnemies','useSkeleton','useMonkey','useGerm','invisibilityAllowed','indoors'];
const spells = ['panic','pow','pill','pad','pip','pin','repeater','invisibility','firefinger','fireball','plop','pid','pals','pil'];
const items = ['cube','water','brandy','amulet','wand','ring','flattened','cold','moonshine','finger','armour','teaFull','teaDice',
  'skeleton','orangutiger','dragon','monkey','germ','jadeGarlic','deathOde','sunstone','leek','collar','wandWord'];
const p = d => d.fight?.player ?? d.player;
const active = d => d?.fight?.status === 'fighting';
function data() {
  if (Number(currentBookId) !== 533) return null;
  const run = currentPlaythrough();
  if (!run) return null;
  const d = run[ID] ||= { player:rules.createLegionCharacter(),fight:null,history:[],log:[] };
  const path = run.path ?? [];
  const sections = d.observedPathLength === undefined ? path.slice(-1)
    : path.slice(Math.min(d.observedPathLength,path.length));
  for (const section of sections) {
    rules.legionVisit(p(d),section);
    if (d.fight) rules.settleLegionFight(d.fight);
  }
  d.observedPathLength = path.length;
  return d;
}
function label(id) {
  const spec = [...LEGION_ENCOUNTERS,...LEGION_DREAMS].find(row => row.id === id);
  const enemy = tk('enemy_names.'+id);
  return id === 'dream7' ? tk('dream_label',{enemy,number:7})
    : tk('encounter_label',{enemy,section:spec?.section ?? id});
}
function close() { el('overlay')?.classList.remove('active'); }
function open() {
  if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
  renderSim533(); el('overlay').classList.add('active');
}
function record(d) {
  const f = d.fight;
  if (!f || f.recorded || !['win','loss'].includes(f.status)) return;
  f.recorded = true;
  d.history.push({enemy:label(f.spec.id),outcome:f.status,
    ts:Math.max(Date.now(),(d.history.at(-1)?.ts ?? 0)+1)});
}
function report(d, result, key) {
  if (!result) return;
  const rows = result.events ?? [result];
  for (const event of rows) {
    d.log.push(tk('result',{action:tk(result.events ? event.kind : key ?? event.kind ?? event.spell ?? 'action'),
      roll:event.roll ?? '-',damage:event.damage ?? event.loss ?? 0,
      outcome:event.fatal || event.dead ? tk('fatal') : event.manual ? tk('manual_result')
        : typeof event.success === 'boolean' ? tk(event.success ? 'success':'failed') : ''}));
  }
  if (result.healing !== undefined) d.log.push(tk('healing_result',{amount:result.healing}));
}
function action(apply) {
  const d = data(); if (!d) return;
  try {
    apply(d); record(d); d.log = d.log.slice(-150);
    saveState(); renderSim533();
  } catch { showAlert(tk('invalid')); renderSim533(); }
}
function confirm(message, apply) {
  const d = data(), run = currentPlaythrough(), previous = d?.fight;
  if (!d) return;
  showConfirm(message,() => {
    if (data() === d && currentPlaythrough() === run && d.fight === previous) action(apply);
  });
}
function start(d,id,options={}) {
  const next = rules.startLegionFight(p(d),id,options);
  record(d); d.fight = next; d.pendingDream = null;
}
function dream(d,number) {
  const result = rules.legionDream(p(d),number); if (!result) return;
  report(d,result,'dream'); d.pendingDream = result.retry ? 0 : null;
  if (result.encounter) start(d,result.encounter);
}
export function renderSim533() {
  if (!el('overlay')) return;
  const d = data(); if (!d) { close(); return; }
  const player = p(d), f = d.fight, fighting = active(d);
  for (const key of [...fields,...stocks]) {
    if (document.activeElement !== el(key)) el(key).value = player[key];
    el(key).disabled = fighting;
  }
  for (const key of flags) { el(key).checked = !!player[key]; el(key).disabled = fighting; }
  for (const key of settings) el('option-'+key).disabled = fighting;
  for (const key of LEGION_EQUIPMENT) {
    el('gear-'+key).checked = player.equipment.includes(key);
    el('gear-'+key).disabled = fighting;
  }
  el('weapon').value = player.weapon; el('weapon').disabled = fighting;
  const selected = el('target').value, targets = f ? rules.legionTargets(f) : [];
  el('target').innerHTML = targets.map(({index,foe}) => `<option value="${index}">${escapeHtml(tk('target_label',{enemy:foe.name,life:foe.life}))}</option>`).join('');
  if (targets.some(row => String(row.index) === selected)) el('target').value = selected;
  const target = Number(el('target').value);
  el('target').disabled = !fighting;
  el('defender').value = f?.enemyTargets[target] ?? 'player';
  el('defender').disabled = !fighting;
  for (const key of ['skeleton','orangutiger','dragon']) {
    el('defender').querySelector(`option[value="${key}"]`).disabled = !(f?.allies[key]?.life > 5);
    const ally = fighting ? f.allies[key] : player.companions[key];
    el('ally-'+key).value = ally?.life ?? 0;
    el('ally-'+key).disabled = fighting || !ally;
  }
  const spec = LEGION_ENCOUNTERS.find(row => String(row.id) === el('encounter').value);
  el('enemyLife-row').hidden = !spec?.manualLife;
  el('enemyLife').disabled = fighting;
  el('enemyCount-row').hidden = typeof spec?.count !== 'string';
  el('enemyCount').disabled = fighting;
  el('status').textContent = !f ? tk('pick') : tk(f.status)+(fighting ? ' · '+tk(f.first ? 'round':'tie',{round:f.round}) : '');
  el('roll').disabled = !fighting || !f.first;
  el('initiative').hidden = !fighting || !!f.first;
  el('friendly').disabled = !fighting || f.round > 0 || !!f.spec.noFriendly || !!f.spec.contest;
  el('use_collar').disabled = !fighting || f.round > 0 || !player.collar || !!f.collarAttempted;
  el('bat').disabled = !fighting || !f.bat && player.ringUses < 1;
  el('use_bolt').disabled = !fighting || player.bolts < 1 || f.stunTurns > 0;
  el('use_fireball').disabled = !fighting || player.fireballs < 1 || f.stunTurns > 0;
  const spell = el('spell').value;
  el('cast').disabled = player.life <= 0 || fighting && f.stunTurns > 0
    || (player.spells[spell] ?? 0) >= (spell === 'invisibility' ? 1 : 3)
    || ['firefinger','fireball'].includes(spell) && !!player.spells[spell+'Ready']
    || ['panic','pow','pill','pad','repeater'].includes(spell) && !fighting
    || spell === 'invisibility' && (!fighting || !f.options.invisibilityAllowed)
    || spell === 'plop' && (!player.currentSection || player.spells.plopSection === player.currentSection);
  for (const key of ['acquire','new_character','sleep']) el(key).disabled = fighting || key !== 'new_character' && player.life <= 0;
  for (const kind of ['cube','water','brandy','tea']) el('heal_'+kind).disabled = fighting || player.life <= 0 || player[kind+'Uses'] < 1;
  el('dream').hidden = d.pendingDream === null || d.pendingDream === undefined; el('dream').disabled = fighting;
  el('use_amulet').disabled = player.life <= 0 || player.amuletUses < 1;
  el('use_wand').disabled = player.life <= 0 || !player.wandWord || player.wandUses < 1;
  el('use_sunstone').disabled = player.life <= 0 || !player.sunstone;
  el('log').innerHTML = d.log.slice(-100).reverse().map(text => `<div>${escapeHtml(text)}</div>`).join('');
  el('history').innerHTML = d.history.slice(-50).reverse().map(row => `<div class="bsim-history-row">${escapeHtml(row.enemy)}: ${escapeHtml(tk(row.outcome))}</div>`).join('');
}
export function setSim533Visible(visible) {
  if (el('btn')) el('btn').style.display = visible ? '' : 'none';
  if (!visible) close();
}
export function initSim533() {
  if (el('overlay')) return;
  const input = key => `<label id="${ID}-${key}-row" class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk(key)}</span><input id="${ID}-${key}" class="inv-edit-input inv-qty-input" type="number" min="0" step="any"></label>`;
  const button = key => `<button id="${ID}-${key}" class="inv-add-btn">${tk(key)}</button>`;
  const check = (key,prefix='') => `<label class="inv-edit-row"><input id="${ID}-${prefix}${key}" type="checkbox">${tk(key)}</label>`;
  const select = (key,values) => `<label class="inv-edit-row">${tk(key)}<select id="${ID}-${key}" class="inv-edit-input">${values.map(value => `<option value="${value}">${tk(value)}</option>`).join('')}</select></label>`;
  const overlay = document.createElement('div'); overlay.id = `${ID}-overlay`; overlay.className = 'inv-overlay';
  overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${tk('title')}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div>
    <div class="bsim-body"><div class="bsim-col bsim-col-left"><div class="bsim-side"><div class="bsim-side-title">${tk('character')}</div>${fields.map(input).join('')}${select('weapon',['ej','unarmed','leek'])}${button('new_character')}
    <details><summary>${tk('supplies')}</summary>${stocks.map(input).join('')}${flags.map(key => check(key)).join('')}${select('item',items)}${button('acquire')}${['skeleton','orangutiger','dragon'].map(key => input('ally-'+key)).join('')}</details>
    <details><summary>${tk('equipment')}</summary>${LEGION_EQUIPMENT.map(key => `<label class="inv-edit-row"><input id="${ID}-gear-${key}" type="checkbox">${escapeHtml(tk('gear.'+key))}</label>`).join('')}</details></div>
    <div class="bsim-side"><label class="inv-edit-row">${tk('encounter')}<select id="${ID}-encounter" class="inv-edit-input">${LEGION_ENCOUNTERS.map(spec => `<option value="${spec.id}">${escapeHtml(label(spec.id))}</option>`).join('')}</select></label>
    <details><summary>${tk('settings')}</summary>${settings.map(key => check(key,'option-')).join('')}${input('enemyCount')}${input('enemyLife')}</details>${button('start')}<div id="${ID}-status" class="bsim-status"></div>
    <label class="inv-edit-row">${tk('target')}<select id="${ID}-target" class="inv-edit-input"></select></label>${select('defender',['player','skeleton','orangutiger','dragon'])}
    <div class="bsim-btn-row">${['initiative','roll','friendly','use_collar','bat'].map(button).join('')}</div>
    <details><summary>${tk('spell')}</summary>${select('spell',spells)}<div class="bsim-btn-row">${['cast','use_bolt','use_fireball'].map(button).join('')}</div></details>
    <details><summary>${tk('artifacts')}</summary>${select('amulet',['heal','damage','gold','adjust_roll','extra_friendly','knockout'])}${button('use_amulet')}${select('wand',['gold','blue','red','green','silver'])}${button('use_wand')}${select('sunstone_use',['sell','permanent_life','destroy'])}${button('use_sunstone')}</details>
    <div class="bsim-btn-row">${['heal_cube','heal_water','heal_brandy','heal_tea','sleep','dream'].map(button).join('')}</div></div><p>${tk('note')}</p><p>${tk('manual')}</p></div>
    <div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${tk('history')}</summary><div id="${ID}-history" class="bsim-history-list"></div></details><div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
  document.body.appendChild(overlay);
  const btn = document.createElement('button'); btn.id = `${ID}-btn`; btn.innerHTML = shortcutLabel(t('battlesim.title')); btn.style.display = 'none';
  getPlayBtnRow().appendChild(btn); btn.addEventListener('click',open); el('close').addEventListener('click',close);
  let backdrop = false;
  overlay.addEventListener('mousedown',event => { backdrop = event.target === overlay; });
  overlay.addEventListener('click',event => { if (event.target === overlay && backdrop) close(); });
  registerPanelShortcut('KeyS',{getButton:() => btn,getOverlay:() => overlay,
    otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id => id !== `${ID}-overlay`),open,close});
  for (const key of ['encounter','target','spell']) el(key).addEventListener('change',renderSim533);
  for (const key of [...fields,...stocks]) el(key).addEventListener('change',() => action(d => {
    if (active(d)) return;
    const value = Number(el(key).value), player = p(d);
    if (!Number.isFinite(value) || value < 0 || key === 'life' && value > player.maxLife
      || key === 'maxLife' && value < player.life || [...stocks,'permanent','experience','gold'].includes(key) && !Number.isSafeInteger(value)) throw new RangeError('Invalid character');
    player[key] = value;
  }));
  for (const key of flags) el(key).addEventListener('change',() => action(d => { if (!active(d)) p(d)[key] = el(key).checked; }));
  for (const key of LEGION_EQUIPMENT) el('gear-'+key).addEventListener('change',() => action(d => {
    if (!active(d) && !rules.legionEquipment(p(d),LEGION_EQUIPMENT.filter(item => el('gear-'+item).checked))) throw new RangeError('Choose at most six');
  }));
  el('weapon').addEventListener('change',() => action(d => { if (!active(d) && !rules.legionEquip(p(d),el('weapon').value)) throw new RangeError('Unavailable weapon'); }));
  for (const key of ['skeleton','orangutiger','dragon']) el('ally-'+key).addEventListener('change',() => action(d => {
    const ally = p(d).companions[key], value = Number(el('ally-'+key).value);
    if (active(d) || !ally) return;
    if (!Number.isFinite(value) || value < 0 || value > (key === 'dragon' ? 7000 : 30)) throw new RangeError('Invalid companion');
    ally.life = value;
  }));
  el('acquire').addEventListener('click',() => action(d => { if (!active(d)) report(d,rules.legionTakeItem(p(d),el('item').value),'acquire'); }));
  el('new_character').addEventListener('click',() => confirm(tk('new_confirm'),d => {
    if (active(d)) return;
    const player = p(d);
    if (player.maxLife === 0) Object.assign(player,rules.initialLegionLife(player.permanent));
    else rules.legionReincarnate(player);
    d.player = player; d.fight = null; d.pendingDream = null;
    const section = currentPlaythrough().path?.at(-1); if (section) rules.legionVisit(player,section);
  }));
  el('start').addEventListener('click',() => {
    const value = el('encounter').value, id = /^\d+$/.test(value) ? Number(value) : value;
    const options = Object.fromEntries(settings.map(key => [key,el('option-'+key).checked]));
    for (const key of ['enemyCount','enemyLife']) if (el(key).value !== '') options[key] = Number(el(key).value);
    const apply = d => start(d,id,options);
    if (active(data())) confirm(tk('replace_fight'),apply); else action(apply);
  });
  const combat = (key,apply) => el(key).addEventListener('click',() => action(d => { if (active(d)) report(d,apply(d.fight,Number(el('target').value)),key); }));
  combat('roll',rules.legionRound); combat('initiative',f => rules.legionInitiative(f));
  combat('friendly',f => rules.legionFriendly(f)); combat('use_collar',f => rules.legionCollar(f));
  combat('bat',f => ({success:rules.legionBat(f)}));
  combat('use_bolt',(f,index) => rules.legionProjectile(f,'bolt',index));
  combat('use_fireball',(f,index) => rules.legionProjectile(f,'fireball',index));
  el('defender').addEventListener('change',() => action(d => { if (active(d)) rules.legionAssignEnemy(d.fight,Number(el('target').value),el('defender').value); }));
  el('cast').addEventListener('click',() => action(d => report(d,rules.legionCast(p(d),el('spell').value,Math.random,active(d) ? d.fight : null,Number(el('target').value)),el('spell').value)));
  el('use_amulet').addEventListener('click',() => action(d => {
    const value = el('amulet').value, use = {adjust_roll:'roll',extra_friendly:'friendly'}[value] ?? value;
    report(d,rules.legionAmulet(p(d),use,Math.random,active(d) ? d.fight : null),'use_amulet');
  }));
  el('use_wand').addEventListener('click',() => action(d => report(d,rules.legionWand(p(d),el('wand').value,active(d) ? d.fight : null),'use_wand')));
  el('use_sunstone').addEventListener('click',() => confirm(tk('sunstone_confirm'),d => {
    const use = {sell:'gold',permanent_life:'life',destroy:'destroy'}[el('sunstone_use').value];
    report(d,rules.legionSunstone(p(d),use,active(d) ? d.fight : null),'use_sunstone');
  }));
  for (const kind of ['cube','water','brandy','tea']) el('heal_'+kind).addEventListener('click',() => action(d => report(d,rules.legionHeal(p(d),kind,Math.random,active(d)),'heal_'+kind)));
  el('sleep').addEventListener('click',() => action(d => {
    if (active(d)) return;
    const result = rules.legionSleep(p(d)); if (!result) return;
    report(d,result,'sleep'); d.pendingDream = result.dream ?? null;
  }));
  el('dream').addEventListener('click',() => action(d => {
    if (!active(d) && d.pendingDream !== null && d.pendingDream !== undefined)
      dream(d,d.pendingDream || 2+Math.floor(Math.random()*6)+Math.floor(Math.random()*6));
  }));
}
