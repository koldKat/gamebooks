import { createCustomOpponentSetup } from '../../custom-setup.js';
import { freewayOpponentFields } from './opponents.js';
import { newFreewayCharacter, validateFreewayCharacter, testFreewayLuck, healFreewayCharacter,
  startFreewayFight, freewayRound, freewayContest, startFreewayRace, freewayRaceStep } from './core.js';
import { FREEWAY_FIGHTS, FREEWAY_CONTESTS, FREEWAY_RACES } from './roster.js';

const ID = 'sim663';
const stats = ['skill', 'stamina', 'luck', 'firepower', 'armour'];
const resources = ['medkits', 'rockets', 'spikes', 'oil', 'credits'];
const contexts = [...FREEWAY_FIGHTS, ...FREEWAY_CONTESTS, ...FREEWAY_RACES].sort((a, b) => a.section - b.section);
const escape = value => String(value).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createFreewayPanel({ document, t, getRun, getBookId, saveState,
  showAlert, showConfirm, getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, parameters) => t('battlesim663.' + key, parameters);
  const el = key => document.getElementById(ID + '-' + key);
  const busy = game => game?.fight?.status === 'fighting' || game?.race?.status === 'racing';
  let shownRun, customSetup;
  const enemyName = enemy => enemy.displayName || tk('enemy.' + enemy.name);
  function data() {
    if (Number(getBookId()) !== 663) return null;
    const run = getRun();
    return run ? run[ID] ||= { character: null, fight: null, race: null, history: [], log: [], setup: {} } : null;
  }
  function close() { el('overlay')?.classList.remove('active'); }
  function open() {
    if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    render(); el('overlay').classList.add('active');
  }
  function number(key, max = 10000) {
    const text = el(key).value.trim(), value = Number(text);
    if (!text || !Number.isSafeInteger(value) || value < 0 || value > max) throw new RangeError('Invalid input');
    return value;
  }
  function snapshot(game) {
    game.setup = { context: el('context').value, rounds: el('rounds').value, kind: el('kind').value };
  }
  function record(game, encounter) {
    if (!encounter || encounter.recorded || !['win', 'loss'].includes(encounter.status)) return;
    encounter.recorded = true;
    game.history.push({ enemy: encounter.config.custom ? encounter.config.name : tk('context.' + encounter.config.section), outcome: encounter.status,
      ts: Math.max(Date.now(), (game.history.at(-1)?.ts ?? 0) + 1) });
  }
  function action(update) {
    const run = getRun(), original = data();
    if (!original) return;
    try {
      const next = structuredClone(original);
      update(next);
      if (run !== getRun() || Number(getBookId()) !== 663) return;
      if (next.fight) next.character = structuredClone(next.fight.character);
      record(next, next.fight); record(next, next.race);
      next.log = next.log.slice(-100); next.history = next.history.slice(-30);
      run[ID] = next; saveState(); render();
    } catch (_) { showAlert(tk('invalid')); }
  }
  function fightReport(game, result) {
    game.fight = result.fight;
    if (result.rocket) game.log.push(tk('rocketFired'));
    for (const attack of result.attacks) {
      game.log.push(tk('attackRoll', { enemy: enemyName(game.fight.enemies[attack.index]),
        player: attack.playerAttack, opponent: attack.enemyAttack,
        dealt: attack.playerDamage, taken: attack.enemyDamage }));
    }
    if (game.fight.status !== 'fighting') game.log.push(tk('status.' + game.fight.status));
    if (game.fight.section) game.log.push(tk('destination', { section: game.fight.section }));
  }
  function contextChanged() {
    const context = FREEWAY_FIGHTS.find(entry => entry.section === Number(el('context').value));
    el('rounds-row').hidden = !context?.manualRounds;
    el('contextNote').textContent = context?.manualRounds ? tk('manualRoundsNote') : '';
  }
  function render() {
    if (!el('overlay')) return;
    const game = data();
    if (!game) { shownRun = undefined; close(); return; }
    if (shownRun !== getRun()) {
      shownRun = getRun();
      el('context').value = game.setup.context ?? '0';
      el('rounds').value = game.setup.rounds ?? '';
      el('kind').value = game.setup.kind ?? 'hand';
    }
    customSetup?.render();
    el('kind-row').hidden = el('context').value !== '0';
    el('kind').disabled = busy(game);
    const active = busy(game), character = game.character;
    el('characterStatus').textContent = character ? tk('characterStatus', character) : tk('ready');
    for (const key of [...stats.flatMap(key => [key, key + 'Initial']), ...resources]) {
      el(key).value = character ? String(character[key]) : '';
      el(key).disabled = active || !character;
    }
    for (const key of ['magnum', 'knuckleduster']) {
      el(key).checked = character?.[key] ?? false;
      el(key).disabled = active || !character;
    }
    for (const key of ['roll', 'context', 'rounds']) el(key).disabled = active;
    el('apply').disabled = active || !character;
    el('start').disabled = active || !character || !character.stamina || !character.armour;
    el('luckTest').disabled = active || !character || !character.stamina || !character.armour;
    el('medkit').disabled = active || !character || !character.stamina || !character.armour
      || !character.medkits || character.stamina === character.staminaInitial;
    const fight = game.fight, encounter = game.race?.status === 'racing' ? game.race : fight || game.race;
    el('step').disabled = !active;
    el('cancel').disabled = !active;
    el('rocket').disabled = fight?.status !== 'fighting' || fight.config.kind !== 'vehicle'
      || fight.config.rockets === false || !character?.rockets;
    el('target-row').hidden = !fight?.config.simultaneous;
    const previousTarget = el('target').value;
    el('target').innerHTML = fight?.enemies.filter(enemy => !enemy.defeated).map(enemy => {
      const index = fight.enemies.indexOf(enemy);
      return `<option value="${index}">${escape(enemyName(enemy))} (${enemy.health})</option>`;
    }).join('') || '';
    if ([...el('target').options].some(option => option.value === previousTarget)) el('target').value = previousTarget;
    const foes = fight?.enemies.map(enemy => `${enemyName(enemy)}: ${enemy.attack} / ${enemy.health}`).join(' · ') ?? '';
    el('status').textContent = encounter ? tk('encounterStatus', {
      status: tk('status.' + encounter.status), round: encounter.round,
      details: game.race?.status === 'racing' || encounter === game.race
        ? tk('raceProgress', { player: encounter.player, enemy: encounter.enemy }) : foes,
    }) : tk('ready');
    el('log').innerHTML = game.log.slice(-100).reverse().map(line => `<div>${escape(line)}</div>`).join('');
    el('history').innerHTML = game.history.slice(-30).reverse()
      .map(item => `<div>${escape(item.enemy)} · ${escape(tk('status.' + item.outcome))}</div>`).join('');
    contextChanged();
  }
  const field = key => `<label class="inv-edit-row" id="${ID}-${key}-row">${escape(tk(key))}<input class="inv-edit-input" type="number" min="0" max="10000" step="1" id="${ID}-${key}"></label>`;
  const checkbox = key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  const button = key => `<button class="bsim-action-btn" type="button" id="${ID}-${key}">${escape(tk(key))}</button>`;
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(tk('title'))}</span><button class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-status" id="${ID}-characterStatus"></div>${button('roll')}<details><summary>${escape(tk('character'))}</summary>${stats.flatMap(key => [field(key), field(key + 'Initial')]).join('')}${resources.map(field).join('')}${checkbox('magnum')}${checkbox('knuckleduster')}${button('apply')}</details><div class="bsim-btn-row">${button('medkit')}${button('luckTest')}</div><label class="inv-edit-row">${escape(tk('context'))}<select class="inv-edit-input" id="${ID}-context">${contexts.map(entry => `<option value="${entry.section}">${escape(tk('context.' + entry.section))}</option>`).join('')}</select></label><label id="${ID}-kind-row" class="inv-edit-row">${escape(tk('kind'))}<select id="${ID}-kind" class="inv-edit-input">${['hand','shoot','vehicle'].map(kind=>`<option value="${kind}">${escape(tk('kind.'+kind))}</option>`).join('')}</select></label>${field('rounds')}<p id="${ID}-contextNote"></p>${button('start')}<div class="bsim-status" id="${ID}-status"></div><label class="inv-edit-row" id="${ID}-target-row">${escape(tk('target'))}<select class="inv-edit-input" id="${ID}-target"></select></label><div class="bsim-btn-row">${button('step')}${button('rocket')}${button('cancel')}</div></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details><div class="bsim-log" id="${ID}-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    customSetup = createCustomOpponentSetup({document,id:ID,t,getRun,getData:data,selectKey:'context',isBusy:busy,language:'bg',
      fields:freewayOpponentFields.map(f=>({...f,label:tk('opponent.'+f.key)})),
      presets:FREEWAY_FIGHTS.flatMap(f=>f.enemies.map(e=>({...e,displayName:enemyName(e)}))),
    });
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
      if (!original || busy(original)) return;
      const update = () => {
        if (run !== getRun() || original !== data()) return;
        action(game => { game.character = newFreewayCharacter(); game.fight = null; game.race = null; game.log.push(tk('rolled')); });
      };
      if (original.character) showConfirm(tk('rollConfirm'), update); else update();
    });
    el('apply').addEventListener('click', () => action(game => {
      if (busy(game) || !game.character) return;
      const character = Object.fromEntries([...stats.flatMap(key => [key, key + 'Initial']), ...resources].map(key => [key, number(key)]));
      for (const key of ['magnum', 'knuckleduster']) character[key] = el(key).checked;
      validateFreewayCharacter(character);
      game.character = character; game.fight = null; game.race = null; snapshot(game); game.log.push(tk('adjusted'));
    }));
    el('start').addEventListener('click', () => action(game => {
      if (busy(game) || !game.character) return;
      const section = number('context', 380);
      snapshot(game); game.fight = null; game.race = null;
      if (section) game.log.push(tk('context.' + section));
      if (FREEWAY_RACES.some(entry => entry.section === section)) game.race = startFreewayRace(section);
      else if (FREEWAY_CONTESTS.some(entry => entry.section === section)) {
        const result = freewayContest(game.character, section);
        game.log.push(tk('contestRoll', result), tk('destination', { section: result.section }));
      } else game.fight = startFreewayFight(game.character, section, customSetup.settings(game, {kind:el('kind').value,
        rounds: el('rounds').value.trim() ? number('rounds', 100) : undefined,
      }));
    }));
    el('step').addEventListener('click', () => action(game => {
      if (game.race?.status === 'racing') {
        const result = freewayRaceStep(game.race);
        game.race = result.race;
        game.log.push(tk('raceProgress', { player: result.race.player, enemy: result.race.enemy }));
        if (result.race.section) game.log.push(tk('destination', { section: result.race.section }));
      } else fightReport(game, freewayRound(game.fight, { target: number('target', 2) }));
    }));
    el('rocket').addEventListener('click', () => action(game => fightReport(game,
      freewayRound(game.fight, { target: number('target', 2), rocket: true }))));
    el('medkit').addEventListener('click', () => action(game => {
      if (busy(game)) return;
      game.character = healFreewayCharacter(game.character); game.fight = null; game.log.push(tk('healed'));
    }));
    el('luckTest').addEventListener('click', () => action(game => {
      if (busy(game)) return;
      const result = testFreewayLuck(game.character);
      game.character = result.character; game.fight = null;
      game.log.push(tk('luckRoll', { total: result.total, result: tk(result.lucky ? 'lucky' : 'unlucky') }));
    }));
    el('cancel').addEventListener('click', () => {
      const run = getRun(), original = data();
      if (!busy(original)) return;
      showConfirm(tk('cancelConfirm'), () => {
        if (run !== getRun() || original !== data()) return;
        action(game => {
          if (game.fight?.status === 'fighting') game.fight.status = 'cancelled';
          if (game.race?.status === 'racing') game.race.status = 'cancelled';
          game.log.push(tk('status.cancelled'));
        });
      });
    });
  }
  return { init, render, setVisible(visible) {
    const btn = el('btn'); if (btn) btn.style.display = visible ? '' : 'none'; if (!visible) close();
  } };
}
