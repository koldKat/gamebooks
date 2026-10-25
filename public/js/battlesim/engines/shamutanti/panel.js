import { createCustomOpponentSetup } from '../../custom-setup.js';
import { newShamutantiCharacter, validateShamutantiCharacter, startShamutantiFight,
  shamutantiRound, resolveShamutantiLuck, canSpareShamutanti, spareShamutanti,
  shamutantiOtherSpell, healShamutantiCharacter, setShamutantiEnemySkill } from './core.js';
import { SHAMUTANTI_FIGHTS, SHAMUTANTI_RULES } from './roster.js';

const ID = 'sim671';
const fields = ['skill', 'skillInitial', 'stamina', 'staminaInitial', 'luck', 'luckInitial', 'provisions', 'gold', 'attackModifier'];
const flags = ['ragnarBand', 'luckCharm', 'janPresent', 'cursed', 'libraUsed'];
const escape = value => String(value).replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

export function createShamutantiPanel({ document, t, getRun, getBookId, saveState,
  showAlert, showConfirm, getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, params) => t('battlesim671.' + key, params);
  let customSetup;
  const enemyLabel = enemy => enemy.displayName || tk('enemy.' + (enemy.key ?? enemy.name));
  const el = key => document.getElementById(ID + '-' + key);
  const active = game => game?.fight?.status === 'fighting';
  let shownRun;
  function data() {
    if (Number(getBookId()) !== 671) return null;
    const run = getRun();
    return run ? run[ID] ||= { character: null, fight: null, history: [], log: [], setup: {} } : null;
  }
  function close() { el('overlay')?.classList.remove('active'); }
  function open() {
    if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    render(); el('overlay').classList.add('active'); el('close').focus();
  }
  function number(key, optional = false) {
    const text = el(key).value.trim();
    if (!text && optional) return null;
    if (!text || !Number.isSafeInteger(Number(text))) throw new RangeError('Invalid input');
    return Number(text);
  }
  function action(update) {
    const run = getRun(), original = data();
    if (!original) return;
    try {
      const next = structuredClone(original);
      update(next);
      if (run !== getRun() || Number(getBookId()) !== 671) return;
      if (next.fight) next.character = structuredClone(next.fight.character);
      const fight = next.fight;
      if (fight && !fight.recorded && ['win', 'loss'].includes(fight.status)) {
        fight.recorded = true;
        next.history.push({ enemy: (fight.config.custom ? fight.config.name : tk('context.' + fight.config.section)), outcome: fight.status,
          ts: Math.max(Date.now(), (next.history.at(-1)?.ts ?? 0) + 1) });
      }
      next.log = next.log.slice(-100); next.history = next.history.slice(-30);
      run[ID] = next; saveState(); render();
    } catch (_) { showAlert(tk('invalid')); }
  }
  function report(game, fight) {
    game.fight = fight;
    for (const event of fight.events) {
      if (event.kind === 'attack') game.log.push(tk('attackRoll', { player: event.playerAttack, opponent: event.enemyAttack }));
      else if (event.kind === 'luck') game.log.push(tk('luckRoll', { roll: event.roll, result: tk(event.lucky ? 'lucky' : 'unlucky') }));
      else if (event.kind === 'damage') game.log.push(tk('damage', {
        target: tk(event.direction === 'outgoing' ? 'opponent' : event.ally ? 'ally' : 'you'), amount: event.amount }));
      else if (event.kind === 'entry') game.log.push(tk('entryCost', event));
      else if (event.kind === 'morale') game.log.push(tk('moraleRoll', { roll: event.total, result: tk(event.fled ? 'fled' : 'stayed') }));
      else if (event.kind === 'sting') game.log.push(tk('stingRoll', { roll: event.roll }));
      else if (event.kind === 'nightRoll') game.log.push(tk('nightRoll', { roll: event.result }));
      else if (event.kind === 'weaponRecovery') game.log.push(tk('recoveryRoll', { roll: event.roll, skill: event.skill }));
      else if (event.kind === 'carriedWounds') game.log.push(tk('carriedWounds', event));
      else if (event.kind === 'enemyOverride') game.log.push(event.skill === null ? tk('enemyOverrideCleared') : tk('enemyOverrideApplied', event));
    }
    if (fight.status !== 'fighting') game.log.push(tk('status.' + fight.status));
    if (fight.destination) game.log.push(tk('destination', { section: fight.destination }));
  }
  function contextChanged() {
    const spec = SHAMUTANTI_FIGHTS.find(item => item.section === Number(el('context').value));
    const game = data(), blocked = spec?.spell && game?.character?.janPresent;
    el('summonCount-row').hidden = !spec?.summon;
    for (const key of ['previousSection', 'nightModifier']) el(key + '-row').hidden = !spec?.night;
    el('contextNote').textContent = spec ? [tk('rule.' + spec.section), ...(blocked ? [tk('janBlocksSpell')] : [])].join('\n') : '';
    el('start').disabled = !game || active(game) || !game.character?.stamina || !!blocked;
  }
  function render() {
    if (!el('overlay')) return;
    const game = data();
    if (!game) { shownRun = undefined; close(); return; }
    if (shownRun !== getRun()) {
      shownRun = getRun();
      for (const [key, value] of Object.entries({ context: 2, summonCount: 1, previousSection: '', nightModifier: 0, skillOverride: '' })) {
        el(key).value = String(game.setup[key] ?? value);
      }
      el('applyEntry').checked = game.setup.applyEntry ?? true;
      el('role').value = game.character?.role ?? 'warrior';
    }
    customSetup.render();
    const busy = active(game), character = game.character, fight = game.fight;
    el('characterStatus').textContent = character ? tk('characterStatus', character) : tk('ready');
    for (const key of fields) {
      if (document.activeElement !== el(key)) el(key).value = character ? String(character[key]) : '';
      el(key).disabled = busy || !character;
    }
    for (const key of flags) {
      el(key).checked = character?.[key] ?? false;
      el(key).disabled = busy || !character;
    }
    el('weapon').value = character?.weapon ?? 'sword';
    el('weapon').disabled = busy || !character;
    for (const key of ['roll', 'role', 'context', 'applyEntry', 'summonCount', 'previousSection', 'nightModifier', 'skillOverride']) el(key).disabled = busy;
    el('apply').disabled = busy || !character;
    el('start').disabled = busy || !character?.stamina;
    el('meal').disabled = busy || !character?.stamina || !character.provisions || character.stamina >= character.staminaInitial;
    el('mealAmount').disabled = el('meal').disabled;
    el('libra').disabled = !character?.stamina || character.libraUsed || !!fight?.pending;
    el('step').disabled = !busy || !!fight.pending;
    el('enemySkillOverride').disabled = el('enemyOverride').disabled = !busy || !!fight.pending;
    if (document.activeElement !== el('enemySkillOverride')) {
      el('enemySkillOverride').value = fight?.enemySkillOverrideEnemy === fight?.enemy ? String(fight?.enemySkillOverride ?? '') : '';
    }
    for (const key of ['luckYes', 'luckNo']) el(key).disabled = !busy || !fight.pending;
    el('luckYes').disabled ||= !character?.luck;
    el('luck-row').hidden = !busy || !fight.pending;
    el('spare').disabled = !canSpareShamutanti(fight);
    el('otherSpell').hidden = !fight?.config.otherSpell;
    el('otherSpell').disabled = !busy || !!fight.pending || !!fight.allies[fight.ally];
    el('cancel').disabled = !busy || !!fight.pending;
    el('status').textContent = fight ? [tk('status.' + fight.status), tk('roundCount', { rounds: fight.rounds }),
      ...fight.enemies.map(foe => `${enemyLabel(foe)}: ${tk('skill')} ${foe.skill}, ${tk('stamina')} ${foe.stamina}${foe.fled ? ' - ' + tk('fled') : ''}`),
      ...fight.allies.map((ally, index) => `${tk('ally')} ${index + 1}: ${enemyLabel(ally)} ${ally.stamina}`),
      ...(fight.destination ? [tk('destination', { section: fight.destination })] : [])].join('\n') : '';
    el('pending').textContent = fight?.pending ? tk('pending', { damage: fight.pending.damage }) : '';
    el('history').innerHTML = game.history.slice().reverse().map(item =>
      `<div>${escape(item.enemy)} - ${escape(tk('status.' + item.outcome))}</div>`).join('');
    el('log').innerHTML = game.log.map(line => `<div>${escape(line)}</div>`).join('');
    el('log').scrollTop = el('log').scrollHeight;
    contextChanged();
  }
  const field = (key, min = 0, max = 10000) => `<label class="inv-edit-row" id="${ID}-${key}-row"><span class="inv-edit-label">${escape(tk(key))}</span><input class="inv-edit-input" type="number" min="${min}" max="${max}" step="1" id="${ID}-${key}"></label>`;
  const checkbox = key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  const button = key => `<button class="bsim-action-btn" type="button" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const select = (key, values) => `<label class="inv-edit-row" id="${ID}-${key}-row"><span class="inv-edit-label">${escape(tk(key))}</span><select class="inv-edit-input" id="${ID}-${key}">${values.map(value => `<option value="${value}">${escape(tk(key + '.' + value))}</option>`).join('')}</select></label>`;
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(tk('title'))}</span><button class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-status" id="${ID}-characterStatus"></div>${select('role', ['warrior', 'wizard'])}${button('roll')}<details><summary>${escape(tk('character'))}</summary>${fields.map(key => field(key, key === 'attackModifier' ? -1000 : 0)).join('')}${select('weapon', ['sword', 'scimitar', 'axe', 'specialSword'])}${flags.map(checkbox).join('')}${button('apply')}</details><div class="bsim-btn-row">${button('meal')}${button('libra')}</div>${select('mealAmount', [1, 2, 3])}<label class="inv-edit-row"><span class="inv-edit-label">${escape(tk('context'))}</span><select class="inv-edit-input" id="${ID}-context">${SHAMUTANTI_FIGHTS.map(item => `<option value="${item.section}">${escape(tk('context.' + item.section))} (${item.section})</option>`).join('')}</select></label>${checkbox('applyEntry')}${field('summonCount', 0, 100)}${field('previousSection', 1, SHAMUTANTI_RULES.night.maxPreviousSection)}${select('nightModifier', SHAMUTANTI_RULES.night.modifiers)}${field('skillOverride', 0, 1000)}<p>${escape(tk('overrideNote'))}</p><p id="${ID}-contextNote"></p>${button('start')}<div class="bsim-status" id="${ID}-status"></div><div class="bsim-btn-row">${button('step')}${button('spare')}${button('otherSpell')}${button('cancel')}</div><div id="${ID}-luck-row"><p id="${ID}-pending"></p><div class="bsim-btn-row">${button('luckYes')}${button('luckNo')}</div></div></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details><div class="bsim-log" id="${ID}-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    customSetup = createCustomOpponentSetup({document, id: ID, t, language: 'bg', selectKey: "context", getRun, getData: data,
      fields: [{key: 'skill', label: tk('skill'), max: 10000}, {key: 'stamina', label: tk('stamina'), min: 1, max: 10000}],
      presets: SHAMUTANTI_FIGHTS.flatMap(entry => entry.enemies.map(enemy => ({...enemy, displayName: enemyLabel(enemy)})))});
    el('status').insertAdjacentHTML('afterend', field('enemySkillOverride', 0, 1000) + button('enemyOverride') + `<p>${escape(tk('enemyOverrideNote'))}</p>`);
    el('mealAmount').value = '2';
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
      const run = getRun(), original = data(), role = el('role').value;
      if (!original || active(original)) return;
      const update = () => {
        if (run !== getRun() || original !== data()) return;
        action(game => { game.character = newShamutantiCharacter(role); game.fight = null; game.log.push(tk('rolled')); });
      };
      if (original.character) showConfirm(tk('rollConfirm'), update); else update();
    });
    el('apply').addEventListener('click', () => action(game => {
      if (active(game) || !game.character) return;
      const character = { ...game.character, ...Object.fromEntries(fields.map(key => [key, number(key)])), weapon: el('weapon').value };
      for (const key of flags) character[key] = el(key).checked;
      validateShamutantiCharacter(character); game.character = character; game.fight = null; game.log.push(tk('adjusted'));
    }));
    el('start').addEventListener('click', () => action(game => {
      if (active(game) || !game.character) return;
      const section = number('context'), spec = SHAMUTANTI_FIGHTS.find(item => item.section === section);
      game.setup = Object.fromEntries(['context', 'summonCount', 'previousSection', 'nightModifier', 'skillOverride'].map(key => [key, el(key).value]));
      game.setup.applyEntry = el('applyEntry').checked;
      if (section) game.log.push(tk('context.' + section));
      report(game, startShamutantiFight(section, game.character, customSetup.settings(game, { applyEntry: game.setup.applyEntry,
        ...(spec?.summon ? { summonCount: number('summonCount') } : {}),
        ...(spec?.night ? { previousSection: number('previousSection'), nightModifier: number('nightModifier') } : {}),
        skillOverride: number('skillOverride', true),
        carryFrom: game.fight?.status === 'otherSpell' && spec?.enemies[0]?.name === game.fight.enemies[0].name ? game.fight : null })));
    }));
    el('step').addEventListener('click', () => action(game => report(game, shamutantiRound(game.fight))));
    el('enemyOverride').addEventListener('click', () => action(game => report(game, setShamutantiEnemySkill(game.fight, number('enemySkillOverride', true)))));
    for (const [key, useLuck] of [['luckYes', true], ['luckNo', false]]) {
      el(key).addEventListener('click', () => action(game => report(game, resolveShamutantiLuck(game.fight, useLuck))));
    }
    el('spare').addEventListener('click', () => action(game => report(game, spareShamutanti(game.fight))));
    el('otherSpell').addEventListener('click', () => action(game => report(game, shamutantiOtherSpell(game.fight))));
    el('meal').addEventListener('click', () => action(game => {
      if (active(game)) return;
      game.character = healShamutantiCharacter(game.character, 'meal', number('mealAmount')); game.fight = null; game.log.push(tk('mealUsed'));
    }));
    el('libra').addEventListener('click', () => action(game => {
      if (game.fight?.pending) return;
      const restored = healShamutantiCharacter(game.character, 'libra');
      if (active(game)) game.fight.character = restored;
      else game.fight = null;
      game.character = restored; game.log.push(tk('libraUsedMessage'));
    }));
    el('cancel').addEventListener('click', () => {
      const run = getRun(), original = data();
      if (!active(original) || original.fight.pending) return;
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
