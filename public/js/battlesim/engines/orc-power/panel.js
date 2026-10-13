import { ORC_FIGURES } from './roster.js';
import { newOrcGame, addOrcGameFigure, beginOrcEncounter, updateOrcEncounter,
  cancelOrcEncounter, adjustOrcGameFigure } from './game.js';
import { orcAttack, orcMagic, orcMove, nextOrcTurn } from './core.js';
import { parseOrcStat, formatOrcStat, parseOrcInteger } from './fields.js';

const ID = 'sim654';
const stats = ['attack', 'defence', 'shooting', 'damage', 'life', 'magicPower', 'magicDamage'];
const equipment = ['armour', 'weaponAttack', 'weaponShooting', 'weaponDamage'];
const editStats = ['attack', 'defence', 'shooting', 'magicPower'];
const editNumbers = ['life', 'maxLife', 'damage', 'magicDamage', ...equipment];
const markers = ['none', 'sword', 'shield', 'crossbow', 'axe', 'life', 'star', 'death'];
const escape = value => String(value).replace(/[&<>"']/g,
  c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

export function createOrcPowerPanel({ document, t, getRun, getBookId, saveState,
  showAlert, showConfirm, getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, params) => t('battlesim654.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const busy = game => game?.fight?.status === 'fighting';
  let shownRun;
  function data() {
    if (Number(getBookId()) !== 654) return null;
    const run = getRun();
    return run ? run[ID] ||= { ...newOrcGame(), setup:{}, log:[] } : null;
  }
  function close() { el('overlay')?.classList.remove('active'); }
  function open() {
    if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    render(); el('overlay').classList.add('active');
  }
  function snapshot(game) {
    game.setup = Object.fromEntries([...el('setup').querySelectorAll('input,select')]
      .map(field => [field.id, field.type === 'checkbox' ? field.checked : field.value]));
  }
  function action(update) {
    const run = getRun(), original = data();
    if (!original) return;
    try {
      const draft = structuredClone(original), result = update(draft) || draft;
      if (run !== getRun() || Number(getBookId()) !== 654) return;
      result.log = (result.log || []).slice(-100);
      run[ID] = result; saveState(); render();
    } catch (_) { showAlert(tk('invalid')); }
  }
  function number(key, signed = false) {
    return parseOrcInteger(el(key).value, { minimum:signed ? -1000000 : 0 });
  }
  function fillTemplate() {
    const template = ORC_FIGURES.find(figure => figure.id === el('template').value);
    for (const key of stats) el(key).value = formatOrcStat(template[key]);
    for (const key of equipment) el(key).value = '0';
  }
  function fillEditor() {
    const game = data(), figures = busy(game) ? game.fight.figures : game?.figures;
    const figure = figures?.find(item => item.id === el('editFigure').value);
    if (!figure) return;
    for (const key of editStats) el('edit-' + key).value = formatOrcStat(figure[key]);
    for (const key of editNumbers) el('edit-' + key).value = String(figure[key]);
    el('edit-side').value = figure.side;
    for (const key of ['petrified', 'removed']) el('edit-' + key).checked = figure[key];
  }
  const name = figure => tk('figure.' + figure.template) + ' (' + figure.id.split('-').at(-1) + ')';
  function options(key, figures, selected) {
    const select = el(key), previous = selected ?? select.value;
    select.innerHTML = figures.map(figure => `<option value="${escape(figure.id)}">${escape(name(figure))}</option>`).join('');
    if (figures.some(figure => figure.id === previous)) select.value = previous;
  }
  function report(game, result) {
    const next = updateOrcEncounter(game, result.fight);
    if (result.results) for (const item of result.results) next.log.push(tk('magicResult', {
      figure:name(result.fight.figures.find(figure => figure.id === item.id)),
      power:item.power, defence:item.defence, damage:item.damage,
    }));
    else next.log.push(tk('attackResult', { attack:result.attack,
      defence:result.defence, damage:result.damage }));
    return next;
  }
  function render() {
    if (!el('overlay')) return;
    const game = data();
    if (!game) { shownRun = undefined; close(); return; }
    if (shownRun !== getRun()) {
      shownRun = getRun();
      for (const field of el('setup').querySelectorAll('input,select')) {
        if (field.type === 'checkbox') field.checked = game.setup[field.id] ?? field.defaultChecked;
        else field.value = game.setup[field.id] ?? (field.tagName === 'SELECT' ? field.options[0]?.value ?? '' : field.defaultValue);
      }
      if (!Object.keys(game.setup).length) fillTemplate();
      for (const key of ['legal', 'weaponAvailable', 'spellAvailable', 'editConfirmed', 'areaSpell']) el(key).checked = false;
      el('spellTargets').innerHTML = '';
    }
    const active = busy(game), fight = game.fight;
    for (const field of el('setup').querySelectorAll('input,select,button')) field.disabled = active;
    const living = game.figures.filter(figure => figure.life > 0);
    options('first', living.filter(figure => !figure.petrified));
    options('target', active ? fight.figures.filter(figure => figure.life > 0 && !figure.removed) : []);
    options('next', active ? fight.figures.filter(figure => figure.life > 0 && !figure.removed && !figure.petrified) : []);
    options('editFigure', active ? fight.figures : game.figures);
    const selectedTargets = new Set([...el('spellTargets').querySelectorAll('input:checked')].map(field => field.value));
    const targetMarkers = new Map([...el('spellTargets').querySelectorAll('select')].map(field => [field.dataset.figure, field.value]));
    el('spellTargets').innerHTML = (active ? fight.figures.filter(figure => figure.life > 0 && !figure.removed) : [])
      .map(figure => `<div class="inv-edit-row"><label class="bsim-checkbox"><input type="checkbox" value="${escape(figure.id)}"${selectedTargets.has(figure.id) ? ' checked' : ''}>${escape(name(figure))}</label><select class="inv-edit-input" data-figure="${escape(figure.id)}" aria-label="${escape(tk('defenderMarker'))}">${markers.map(value => `<option value="${value}"${(targetMarkers.get(figure.id) || 'none') === value ? ' selected' : ''}>${escape(tk('marker.' + value))}</option>`).join('')}</select></div>`).join('');
    fillEditor();
    el('figures').innerHTML = game.figures.map(figure => `<div class="bsim-status">${escape(name(figure))} · ${escape(tk(figure.side))} · ${figure.life}/${figure.maxLife}</div>`).join('');
    el('start').disabled = active || !living.some(figure => figure.side === 'player') || !living.some(figure => figure.side === 'enemy');
    const actor = active ? fight.figures.find(figure => figure.id === fight.actorId) : null;
    const canAct = active && fight.actionsLeft > 0 && actor.life > 0 && !actor.removed && !actor.petrified;
    for (const key of ['attackButton', 'magicButton']) el(key).disabled = !canAct;
    el('move').disabled = !canAct || fight.mode === 'strategic' || actor.elemental;
    el('leave').disabled = el('move').disabled;
    el('nextTurn').disabled = !active || (canAct && fight.actionsLeft > 0);
    el('cancel').disabled = !active;
    el('applyEdit').disabled = !game.figures.length;
    el('status').textContent = active ? tk('turnStatus', {
      actor:name(actor), round:fight.round, actions:fight.actionsLeft,
    }) : fight ? tk('status.' + fight.status) : tk('ready');
    el('log').innerHTML = game.log.slice(-100).reverse().map(line => `<div>${escape(line)}</div>`).join('');
    el('history').innerHTML = game.history.slice(-30).reverse().map(item => `<div>${escape(item.enemy.split(', ').map(id => tk('figure.' + id)).join(', '))} · ${escape(tk('status.' + item.outcome))}</div>`).join('');
  }
  const input = (key, value = '') => `<label class="inv-edit-row">${escape(tk(key.startsWith('edit-') ? key.slice(5) : key))}<input class="inv-edit-input" id="${ID}-${key}" value="${escape(value)}" autocomplete="off"></label>`;
  const select = (key, values, prefix = '') => `<select class="inv-edit-input" id="${ID}-${key}" aria-label="${escape(tk(key))}">${values.map(value => `<option value="${escape(value)}">${escape(tk(prefix + value))}</option>`).join('')}</select>`;
  const check = key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(tk(key.startsWith('edit-') ? key.slice(5) : key))}</label>`;
  const button = key => `<button class="bsim-action-btn" type="button" id="${ID}-${key}">${escape(tk(key))}</button>`;
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(tk('title'))}</span><button class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div id="${ID}-setup"><details><summary>${escape(tk('addFigure'))}</summary>${select('template', ORC_FIGURES.map(figure => figure.id), 'figure.')}${select('side', ['player','enemy'])}${stats.map(key => input(key)).join('')}${equipment.map(key => input(key, 0)).join('')}${button('add')}</details>${select('mode', ['tactical','strategic'])}${select('first', [])}${button('start')}</div><div id="${ID}-figures"></div><div class="bsim-status" id="${ID}-status"></div>${select('target', [])}${select('kind', ['melee','shoot','throw'])}${select('attackerMarker', markers, 'marker.')}${select('defenderMarker', markers, 'marker.')}${check('legal')}${check('weaponAvailable')}<div class="bsim-btn-row">${button('attackButton')}${button('move')}${button('leave')}</div><details><summary>${escape(tk('magic'))}</summary><p>${escape(tk('magicNote'))}</p>${input('modifier')}${input('spellDamage')}${check('spellAvailable')}${button('magicButton')}</details>${select('next', [])}<div class="bsim-btn-row">${button('nextTurn')}${button('cancel')}</div><details><summary>${escape(tk('adjust'))}</summary><p>${escape(tk('adjustNote'))}</p>${select('editFigure', [])}${editStats.map(key => input('edit-' + key)).join('')}${editNumbers.map(key => input('edit-' + key)).join('')}${select('edit-side', ['player','enemy'])}${check('edit-petrified')}${check('edit-removed')}${check('editConfirmed')}${button('applyEdit')}</details></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details><div class="bsim-log" id="${ID}-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    const spellTargets = document.createElement('div');
    spellTargets.id = ID + '-spellTargets';
    spellTargets.innerHTML = '';
    const area = document.createElement('label');
    area.className = 'bsim-checkbox';
    area.innerHTML = `<input type="checkbox" id="${ID}-areaSpell">${escape(tk('areaSpell'))}`;
    el('magicButton').before(area, spellTargets);
    const btn = document.createElement('button');
    btn.id = ID + '-btn'; btn.textContent = t('battlesim.title'); btn.style.display = 'none';
    getButtonRow().appendChild(btn); btn.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    registerShortcut({ button:btn, overlay, open, close });
    el('template').addEventListener('change', fillTemplate);
    el('editFigure').addEventListener('change', fillEditor);
    el('setup').addEventListener('change', () => { if (!busy(data())) action(snapshot); });
    el('add').addEventListener('click', () => action(game => {
      const next = addOrcGameFigure(game, el('template').value, { side:el('side').value,
        stats:Object.fromEntries(stats.map(key => [key, parseOrcStat(el(key).value)])),
        equipment:Object.fromEntries(equipment.map(key => [key, number(key, key !== 'weaponDamage')])),
      });
      snapshot(next); return next;
    }));
    el('start').addEventListener('click', () => action(game => beginOrcEncounter(game,
      game.figures.filter(figure => figure.life > 0).map(figure => figure.id),
      el('first').value, { mode:el('mode').value })));
    el('attackButton').addEventListener('click', () => action(game => report(game,
      orcAttack(game.fight, el('target').value, { kind:el('kind').value, legal:el('legal').checked,
        weaponAvailable:el('weaponAvailable').checked, attackerMarker:el('attackerMarker').value,
        defenderMarker:el('defenderMarker').value }))));
    for (const [key, leave] of [['move', false], ['leave', true]]) el(key).addEventListener('click', () => action(game =>
      updateOrcEncounter(game, orcMove(game.fight, { legal:el('legal').checked, leave }))));
    el('magicButton').addEventListener('click', () => action(game => {
      if (!el('spellAvailable').checked) throw new RangeError('Verify spell card and remaining uses');
      const targets = el('areaSpell').checked
        ? [...el('spellTargets').querySelectorAll('input:checked')].map(field => field.value)
        : [el('target').value];
      return report(game, orcMagic(game.fight, targets, {
        modifier:number('modifier', true), damage:number('spellDamage'), legal:el('legal').checked,
        targetMarkers:el('areaSpell').checked ? Object.fromEntries([...el('spellTargets').querySelectorAll('select')]
          .filter(field => targets.includes(field.dataset.figure)).map(field => [field.dataset.figure, field.value]))
          : { [el('target').value]:el('defenderMarker').value },
      }));
    }));
    el('nextTurn').addEventListener('click', () => action(game =>
      updateOrcEncounter(game, nextOrcTurn(game.fight, el('next').value))));
    el('applyEdit').addEventListener('click', () => action(game => {
      if (!el('editConfirmed').checked) throw new RangeError('Confirm source effect');
      const changes = Object.fromEntries(editStats.map(key => [key, parseOrcStat(el('edit-' + key).value)]));
      for (const key of editNumbers) changes[key] = number('edit-' + key,
        ['armour','weaponAttack','weaponShooting'].includes(key));
      changes.side = el('edit-side').value;
      for (const key of ['petrified','removed']) changes[key] = el('edit-' + key).checked;
      const next = adjustOrcGameFigure(game, el('editFigure').value, changes);
      el('editConfirmed').checked = false;
      next.log.push(tk('adjusted')); return next;
    }));
    el('cancel').addEventListener('click', () => {
      const run = getRun(), original = data();
      if (!busy(original)) return;
      showConfirm(tk('cancelConfirm'), () => {
        if (run === getRun() && original === data()) action(cancelOrcEncounter);
      });
    });
  }
  return { init, render, setVisible(visible) {
    const btn = el('btn'); if (btn) btn.style.display = visible ? '' : 'none'; if (!visible) close();
  } };
}
