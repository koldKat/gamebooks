import { spaceScoutLoadout, spaceScoutPersonalEquipment, startSpaceScoutEncounter,
  spaceScoutDuelRound, spaceScoutDuelMissile, spaceScoutFleetOpening,
  spaceScoutFleetMissiles, spaceScoutFleetManeuver, spaceScoutCruiserAttack,
  spaceScoutTorpedo, SPACE_SCOUT_DUEL_ENEMIES } from './core.js';
import { createOpponentEditor } from '../../opponents.js';

const ID = 'sim648';
const weapons = ['laser', 'plasma', 'ion', 'phaser'];
const shields = ['small', 'medium', 'large'];
const utilities = ['targeting', 'decoder', 'scanner', 'amplifier', 'jammer'];
const gear = ['suit', 'armour', 'protection', 'blaster', 'launcher', 'bazooka', 'battery', 'bazookaBattery', 'grenade', 'medkit'];
const encounters = ['manual', '12', '22', '30', '32', '36', '42', '49', '66', '24', '28', '34', '91'];
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createSpaceScoutPanel({ document, t, getRun, getBookId, saveState,
  showAlert, showConfirm, getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, params) => t('battlesim648.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  let shownRun, opponents;
  const busy = d => d?.fight?.status === 'fighting';
  function data() {
    if (Number(getBookId()) !== 648) return null;
    const run = getRun();
    return run ? run[ID] ||= { setup: {}, character: null, fight: null, history: [], log: [] } : null;
  }
  function close() { el('overlay')?.classList.remove('active'); }
  function open() {
    if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    render(); el('overlay').classList.add('active');
  }
  function number(key, max = 1000000) {
    const text = el(key).value.trim(), value = Number(text);
    if (!text || !Number.isSafeInteger(value) || value < 0 || value > max) throw new RangeError('Invalid number');
    return value;
  }
  function snapshot(d) {
    d.setup = Object.fromEntries([...el('setup').querySelectorAll('input,select')].filter(field => !field.closest('.bsim-opponent-editor')).map(field =>
      [field.id, field.type === 'checkbox' ? field.checked : field.value]));
    d.opponentSetup = opponents.snapshot();
  }
  function action(update) {
    const run = getRun(), original = data();
    if (!original) return;
    try {
      const d = structuredClone(original);
      update(d);
      if (run !== getRun() || Number(getBookId()) !== 648) return;
      if (d.fight) {
        d.character.inventory = structuredClone(d.fight.inventory);
        if (!d.fight.recorded && ['win', 'loss'].includes(d.fight.status)) {
          d.fight.recorded = true;
          d.history.push({ enemy: d.encounter, outcome: d.fight.status,
            ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
        }
      }
      d.log = d.log.slice(-100);
      run[ID] = d; saveState(); render();
    } catch (_) { showAlert(tk('invalid')); }
  }
  function configure(d) {
    if (busy(d)) return;
    const expanded = keys => keys.flatMap(key => Array(number(key, 12)).fill(key));
    const character = spaceScoutLoadout({ ship: el('ship').value, weapons: expanded(weapons),
      shields: expanded(shields), utilities: utilities.filter(key => el(key).checked),
      mounts: ['krotal', 'leech'].flatMap(key => Array(number('mount-' + key, 6)).fill(key)) });
    character.gear = spaceScoutPersonalEquipment(character,
      Object.fromEntries(gear.map(key => [key, number('gear-' + key, 10000)])));
    d.character = character; d.fight = null; d.special = null;
    snapshot(d); d.log.push(tk('configured'));
  }
  function dice(d) {
    if (!d.manualDice) return undefined;
    const values = [number('die1', 6), number('die2', 6)];
    if (values.some(value => !value)) throw new RangeError('Die must be 1-6');
    return () => {
      if (!values.length) throw new RangeError('Extra die roll');
      return values.shift();
    };
  }
  function openingMissiles() {
    return ['krotal', 'leech'].flatMap(type => Array(number('opening-' + type, 12)).fill(type));
  }
  function start(d) {
    if (busy(d) || !d.character) return;
    const context = el('context').value;
    d.manualDice = el('manualDice').checked;
    snapshot(d); d.encounter = context === 'manual' ? opponents.read().map(enemy => enemy.displayName || t('battlesim.editor.bg.name')).join(' / ') : tk('context.' + context);
    if (['24', '28', '34', '91'].includes(context)) {
      d.special = Number(context); d.fight = null;
      d.log.push(tk('specialReady')); return;
    }
    d.special = null;
    d.fight = startSpaceScoutEncounter(d.character, context === 'manual' ? context : Number(context), {
      roll: dice(d), missiles: context === '30' ? openingMissiles() : [],
      openingDamage: context === '32' ? number('openingDamage') : undefined,
      enemies: context === 'manual' ? opponents.read().map(enemy => ({name: enemy.displayName || t('battlesim.editor.bg.name'), attack: enemy.attack, shields: enemy.shields})) : undefined,
      shields: context === 'manual' ? number('remainingShields') : undefined,
    });
    d.log.push(d.encounter);
  }
  function report(d, result) {
    d.fight = result.fight;
    if (result.section) d.log.push(tk('destination', { n: result.section }));
    if (result.playerRoll != null) d.log.push(tk('round', { player: result.playerRoll,
      enemy: result.enemyRoll ?? '-', enemyLoss: result.enemyLoss ?? '-', playerLoss: result.playerLoss ?? '-' }));
    if (result.damage != null) d.log.push(tk('damage', { n: Array.isArray(result.damage) ? result.damage.join(' + ') : result.damage }));
    if (!busy(d)) d.log.push(tk('status.' + d.fight.status));
  }
  function shots() {
    return [0, 1, 2].flatMap(i => el('shot' + i).value ?
      [{ type: el('shot' + i).value, target: number('shotTarget' + i, 2) }] : []);
  }
  function step(d) {
    if (!busy(d)) return;
    const stage = d.fight.stage;
    if (stage === 'headon') report(d, spaceScoutFleetOpening(d.fight, dice(d)));
    else if (stage === 'missiles-two' || stage === 'missiles-three') report(d, spaceScoutFleetMissiles(d.fight, shots()));
    else if (stage === 'maneuver') {
      const count = d.fight.speed * d.fight.manoeuvre === 110 ? 1 : 2;
      report(d, spaceScoutFleetManeuver(d.fight,
        Array.from({ length: count }, (_, i) => number('beamTarget' + i, 2)), shots(), dice(d)));
    } else report(d, spaceScoutDuelRound(d.fight, dice(d)));
    for (const i of [0, 1, 2]) el('shot' + i).value = '';
  }
  function specialAttack(d, torpedo) {
    if (busy(d) || !d.special || !d.character) return;
    const result = torpedo ? spaceScoutTorpedo(d.character, d.special)
      : spaceScoutCruiserAttack(d.character, d.special, openingMissiles(), dice(d));
    d.character = result.character;
    if (result.damage != null) d.log.push(tk('damage', { n: result.damage }));
    d.log.push(tk('destination', { n: result.section }));
    d.special = null;
  }
  function render() {
    if (!el('overlay')) return;
    const d = data();
    if (!d) { shownRun = undefined; close(); return; }
    if (shownRun !== getRun()) {
      shownRun = getRun();
      for (const field of el('setup').querySelectorAll('input,select')) {
        if (field.type === 'checkbox') field.checked = d.setup[field.id] ?? field.defaultChecked;
        else field.value = d.setup[field.id] ?? (field.tagName === 'SELECT' ? field.options[0].value : field.defaultValue);
      }
      for (const i of [0, 1, 2]) el('shot' + i).value = '';
      opponents.set(d.opponentSetup ?? [{attack: 50, shields: 300}]);
    }
    const active = busy(d), f = d.fight, c = d.character, context = el('context').value;
    opponents.lock(active);
    for (const field of el('setup').querySelectorAll('input,select,button')) field.disabled = active;
    el('configure').disabled = active;
    el('start').disabled = active || !c;
    el('attack').disabled = !active;
    el('cancel').disabled = !active;
    el('manualOpponent').hidden = context !== 'manual';
    el('openingDamageRow').hidden = context !== '32';
    el('openingMissiles').hidden = !['30', '24', '28', '34'].includes(context);
    el('dice').hidden = !(active ? d.manualDice : el('manualDice').checked);
    el('special').hidden = !d.special;
    el('cruiserAttack').disabled = !d.special || d.special === 91;
    el('torpedo').disabled = !d.special || !c?.inventory.torpedoes;
    const allocation = active && ['missiles-two', 'missiles-three', 'maneuver'].includes(f.stage);
    el('allocations').hidden = !allocation;
    el('beams').hidden = !active || f.stage !== 'maneuver';
    el('beam1Row').hidden = !active || f.speed * f.manoeuvre === 110;
    const shotLimit = f?.stage === 'maneuver' ? (f.speed * f.manoeuvre === 110 ? 2 : 1) : 3;
    for (const i of [0, 1, 2]) {
      el('shot' + i + 'Row').hidden = allocation && i >= shotLimit;
      if (i >= shotLimit) el('shot' + i).value = '';
    }
    for (const select of el('allocations').querySelectorAll('select[data-target],input[data-target]')) {
      if (select.tagName !== 'SELECT' || !active) continue;
      const alive = f.enemies.findIndex(enemy => enemy.shields > 0);
      for (const option of select.options) option.disabled = !f.enemies[Number(option.value)]?.shields;
      if (!f.enemies[Number(select.value)]?.shields) select.value = String(alive);
    }
    el('missileRow').hidden = !active || (!!f.stage && f.stage !== 'duel');
    el('inventoryEdit').hidden = active || !c;
    if (!active && c) for (const type of ['krotal', 'leech', 'torpedoes']) el('inventory-' + type).value = c.inventory[type];
    el('character').textContent = c ? tk('character', { power: c.power, shields: c.maxShields,
      energy: c.energy, volume: c.volume, personal: c.personalVolume,
      krotal: c.inventory.krotal, leech: c.inventory.leech, torpedoes: c.inventory.torpedoes }) : tk('ready');
    el('status').textContent = f ? tk('status.' + f.status) + ' | ' + tk('shieldStatus', {
      player: f.shields, enemies: f.enemies.map(enemy => enemy.shields).join(' / ') }) : '';
    el('attack').textContent = tk(allocation ? 'resolveAllocation' : f?.stage === 'headon' ? 'openingShot' : 'attack');
    el('log').innerHTML = d.log.slice().reverse().map(line => `<div>${escape(line)}</div>`).join('');
    el('history').innerHTML = d.history.slice(-30).reverse().map(h => `<div>${escape(h.enemy)} | ${escape(tk('status.' + h.outcome))}</div>`).join('');
  }
  const input = (key, value = 0, max = 1000000) => `<label class="inv-edit-row" id="${ID}-${key}Row">${escape(tk(key))}<input class="inv-edit-input" type="number" min="0" max="${max}" step="1" value="${value}" id="${ID}-${key}"></label>`;
  const check = key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  const button = key => `<button class="bsim-action-btn" type="button" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const select = (key, values, target = false) => `<select class="inv-edit-input" id="${ID}-${key}" aria-label="${escape(tk(target ? 'target' : key.startsWith('shot') ? 'missileType' : key))}"${target ? ' data-target' : ''}>${values.map(value => `<option value="${value}">${escape(target ? tk('targetNumber', { n: Number(value) + 1 }) : tk(value ? key === 'context' ? 'context.' + value : value : 'none'))}</option>`).join('')}</select>`;
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(tk('title'))}</span><button class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div id="${ID}-setup"><details><summary>${escape(tk('loadout'))}</summary><label class="inv-edit-row">${escape(tk('ship'))}${select('ship', ['centurion', 'morningstar', 'ghost'])}</label><div class="bsim-side">${weapons.map(key => input(key, key === 'laser' ? 2 : 0, 4)).join('')}${shields.map(key => input(key, key === 'small' ? 1 : 0, 3)).join('')}${utilities.map(check).join('')}${['krotal', 'leech'].map(key => input('mount-' + key, 0, 6)).join('')}</div><details><summary>${escape(tk('personalGear'))}</summary>${gear.map(key => input('gear-' + key, key === 'suit' ? 1 : 0, 10000)).join('')}</details>${button('configure')}</details><label class="inv-edit-row">${escape(tk('context'))}${select('context', encounters)}</label><div id="${ID}-manualOpponent">${input('enemyAttack', 50)}${input('enemyShields', 300)}${input('remainingShields', 100)}</div>${input('openingDamage')}<div id="${ID}-openingMissiles">${input('opening-krotal', 0, 12)}${input('opening-leech', 0, 12)}</div>${check('manualDice')}</div><div class="bsim-status" id="${ID}-character"></div><details id="${ID}-inventoryEdit"><summary>${escape(tk('inventoryEdit'))}</summary><p>${escape(tk('inventoryNote'))}</p>${['krotal', 'leech', 'torpedoes'].map(key => input('inventory-' + key, 0, 12)).join('')}${button('updateInventory')}</details><div class="bsim-btn-row">${button('start')}${button('cancel')}${button('attack')}</div><div id="${ID}-dice">${input('die1', 1, 6)}${input('die2', 1, 6)}</div><div id="${ID}-allocations"><p>${escape(tk('allocationNote'))}</p><div id="${ID}-beams">${[0, 1].map(i => `<label class="inv-edit-row" id="${ID}-beam${i}Row">${escape(tk('beamNumber', { n: i + 1 }))}${select('beamTarget' + i, ['0', '1', '2'], true)}</label>`).join('')}</div>${[0, 1, 2].map(i => `<div class="inv-edit-row" id="${ID}-shot${i}Row"><span>${escape(tk('missileNumber', { n: i + 1 }))}</span>${select('shot' + i, ['', 'krotal', 'leech'])}${select('shotTarget' + i, ['0', '1', '2'], true)}</div>`).join('')}</div><div id="${ID}-missileRow" class="bsim-btn-row">${select('missileType', ['krotal', 'leech'])}${button('fireMissile')}</div><div id="${ID}-special" class="bsim-btn-row">${button('cruiserAttack')}${button('torpedo')}</div><div class="bsim-status" id="${ID}-status"></div></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details><div class="bsim-log" id="${ID}-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    opponents = createOpponentEditor({document, id: ID, t, language: 'bg',
      fields: [{key: 'attack', label: tk('enemyAttack')}, {key: 'shields', label: tk('enemyShields'), min: 1}],
      presets: Object.entries(SPACE_SCOUT_DUEL_ENEMIES).flatMap(([section, enemies]) => enemies.map((enemy, index) =>
        ({...enemy, displayName: tk('context.' + section) + (enemies.length > 1 ? ' ' + (index + 1) : '')})))});
    el('enemyAttack').closest('label').replaceWith(opponents.element);
    el('enemyShields').closest('label').remove();
    const btn = document.createElement('button');
    btn.id = ID + '-btn'; btn.textContent = t('battlesim.title'); btn.style.display = 'none';
    getButtonRow().appendChild(btn); btn.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    registerShortcut({ button: btn, overlay, open, close });
    el('setup').addEventListener('change', () => {
      if (!busy(data())) action(d => { snapshot(d); d.special = null; });
    });
    el('configure').addEventListener('click', () => {
      const run = getRun(), original = data();
      const apply = () => { if (run === getRun() && original === data()) action(configure); };
      if (original?.character) showConfirm(tk('configureConfirm'), apply); else apply();
    });
    el('start').addEventListener('click', () => action(start));
    el('attack').addEventListener('click', () => action(step));
    el('fireMissile').addEventListener('click', () => action(d => report(d, spaceScoutDuelMissile(d.fight, el('missileType').value))));
    el('cruiserAttack').addEventListener('click', () => action(d => specialAttack(d, false)));
    el('torpedo').addEventListener('click', () => action(d => specialAttack(d, true)));
    el('updateInventory').addEventListener('click', () => action(d => {
      if (busy(d) || !d.character) return;
      const limits = { centurion: 3, morningstar: 1, ghost: 2 };
      d.character.inventory = { krotal: number('inventory-krotal', d.character.setup.mounts.filter(type => type === 'krotal').length * 2),
        leech: number('inventory-leech', d.character.setup.mounts.filter(type => type === 'leech').length),
        torpedoes: number('inventory-torpedoes', limits[d.character.ship]) };
      d.fight = null;
      d.log.push(tk('inventoryUpdated'));
    }));
    el('cancel').addEventListener('click', () => {
      const run = getRun(), original = data();
      if (!busy(original)) return;
      showConfirm(tk('cancelConfirm'), () => {
        if (run === getRun() && original === data()) action(d => { if (busy(d)) d.fight.status = 'cancelled'; });
      });
    });
  }
  return { init, render, setVisible(visible) {
    const btn = el('btn'); if (btn) btn.style.display = visible ? '' : 'none'; if (!visible) close();
  } };
}
