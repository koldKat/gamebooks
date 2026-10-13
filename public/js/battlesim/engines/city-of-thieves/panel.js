import { newThievesCharacter, validateThievesCharacter, startThievesFight,
  thievesTargets, thievesRound, resolveThievesLuck, canEscapeThieves,
  escapeThievesFight, bypassThievesFight, healThievesCharacter, testThievesLuck } from './core.js';
import { THIEVES_FIGHTS, THIEVES_EQUIPMENT } from './roster.js';

const ID = 'sim665';
const stats = ['skill', 'stamina', 'luck'];
const fields = [...stats.flatMap(key => [key, key + 'Initial']), 'provisions', 'gold', 'potionUses', 'attackModifier'];
const specialRules = new Set([10, 73, 79, 88, 140, 152, 157, 193, 201, 253, 311, 323, 326, 349, 357, 392]);
const escape = value => String(value).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createThievesPanel({ document, t, getRun, getBookId, saveState,
  showAlert, showConfirm, getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, params) => t('battlesim665.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const active = game => game?.fight?.status === 'fighting';
  let shownRun;
  function data() {
    if (Number(getBookId()) !== 665) return null;
    const run = getRun();
    return run ? run[ID] ||= { character: null, fight: null, history: [], log: [], setup: {} } : null;
  }
  function close() { el('overlay')?.classList.remove('active'); }
  function open() {
    if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    render(); el('overlay').classList.add('active'); el('close').focus();
  }
  function number(key) {
    const text = el(key).value.trim(), value = Number(text);
    if (!text || !Number.isSafeInteger(value)) throw new RangeError('Invalid input');
    return value;
  }
  function record(game) {
    const fight = game.fight;
    if (!fight || fight.recorded || !['win', 'loss'].includes(fight.status)) return;
    fight.recorded = true;
    game.history.push({ enemy: tk('context.' + fight.config.section), outcome: fight.status,
      ts: Math.max(Date.now(), (game.history.at(-1)?.ts ?? 0) + 1) });
  }
  function action(update) {
    const run = getRun(), original = data();
    if (!original) return;
    try {
      const next = structuredClone(original);
      update(next);
      if (run !== getRun() || Number(getBookId()) !== 665) return;
      if (next.fight) next.character = structuredClone(next.fight.character);
      record(next);
      next.log = next.log.slice(-100); next.history = next.history.slice(-30);
      run[ID] = next; saveState(); render();
    } catch (_) { showAlert(tk('invalid')); }
  }
  function fightReport(game, fight) {
    game.fight = fight;
    for (const event of fight.events) {
      if (event.kind === 'attack') game.log.push(tk('attackRoll', {
        enemy: tk('enemy.' + fight.enemies[event.enemy].name), player: event.playerAttack, opponent: event.enemyAttack }));
      else if (event.kind === 'luck') game.log.push(tk('luckRoll', { roll: event.roll, result: tk(event.lucky ? 'lucky' : 'unlucky') }));
      else if (event.appliedDamage !== undefined) game.log.push(tk('damage', {
        target: event.kind === 'outgoing' ? tk('enemy.' + fight.enemies[event.enemy].name) : tk('you'), amount: event.appliedDamage }));
      else if (event.kind === 'fireRoll') game.log.push(tk('fireRoll', { roll: event.roll }));
      else if (event.kind === 'entry') game.log.push(tk('entryPenalty'));
      else if (event.kind === 'brooch') game.log.push(tk('broochHeal', { amount: event.amount }));
      else if (event.kind === 'randomEnemy') game.log.push(tk('randomResult', {
        roll: event.roll, enemy: tk('enemy.' + fight.enemies[event.enemy].name) }));
    }
    if (fight.status !== 'fighting') game.log.push(tk('status.' + fight.status));
    if (fight.destination) game.log.push(tk('destination', { section: fight.destination }));
  }
  function contextChanged() {
    const context = THIEVES_FIGHTS.find(entry => entry.section === Number(el('context').value));
    el('applyEntry-row').hidden = !context?.entry;
    el('randomEnemy-row').hidden = !context?.randomEnemy;
    el('contextNote').textContent = context && specialRules.has(context.section) ? tk('rule.' + context.section) : '';
  }
  function render() {
    if (!el('overlay')) return;
    const game = data();
    if (!game) { shownRun = undefined; close(); return; }
    if (shownRun !== getRun()) {
      shownRun = getRun();
      el('context').value = game.setup.context ?? String(THIEVES_FIGHTS[0].section);
      el('applyEntry').checked = game.setup.applyEntry ?? true;
      el('randomEnemy').value = game.setup.randomEnemy ?? '0';
    }
    const busy = active(game), character = game.character, fight = game.fight;
    el('characterStatus').textContent = character ? tk('characterStatus', character) : tk('ready');
    for (const key of fields) {
      if (document.activeElement !== el(key)) el(key).value = character ? String(character[key]) : '';
      el(key).disabled = busy || !character;
    }
    for (const key of THIEVES_EQUIPMENT) {
      el(key).checked = character?.[key] ?? false;
      el(key).disabled = busy || !character;
    }
    el('potion').value = character?.potion ?? 'skill';
    el('potion').disabled = busy || !character;
    for (const key of ['roll', 'context', 'applyEntry', 'randomEnemy']) el(key).disabled = busy;
    el('apply').disabled = busy || !character;
    el('start').disabled = busy || !character?.stamina;
    el('meal').disabled = busy || !character?.stamina || !character.provisions || character.stamina === character.staminaInitial;
    el('drink').disabled = busy || !character?.stamina || !character.potionUses;
    el('luckTest').disabled = busy || !character?.stamina || !character.luck;
    const targets = fight ? thievesTargets(fight) : [];
    const selected = Number(el('target').value);
    el('target').innerHTML = targets.map(index => `<option value="${index}">${escape(tk('enemy.' + fight.enemies[index].name))} (${index + 1})</option>`).join('');
    if (targets.includes(selected)) el('target').value = String(selected);
    el('target-row').hidden = targets.length < 2;
    el('step').disabled = !busy || !!fight.pending.length;
    el('luckYes').disabled = !busy || !fight.pending.length || !character.luck;
    el('luckNo').disabled = !busy || !fight.pending.length;
    el('luck-row').hidden = !busy || !fight.pending.length;
    el('escape').disabled = !canEscapeThieves(fight);
    el('cancel').disabled = !busy || !!fight.pending.length;
    el('bypass').hidden = !fight?.config.bypass;
    el('bypass').disabled = !busy || !!fight.rounds || !!fight.pending.length || !character?.fireRing;
    const context = Number(el('context').value);
    el('randomEnemy-row').hidden = context !== 201;
    el('status').textContent = fight ? tk('status.' + fight.status) + '\n'
      + tk('roundCount', { rounds: fight.rounds }) + '\n'
      + fight.enemies.filter((enemy, index) => !fight.config.randomEnemy || fight.config.groups[0].includes(index))
        .map(enemy => `${tk('enemy.' + enemy.name)}: ${enemy.stamina}/${enemy.initialStamina}`).join('\n')
      + (fight.destination ? '\n' + tk('destination', { section: fight.destination }) : '') : '';
    const pending = fight?.pending[0];
    el('pending').textContent = pending ? tk('pending', {
      target: pending.kind === 'outgoing' ? tk('enemy.' + fight.enemies[pending.enemy].name) : tk('you'), damage: pending.damage }) : '';
    el('history').innerHTML = game.history.slice().reverse()
      .map(item => `<div>${escape(item.enemy)} · ${escape(tk('status.' + item.outcome))}</div>`).join('');
    const log = el('log');
    log.innerHTML = game.log.map(line => `<div>${escape(line)}</div>`).join('');
    log.scrollTop = log.scrollHeight;
    contextChanged();
  }
  const field = key => `<label class="inv-edit-row"><span class="inv-edit-label">${escape(tk(key))}</span><input class="inv-edit-input" type="number" min="${key === 'attackModifier' ? -1000 : 0}" max="10000" step="1" id="${ID}-${key}"></label>`;
  const checkbox = key => `<label class="bsim-checkbox" id="${ID}-${key}-row"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  const button = key => `<button class="bsim-action-btn" type="button" id="${ID}-${key}">${escape(tk(key))}</button>`;
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(tk('title'))}</span><button class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-status" id="${ID}-characterStatus"></div>${button('roll')}<details><summary>${escape(tk('character'))}</summary>${fields.map(field).join('')}<label class="inv-edit-row"><span class="inv-edit-label">${escape(tk('potion'))}</span><select class="inv-edit-input" id="${ID}-potion">${['skill', 'strength', 'fortune'].map(key => `<option value="${key}">${escape(tk('potion.' + key))}</option>`).join('')}</select></label><p>${escape(tk('equipmentNote'))}</p>${THIEVES_EQUIPMENT.map(checkbox).join('')}${button('apply')}</details><div class="bsim-btn-row">${button('meal')}${button('drink')}${button('luckTest')}</div><label class="inv-edit-row"><span class="inv-edit-label">${escape(tk('context'))}</span><select class="inv-edit-input" id="${ID}-context">${THIEVES_FIGHTS.map(entry => `<option value="${entry.section}">${escape(tk('context.' + entry.section))} (${entry.section})</option>`).join('')}</select></label>${checkbox('applyEntry')}<label class="inv-edit-row" id="${ID}-randomEnemy-row"><span class="inv-edit-label">${escape(tk('randomEnemy'))}</span><select class="inv-edit-input" id="${ID}-randomEnemy"><option value="0">${escape(tk('randomRoll'))}</option>${THIEVES_FIGHTS.find(entry => entry.section === 201).enemies.map((enemy, index) => `<option value="${index + 1}">${escape(tk('enemy.' + enemy.name))}</option>`).join('')}</select></label><p id="${ID}-contextNote"></p>${button('start')}<div class="bsim-status" id="${ID}-status"></div><label class="inv-edit-row" id="${ID}-target-row"><span class="inv-edit-label">${escape(tk('target'))}</span><select class="inv-edit-input" id="${ID}-target"></select></label><div class="bsim-btn-row">${button('step')}${button('escape')}${button('bypass')}${button('cancel')}</div><div id="${ID}-luck-row"><p id="${ID}-pending"></p><div class="bsim-btn-row">${button('luckYes')}${button('luckNo')}</div></div></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details><div class="bsim-log" id="${ID}-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    const btn = document.createElement('button');
    btn.id = ID + '-btn'; btn.textContent = t('battlesim.title'); btn.style.display = 'none';
    getButtonRow().appendChild(btn); btn.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    registerShortcut({ button: btn, overlay, open, close });
    el('context').addEventListener('change', contextChanged);
    el('roll').addEventListener('click', () => {
      const run = getRun(), original = data();
      if (!original || active(original)) return;
      const update = () => {
        if (run !== getRun() || original !== data()) return;
        action(game => { game.character = newThievesCharacter(); game.fight = null; game.log.push(tk('rolled')); });
      };
      if (original.character) showConfirm(tk('rollConfirm'), update); else update();
    });
    el('apply').addEventListener('click', () => action(game => {
      if (active(game) || !game.character) return;
      const character = { ...game.character, ...Object.fromEntries(fields.map(key => [key, number(key)])), potion: el('potion').value };
      for (const key of THIEVES_EQUIPMENT) character[key] = el(key).checked;
      validateThievesCharacter(character); game.character = character; game.fight = null; game.log.push(tk('adjusted'));
    }));
    el('start').addEventListener('click', () => action(game => {
      if (active(game) || !game.character) return;
      game.setup = { context: el('context').value, applyEntry: el('applyEntry').checked, randomEnemy: el('randomEnemy').value };
      const section = number('context');
      game.log.push(tk('context.' + section));
      fightReport(game, startThievesFight(section, game.character, {
        applyEntry: game.setup.applyEntry, randomEnemy: number('randomEnemy'),
      }));
    }));
    el('step').addEventListener('click', () => action(game => fightReport(game, thievesRound(game.fight, number('target')))));
    el('luckYes').addEventListener('click', () => action(game => fightReport(game, resolveThievesLuck(game.fight, true))));
    el('luckNo').addEventListener('click', () => action(game => fightReport(game, resolveThievesLuck(game.fight, false))));
    el('escape').addEventListener('click', () => action(game => fightReport(game, escapeThievesFight(game.fight))));
    el('bypass').addEventListener('click', () => action(game => fightReport(game, bypassThievesFight(game.fight))));
    for (const [key, item] of [['meal', 'provisions'], ['drink', 'potion']]) {
      el(key).addEventListener('click', () => action(game => {
        if (active(game)) return;
        game.character = healThievesCharacter(game.character, item); game.fight = null; game.log.push(tk(key + 'Used'));
      }));
    }
    el('luckTest').addEventListener('click', () => action(game => {
      if (active(game)) return;
      const result = testThievesLuck(game.character);
      game.character = result.character; game.fight = null;
      game.log.push(tk('luckRoll', { roll: result.roll, result: tk(result.lucky ? 'lucky' : 'unlucky') }));
    }));
    el('cancel').addEventListener('click', () => {
      const run = getRun(), original = data();
      if (!active(original) || original.fight.pending.length) return;
      showConfirm(tk('cancelConfirm'), () => {
        if (run !== getRun() || original !== data()) return;
        action(game => { game.fight.status = 'cancelled'; game.log.push(tk('status.cancelled')); });
      });
    });
  }
  return { init, render, setVisible(visible) {
    const btn = el('btn'); if (btn) btn.style.display = visible ? '' : 'none'; if (!visible) close();
  } };
}
