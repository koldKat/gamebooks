import { definition, CHARACTER_DEFAULTS, DARTS_BOARD, ENCOUNTERS, SPELL_ENCOUNTERS, SPELL_LABELS, encounterFor } from './definition.js';
import * as rules from './combat.js';
import * as effects from './effects.js';
import { createState } from './state.js';
import { currentBookId, currentPlaythrough, saveState } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';

const ID = definition.stateKey;
const STATS = ['skill', 'skillInitial', 'stamina', 'staminaInitial', 'luck', 'luckInitial'];
const NUMBERS = ['gold', 'provisions', 'mealsToday', 'attackModifier', ...Object.keys(CHARACTER_DEFAULTS).filter(key => typeof CHARACTER_DEFAULTS[key] === 'number')];
const FLAGS = Object.keys(CHARACTER_DEFAULTS).filter(key => typeof CHARACTER_DEFAULTS[key] === 'boolean').concat(['libraUsed', 'libraRenounced']);
const ENTRIES = [...ENCOUNTERS, ...SPELL_ENCOUNTERS].sort((a, b) => a.section - b.section);
const active = fight => Boolean(fight && !fight.outcome);
const dartsActive = game => Boolean(game && game.winner === null);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createCrownPanel({ document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({ currentBookId: getBookId(), currentPlaythrough: getRun, saveState }));
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const check = key => `<label class="bsim-checkbox" id="${ID}-${key}-row"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  const input = (key, min = key === 'attackModifier' ? -1000 : key.endsWith('Initial') ? 1 : 0, max = key === 'dartsGames' ? 2 : 10000) => `<label class="inv-edit-row" id="${ID}-${key}-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="${max}" step="1" required></label>`;
  const select = (key, values) => `<label class="inv-edit-row" id="${ID}-${key}-row"><span>${escape(tk(key))}</span><select class="inv-edit-input" id="${ID}-${key}">${values.map(([value, label]) => `<option value="${escape(value)}">${escape(tk(label))}</option>`).join('')}</select></label>`;
  const entryLabel = section => {
    const config = encounterFor(section);
    return tk('encounter.' + config.key) + (config.spell ? ' / ' + tk('spell.' + SPELL_LABELS[section]) : '') + ` (${section})`;
  };
  const selected = () => encounterFor(Number(el('encounter').value));
  const canCarry = (fight, config) => fight?.outcome === 'continue' && fight.destination === config.section
    && config.requiresCarryFrom?.includes(fight.config.sourceSection ?? fight.config.section);
  let shownRun, rendered;

  function number(key) {
    const field = el(key), value = Number(field.value);
    if (!field.value.trim() || !Number.isSafeInteger(value) || value < Number(field.min) || value > Number(field.max)) {
      field.closest('details')?.setAttribute('open', ''); field.focus(); throw new RangeError('Invalid field');
    }
    return value;
  }
  function character() {
    const next = { ...(store.read()?.character ?? rules.newCharacter(el('role').value, () => 1)),
      ...Object.fromEntries([...STATS, ...NUMBERS].map(key => [key, number(key)])) };
    for (const key of FLAGS) next[key] = el(key).checked;
    next.afflictions = el('fever').checked ? [...new Set([...next.afflictions, 'fever'])] : next.afflictions.filter(value => value !== 'fever');
    next.role = el('role').value; next.dead = next.stamina === 0;
    return rules.validateCharacter(next);
  }
  function setup() {
    return Object.fromEntries(['encounter', 'surprise', 'enemyIndex', 'enemyDefender', 'summonCount', 'volleyCount', 'remaining', 'target', 'secondTarget'].map(key => [key, el(key).value])
      .concat(['applyEntry', 'hasComponent', 'helpCopies', 'secondWeaponEquipped', 'itemRemovedManually', 'useHolySpear', 'borrow'].map(key => [key, el(key).checked]),
        [['copyEnemies', [0, 1, 2].filter(index => el('copy' + index).checked)]]));
  }
  function close() { el('overlay')?.classList.remove('active'); rendered = null; }
  function change(update) {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) { close(); return; }
    try { if (store.change(data => { data.setup = setup(); update(data); })) render(true); }
    catch { showAlert(tk('invalid')); }
  }
  function confirmed(key, update) {
    const run = getRun(), before = store.read();
    showConfirm(tk(key), () => { if (getRun() === run && store.read() === before && Number(getBookId()) === definition.id) change(update); });
  }
  function report(data, fight) {
    const previous = data.fight;
    data.fight = fight; data.character = structuredClone(fight.player);
    for (const event of fight.events) {
      const enemy = event.enemy == null ? '' : tk('enemy.' + fight.enemies[event.enemy].key);
      if (['attack', 'extraAttack', 'allyAttack'].includes(event.kind)) data.log.push(tk(event.kind + 'Line', { ...event, enemy }));
      else if (event.kind === 'hit') data.log.push(tk('hitLine', { target: event.direction === 'outgoing' ? enemy : event.actor === 'ally' ? tk('ally') : tk('you'), damage: event.damage }));
      else if (event.kind === 'luck') data.log.push(tk('luckLine', { roll: event.roll, result: tk(event.lucky ? 'lucky' : 'unlucky') }));
      else if (event.kind === 'gaze') data.log.push(tk('gazeLine', { ...event, enemy, result: tk(event.burnt ? 'hit' : 'miss') }));
      else if (event.kind === 'whip') data.log.push(tk('whipLine', event));
      else if (event.kind === 'carriedWounds') data.log.push(tk('carryLine', { section: event.from }));
      else if (event.kind === 'pebble') data.log.push(tk('pebbleLine', { ...event, enemy, result: tk(event.hit ? 'hit' : 'miss') }));
      else if (event.damage != null) data.log.push(tk('hpLine', { damage: event.damage, reason: tk('event.' + event.kind) }));
    }
    if (fight.outcome && !fight.recorded) data.log.push(tk('status.' + fight.outcome));
    if (fight.destination && fight.destination !== previous?.destination) data.log.push(tk('destination', { section: fight.destination }));
    if (fight.noticeDestination && fight.noticeDestination !== previous?.noticeDestination) data.log.push(tk('readRules', { section: fight.noticeDestination }));
  }
  function start(data, section, carry = false) {
    if (active(data.fight) || dartsActive(data.darts) || !data.character || data.character.dead) return;
    const config = encounterFor(section), options = {
      applyEntry: el('applyEntry').checked, surprise: el('surprise').value,
      enemyIndex: Number(el('enemyIndex').value || 0), helpCopies: el('helpCopies').checked,
      enemyDefender: el('enemyDefender').value, secondWeaponEquipped: el('secondWeaponEquipped').checked,
      itemRemovedManually: el('itemRemovedManually').checked,
      useHolySpear: config.holySpearInstantKill && !config.spell && el('useHolySpear').checked,
    };
    if (!carry) data.character = character();
    if (config.component) options.hasComponent = el('hasComponent').checked;
    if (config.success?.summon === 'goblin') options.summonCount = number('summonCount');
    if (config.success?.mirrorCopies) options.copyEnemies = [0, 1, 2].filter(index => el('copy' + index).checked);
    if (config.success?.volley) options.volleyCount = number('volleyCount');
    if (canCarry(data.fight, config)) options.carryFrom = data.fight;
    else if (config.requiresCarryFrom && !config.carryPlayerOnly) options.remainingStamina = el('remaining').value.split(',').map(value => Number(value.trim()));
    const fight = rules.startFight(section, data.character, options);
    fight.name = entryLabel(section); data.setup.encounter = String(section); report(data, fight);
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (Number(getBookId()) !== definition.id || !getRun() || getRun() !== shownRun) { close(); return; }
    const data = store.read();
    if (!data || !force && data === rendered) return;
    rendered = data;
    const hero = data.character, fight = data.fight, busy = active(fight), playingDarts = dartsActive(data.darts), locked = busy || playingDarts;
    const dead = !hero || hero.dead || !hero.stamina;
    for (const key of STATS) { el(key).value = hero?.[key] ?? ''; el(key).disabled = locked; }
    for (const key of NUMBERS) { el(key).value = hero?.[key] ?? CHARACTER_DEFAULTS[key] ?? ({ gold: 20, provisions: 2 })[key] ?? 0; el(key).disabled = locked; }
    for (const key of FLAGS) { el(key).checked = hero?.[key] ?? CHARACTER_DEFAULTS[key] ?? false; el(key).disabled = locked; }
    el('fever').checked = hero?.afflictions.includes('fever') ?? false; el('fever').disabled = locked;
    el('role').value = hero?.role ?? 'warrior'; el('role').disabled = locked;
    const defaults = { encounter: '29', surprise: 'none', enemyDefender: 'copy', summonCount: '1', volleyCount: '1', remaining: '2' };
    for (const key of Object.keys(defaults)) el(key).value = data.setup[key] ?? defaults[key];
    for (const key of ['applyEntry', 'helpCopies', 'secondWeaponEquipped', 'itemRemovedManually', 'useHolySpear', 'borrow']) el(key).checked = data.setup[key] ?? key === 'applyEntry';
    for (const index of [0, 1, 2]) el('copy' + index).checked = (data.setup.copyEnemies ?? [0]).includes(index);
    const config = selected(), componentField = ({ coin: 'gold', medicine: 'medicines', giantTooth: 'giantTeeth' })[config.component] ?? config.component;
    el('hasComponent').checked = data.setup.hasComponent ?? Boolean(hero?.[componentField]);
    el('componentName').textContent = config.component ? tk(componentField) : '';
    const options = config.success ?? config;
    const rows = { hasComponent: Boolean(config.component), summonCount: options.summon === 'goblin', copies: Boolean(options.mirrorCopies),
      helpCopies: Boolean(options.mirrorCopies), enemyDefender: Boolean(options.mirrorCopies), volleyCount: Boolean(options.volley),
      surprise: Boolean(config.surpriseChoice), enemyIndex: Boolean(config.excludeEnemy || config.disableEnemy),
      remaining: Boolean(config.requiresCarryFrom && !config.carryPlayerOnly && !canCarry(fight, config)),
      itemRemovedManually: Boolean(config.consumeItem), secondWeaponEquipped: Boolean(hero?.twoWeapons),
      useHolySpear: Boolean(config.holySpearInstantKill && !config.spell) };
    const oldEnemy = data.setup.enemyIndex ?? '0';
    el('enemyIndex').innerHTML = config.enemies.map((enemy, index) => `<option value="${index}">${escape(tk('enemy.' + enemy.key))}</option>`).join('');
    el('enemyIndex').value = oldEnemy;
    for (const [key, visible] of Object.entries(rows)) { el(key + '-row').hidden = !visible; if (el(key)?.tagName !== 'DIV') el(key).disabled = locked; }
    if (busy && fight.config.mirrorCopies && !fight.pending.length) {
      el('helpCopies').checked = fight.helpCopies;
      el('enemyDefender').value = fight.enemyDefender;
      el('helpCopies').disabled = el('enemyDefender').disabled = false;
    }
    for (const key of ['encounter', 'applyEntry', 'copy0', 'copy1', 'copy2']) el(key).disabled = locked;
    el('start').disabled = locked || dead || config.spell && (hero.role !== 'wizard' || hero.forgottenMagic);
    for (const key of ['roll', 'apply']) el(key).disabled = locked;
    el('cancel').disabled = !locked;
    const pending = Boolean(fight?.pending.length), current = busy ? fight.config : config;
    el('note').textContent = tk('note.' + current.mode) + (current.descriptiveStrengthOnly || current.success?.descriptiveStrengthOnly ? '\n' + tk('strengthNote') : '');
    const indices = busy ? rules.activeEnemies(fight) : [];
    for (const key of ['target', 'secondTarget']) {
      el(key).innerHTML = indices.map(index => `<option value="${index}">${escape(tk('enemy.' + fight.enemies[index].key))}</option>`).join('');
      el(key).value = indices.includes(Number(data.setup[key])) ? data.setup[key] : String(indices[0] ?? '');
      el(key).disabled = !busy || pending;
    }
    el('secondTarget-row').hidden = !fight?.secondWeaponEquipped;
    el('round').disabled = !busy || pending || fight.volleyActive;
    el('pebble').hidden = el('stopVolley').hidden = !busy || !fight.volleyActive;
    el('pebble').disabled = !busy || pending;
    el('stopVolley').disabled = !busy || pending || Boolean(fight.config.volley?.frightens && fight.volleyRemaining > 0);
    for (const key of ['useLuck', 'skipLuck']) el(key).hidden = !pending;
    el('useLuck').disabled = !pending || fight.pending[0].actor !== 'player' || !fight.pending[0].damage;
    el('flee').disabled = !busy || pending || !(fight.config.optionalEscape || fight.playerHits === 1 && fight.config.firstHitEscape);
    const mercy = fight?.config.mercy, enemy = indices[0];
    el('spare').disabled = pending || !(fight?.mercyDestination || busy && mercy && enemy !== undefined && fight.enemies[enemy].stamina <= mercy.floor);
    el('recast').disabled = !busy || pending || !fight.config.mindRead || fight.enemies[fight.mindReadTarget]?.stamina > 0;
    el('continueFight').disabled = !(fight?.outcome === 'continue' && ENTRIES.some(entry => entry.section === fight.destination));
    for (const key of ['eat', 'nextDay', 'fruit', 'medicine', 'coatWeapon', 'luckCheck', 'libraRestore', 'libraCure', 'door53', 'door454', 'spearEscape', 'feverChoice', 'mutation', 'timeTravel', 'dartsStart']) el(key).disabled = locked || dead;
    for (const key of ['libraRestore', 'libraCure']) el(key).disabled = playingDarts || dead || pending || hero?.libraUsed || hero?.libraRenounced || hero?.insideFortress;
    el('dart').disabled = !playingDarts;
    el('dartsStart').disabled ||= hero?.dartsGames >= 2;
    const actors = fight ? [...fight.enemies.map(enemy => ({ ...enemy, ally: false })), ...fight.allies.filter(ally => ally.stamina > 0).slice(0, 20).map(ally => ({ ...ally, ally: true }))] : [];
    el('opponents').innerHTML = actors.length ? `<table class="bsim-combat-table"><thead><tr><th>${escape(tk('opponents'))}</th><th>${escape(tk('skill'))}</th><th>${escape(tk('stamina'))}</th></tr></thead><tbody>${actors.map(actor => `<tr><td>${escape(tk('enemy.' + actor.key))}${actor.ally ? ' / ' + escape(tk('ally')) : ''}${actor.excluded ? ' / ' + escape(tk('excluded')) : ''}</td><td>${actor.skill}</td><td>${actor.stamina}</td></tr>`).join('')}</tbody></table>` : '';
    el('status').textContent = fight ? [tk('rounds', fight), fight.outcome ? tk('status.' + fight.outcome) : pending ? tk('pending') : tk('ready'), fight.destination ? tk('destination', { section: fight.destination }) : ''].filter(Boolean).join('\n') : tk(dead ? 'noCharacter' : 'ready');
    el('dartsStatus').textContent = data.darts?.winner === -1 ? tk('status.cancelled') : data.darts ? tk('dartsScore', { total: data.darts.total, player: data.darts.winner === null ? data.darts.nextPlayer + 1 : data.darts.winner + 1 }) + (data.darts.winner !== null ? '\n' + tk(data.darts.winner === 0 ? 'dartsWon' : 'dartsEnded') : '') : '';
    el('log').textContent = data.log.join('\n');
    el('history').textContent = data.history.slice(-30).reverse().map(item => item.enemy + ': ' + tk('status.' + item.outcome)).join('\n');
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    shownRun = getRun();
    try { if (!store.read()) store.change(() => {}); el('overlay').classList.add('active'); render(true); el('close').focus(); }
    catch { close(); showAlert(tk('invalid')); }
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><details open><summary>${escape(tk('character'))}</summary>${select('role', [['warrior', 'warrior'], ['wizard', 'wizard']])}${STATS.map(key => input(key)).join('')}<div class="bsim-btn-row">${button('roll')}${button('apply')}</div></details><details><summary>${escape(tk('equipment'))}</summary>${NUMBERS.map(key => input(key)).join('')}${FLAGS.map(check).join('')}${check('fever')}</details><details><summary>${escape(tk('recovery'))}</summary><p>${escape(tk('recoveryNote'))}</p><div class="bsim-btn-row">${['eat', 'nextDay', 'fruit', 'medicine', 'coatWeapon', 'luckCheck', 'libraRestore', 'libraCure'].map(button).join('')}</div></details><details><summary>${escape(tk('checks'))}</summary><div class="bsim-btn-row">${['door53', 'door454', 'spearEscape', 'feverChoice', 'mutation', 'timeTravel'].map(button).join('')}</div></details><details><summary>${escape(tk('darts'))}</summary><p>${escape(tk('dartsNote'))}</p><details><summary>${escape(tk('board'))}</summary><img src="${DARTS_BOARD}" alt="${escape(tk('board'))}" width="180" loading="lazy" decoding="async" style="max-width:100%;height:auto"></details>${check('borrow')}<div class="bsim-btn-row">${button('dartsStart')}</div>${input('dartPoints', -1000, 1000)}<div class="bsim-btn-row">${button('dart')}</div><p class="bsim-status" id="${ID}-dartsStatus" role="status"></p></details></div><div class="bsim-col bsim-col-right"><label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter">${ENTRIES.map(entry => `<option value="${entry.section}">${escape(entryLabel(entry.section))}</option>`).join('')}</select></label><p class="bsim-status" id="${ID}-note"></p><details><summary>${escape(tk('fightSetup'))}</summary>${check('applyEntry')}${check('hasComponent')}<p id="${ID}-componentName"></p>${input('summonCount', 1)}${input('volleyCount', 1)}${select('surprise', [['none', 'noSurprise'], ['446', 'doorSurprise'], ['553', 'suddenEntry']])}${select('enemyIndex', [])}<label class="inv-edit-row" id="${ID}-remaining-row"><span>${escape(tk('remaining'))}</span><input class="inv-edit-input" id="${ID}-remaining" value="2"></label><div id="${ID}-copies-row"><div id="${ID}-copies">${[0, 1, 2].map(index => check('copy' + index)).join('')}</div></div>${check('helpCopies')}${select('enemyDefender', [['copy', 'copyDefends'], ['player', 'playerDefends']])}${check('secondWeaponEquipped')}${check('itemRemovedManually')}</details><div class="bsim-btn-row">${button('start')}${button('cancel')}${button('continueFight')}</div><div id="${ID}-opponents"></div>${select('target', [])}${select('secondTarget', [])}<div class="bsim-btn-row">${['round', 'flee', 'spare', 'recast', 'pebble', 'stopVolley', 'useLuck', 'skipLuck'].map(button).join('')}</div><p class="bsim-status" id="${ID}-status" role="status" aria-live="polite"></p><details open><summary>${escape(tk('log'))}</summary><div class="bsim-status bsim-log" id="${ID}-log"></div></details><details><summary>${escape(tk('history'))}</summary><div class="bsim-status bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    el('itemRemovedManually-row').insertAdjacentHTML('afterend', check('useHolySpear'));
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.textContent = t('battlesim.title'); trigger.style.display = 'none';
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('close').addEventListener('click', close); overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) { event.stopPropagation(); close(); } });
    const setupKeys = ['encounter', 'surprise', 'enemyIndex', 'enemyDefender', 'summonCount', 'volleyCount', 'remaining', 'target', 'secondTarget', 'applyEntry', 'hasComponent', 'helpCopies', 'secondWeaponEquipped', 'itemRemovedManually', 'copy0', 'copy1', 'copy2', 'borrow'];
    setupKeys.push('useHolySpear');
    for (const key of setupKeys) el(key).addEventListener('change', () => change(data => {
      if (key === 'encounter') delete data.setup.hasComponent;
      if (active(data.fight) && data.fight.config.mirrorCopies && !data.fight.pending.length) {
        if (key === 'helpCopies') data.fight.helpCopies = el(key).checked;
        if (key === 'enemyDefender') data.fight.enemyDefender = el(key).value;
      }
    }));
    el('roll').addEventListener('click', () => {
      const update = data => { if (!active(data.fight) && !dartsActive(data.darts)) { data.character = rules.newCharacter(el('role').value); data.fight = null; data.darts = null; data.log.push(tk('newCharacter')); } };
      if (store.read()?.character) confirmed('rollConfirm', update); else change(update);
    });
    el('apply').addEventListener('click', () => {
      const update = data => { if (!active(data.fight) && !dartsActive(data.darts)) { data.character = character(); data.fight = null; } };
      if (store.read()?.character?.dead) confirmed('restoreConfirm', update); else change(update);
    });
    el('start').addEventListener('click', () => change(data => start(data, Number(el('encounter').value))));
    el('continueFight').addEventListener('click', () => change(data => { if (data.fight?.outcome === 'continue') start(data, data.fight.destination, true); }));
    const action = (key, transform) => el(key).addEventListener('click', () => change(data => report(data, transform(data.fight))));
    action('round', fight => rules.round(fight, Number(el('target').value), undefined, { secondTarget: Number(el('secondTarget').value) }));
    action('flee', rules.flee); action('spare', fight => fight.mercyDestination ? rules.spareAtCheckpoint(fight) : rules.spare(fight));
    action('recast', rules.recastMindRead); action('useLuck', fight => rules.resolveHit(fight, true)); action('skipLuck', fight => rules.resolveHit(fight, false));
    action('pebble', fight => rules.throwPebble(fight, Number(el('target').value))); action('stopVolley', rules.stopVolley);
    el('cancel').addEventListener('click', () => confirmed('cancelConfirm', data => {
      if (active(data.fight)) report(data, { ...data.fight, outcome: 'cancelled', pending: [], events: [], destination: null });
      if (dartsActive(data.darts)) data.darts.winner = -1;
    }));
    for (const [key, effect] of [['eat', effects.eat], ['nextDay', effects.nextDay], ['fruit', effects.fruit], ['medicine', effects.healingSpell], ['coatWeapon', effects.coatWeapon], ['libraRestore', value => effects.useLibra(value)], ['libraCure', value => effects.useLibra(value, 'cure')]]) {
      el(key).addEventListener('click', () => change(data => {
        if (dartsActive(data.darts)) return;
        if (active(data.fight)) {
          if (!key.startsWith('libra') || data.fight.pending.length) return;
          const fight = structuredClone(data.fight); fight.player = effect(fight.player); fight.events = []; report(data, fight);
        } else data.character = effect(data.character);
        data.log.push(tk('effectUsed', { effect: tk(key) }));
      }));
    }
    for (const [key, effect] of [['door53', value => effects.doorCheck(value, 53)], ['door454', value => effects.doorCheck(value, 454)], ['spearEscape', effects.spearEscape], ['feverChoice', effects.feverChoice], ['mutation', effects.mutation], ['timeTravel', () => effects.timeTravel()], ['luckCheck', rules.testLuck]]) {
      el(key).addEventListener('click', () => change(data => {
        if (active(data.fight) || dartsActive(data.darts)) return;
        const result = effect(data.character); if (result.character) data.character = result.character;
        data.log.push(tk('checkLine', { name: tk(key), result: result.roll ?? result.throws?.map(pair => pair.join('+')).join(', ') ?? '' }));
        if (result.choiceIndex !== undefined) data.log.push(tk(result.choiceIndex === null ? 'freeSpell' : 'spellColumn', { n: result.choiceIndex + 1 }));
        if (result.lucky !== undefined) data.log.push(tk(result.lucky ? 'lucky' : 'unlucky'));
        if (result.destination) data.log.push(tk('destination', { section: result.destination }));
      }));
    }
    el('dartsStart').addEventListener('click', () => change(data => { if (!active(data.fight) && !dartsActive(data.darts)) { data.darts = effects.startDarts(data.character, el('borrow').checked); data.character = structuredClone(data.darts.character); } }));
    el('dart').addEventListener('click', () => change(data => { data.darts = effects.dart(data.darts, number('dartPoints')); data.character = structuredClone(data.darts.character); }));
    registerShortcut({ button: trigger, overlay, open, close });
  }
  return { init, render, open, close, setVisible(visible) { if (el('btn')) el('btn').style.display = visible ? '' : 'none'; if (!visible) { close(); shownRun = null; } } };
}

const panel = createCrownPanel({ document, t, getRun: currentPlaythrough, getBookId: () => currentBookId, saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', { getButton: () => button, getOverlay: () => overlay, otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  },
});
export function initSim724() { panel.init(); }
export function renderSim724() { panel.render(); }
export function setSim724Visible(visible) { panel.setVisible(visible); }
export { initSim724 as init, renderSim724 as render, setSim724Visible as setVisible };
