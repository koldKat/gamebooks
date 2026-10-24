import { FABLED_ABILITIES, FABLED_PROFESSIONS, newFabledCharacter, validateFabledCharacter,
  fabledDefence, fabledAbilityCheck, fabledRankCheck } from './character.js';
import { startFabledFight, fabledRound, surrenderFabledFight, fleeFabledFight } from './core.js';
import { WAR_TORN_FIGHTS } from './roster.js';
import { FABLED_SEA_CHECKS, fabledSeaCheck } from './navigation.js';
import { createOpponentEditor } from '../../opponents.js';

const defaultFields = [...FABLED_ABILITIES, 'rank', 'stamina', 'staminaInitial', 'armour', 'shards', 'ratPoison'];
const flags = ['combatBlessing', 'luckBlessing', 'stormsBlessing'];
const escape = value => String(value).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createFabledPanel({ document, t, getRun, getBookId, saveState,
  showAlert, showConfirm, getButtonRow, registerShortcut = () => {},
  bookId = 674, fights = WAR_TORN_FIGHTS, seaChecks = FABLED_SEA_CHECKS,
  seaCheck = fabledSeaCheck, characterDefaults = {}, extraFlags = [], encounterOptions = [],
  extraFields = [], createCharacter = profession => newFabledCharacter(profession, characterDefaults),
  validateCharacter = validateFabledCharacter, characterDefence = fabledDefence,
  abilityCheck = fabledAbilityCheck, extendPanel = () => ({}), opponentStatUnavailable,
  startFight = startFabledFight, roundFight = fabledRound, fleeFight = fleeFabledFight,
  cancelFight = fight => ({ ...fight, status: 'cancelled' }) }) {
  const ID = 'sim' + bookId;
  const fields = [...defaultFields, ...extraFields.map(field => field.key)];
  const characterFlags = [...flags, ...extraFlags];
  const tk = (key, params) => t('battlesim' + bookId + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const active = game => game?.fight?.status === 'fighting';
  const supported = game => game && (!game.fight || game.fight.rulesRevision === 1);
  const enemyName = enemy => {
    if (enemy && typeof enemy === 'object' && enemy.displayName) return enemy.displayName;
    const name = typeof enemy === 'object' ? enemy?.name : enemy;
    const value = tk('enemy.' + name);
    return value === 'battlesim' + bookId + '.enemy.' + name ? name : value;
  };
  const encounterName = spec => [...new Set(spec.enemies.map(enemy => enemy.displayName || enemyName(enemy.name)))].join(' / ')
    + (spec.enemies.length > 1 ? ` (${spec.enemies.length})` : '');
  let shownRun;
  let opponents;
  let extension = {};
  function data() {
    if (Number(getBookId()) !== bookId) return null;
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
  function action(update) {
    const run = getRun(), original = data();
    if (!supported(original)) return;
    try {
      const next = structuredClone(original);
      update(next);
      if (run !== getRun() || original !== data() || Number(getBookId()) !== bookId) return;
      const fight = next.fight;
      if (fight) next.character = structuredClone(fight.character);
      if (fight && !fight.recorded && ['win', 'loss'].includes(fight.status)) {
        fight.recorded = true;
        next.history.push({ enemy: encounterName(fight.config), outcome: fight.status,
          ts: Math.max(Date.now(), (next.history.at(-1)?.ts ?? 0) + 1) });
      }
      next.log = next.log.slice(-100);
      run[ID] = next; saveState(); render();
    } catch (_) { showAlert(tk('invalid')); }
  }
  function report(game, fight, previousEvents = 0) {
    game.fight = fight;
    for (const event of fight.events.slice(previousEvents)) {
      if (event.kind === 'attack') game.log.push(tk('attack', { name: event.direction === 'player' ? tk('you') : event.enemyDisplayName || enemyName(event.enemy ?? fight.enemies[fight.target]),
        total: event.total, defence: event.defence, damage: event.damage }));
      else if (event.kind === 'entry') game.log.push(tk('entry', event));
      else if (event.kind === 'reroll') game.log.push(tk('reroll', { previous: event.previous }));
      else if (event.kind === 'ratPoison') game.log.push(tk('poisonUsed'));
      else if (event.kind === 'abilityCheck') game.log.push(tk('specialCheck', { ...event, ability:tk(event.ability) }));
      else if (event.kind === 'abilityDrain') game.log.push(tk('abilityDrain', { ...event, ability:tk(event.ability) }));
      else if (event.kind === 'defenceBlessing') game.log.push(tk('defenceBlessingUsed'));
      else if (event.kind === 'permanentWound') game.log.push(tk('permanentWound', event));
      else if (event.kind === 'enemyEntry') game.log.push(tk('enemyEntry', event));
      else if (event.kind === 'diseaseBlessing') game.log.push(tk('diseaseBlessingUsed'));
      else {
        const message = extension.eventMessage?.(event);
        if (message) game.log.push(message);
      }
    }
    if (fight.status !== 'fighting') {
      game.log.push(tk('status.' + fight.status));
      if (fight.destination) game.log.push(tk('destination', { section: fight.destination }));
      if (fight.wounded && fight.config.woundEffect && fight.status === 'win') game.log.push(tk('effect.' + fight.config.woundEffect));
    }
  }
  function contextChanged() {
    const game = data(), spec = fights[Number(el('context').value)] ?? {custom: true, section: 0};
    if (!game || !spec) return;
    opponents.fixCount(!spec.custom);
    el('applyEntry-row').hidden = !spec.entryDamage && !spec.entryDice && !spec.preCheck;
    el('ratPoisonUse-row').hidden = !spec.ratPoison;
    const notes = [spec.custom ? t('battlesim.editor.custom') : tk(spec.nonfatal ? 'duel' : spec.simultaneous ? 'simultaneous' : 'sequential')];
    for (const option of encounterOptions) el(option.key+'-row').hidden = !option.sections.includes(spec.section);
    if (spec.threshold !== undefined) notes.push(tk('threshold', { stamina: spec.threshold, section: spec.win }));
    if (spec.attackModifier) notes.push(tk('penalty', { amount: spec.attackModifier }));
    if (bookId === 674 && spec.section === 121) notes.push(tk('underwater'));
    if (spec.woundEffect) notes.push(tk('effect.' + spec.woundEffect));
    if (spec.special) notes.push(tk('effect.' + spec.special));
    if (spec.winChoices) notes.push(tk('winChoices', { sections: spec.winChoices.join(', ') }));
    if (spec.surrender) notes.push(tk('canSurrender'));
    if (spec.flee) notes.push(tk('canFlee'));
    if (bookId === 674 && spec.section === 43) notes.push(tk('magicWeapon'));
    el('contextNote').textContent = notes.join('\n');
  }
  function render() {
    if (!el('overlay')) return;
    const game = data();
    if (!game) { shownRun = undefined; close(); return; }
    if (shownRun !== getRun()) {
      if (shownRun) close();
      shownRun = getRun();
      el('context').value = String(game.setup.context ?? -1);
      const preset = fights[Number(el('context').value)];
      opponents.set(game.setup.opponents ?? preset?.enemies.map(enemy => ({...enemy, displayName: enemyName(enemy.name)})));
      el('attackModifier').value = String(game.setup.attackModifier ?? 0);
      el('applyEntry').checked = game.setup.applyEntry ?? true;
      el('ratPoisonUse').checked = false;
      for (const option of encounterOptions) {
        if (option.type==='checkbox') el(option.key).checked = game.setup[option.key] ?? false;
        else el(option.key).value = String(game.setup[option.key] ?? 0);
      }
      el('difficulty').value = '10'; el('rankDice').value = '1'; el('rankModifier').value = '0';
    }
    const character = game.character, fight = game.fight, busy = active(game), blocked = busy || !supported(game);
    opponents.lock(blocked);
    el('characterStatus').textContent = !supported(game) ? tk('unsupported') : character ? tk('characterStatus', { ...character, defence: characterDefence(character) }) : tk('ready');
    for (const key of fields) {
      if (document.activeElement !== el(key)) el(key).value = character?.[key] ?? '';
      el(key).disabled = blocked || !character;
    }
    for (const key of characterFlags) { el(key).checked = character?.[key] ?? false; el(key).disabled = blocked || !character; }
    if (character) el('profession').value = character.profession;
    el('profession').disabled = blocked;
    for (const key of ['create', 'context', 'applyEntry', 'ratPoisonUse', 'attackModifier']) el(key).disabled = blocked;
    for (const option of encounterOptions) el(option.key).disabled = blocked;
    if (el('target')) {
      el('target-row').hidden = !busy || !fight.config.simultaneous;
      const target = Number(el('target').value);
      el('target').innerHTML = (fight?.enemies ?? []).flatMap((foe,index)=>foe.stamina>0
        ? [`<option value="${index}">${escape(enemyName(foe))}</option>`] : []).join('');
      el('target').value = String(fight?.enemies[target]?.stamina>0 ? target : fight?.target ?? 0);
      el('target').disabled = !busy;
    }
    el('apply').disabled = blocked || !character;
    el('start').disabled = blocked || !character?.stamina;
    el('step').disabled = !supported(game) || !busy;
    el('cancel').disabled = !supported(game) || !busy;
    el('surrender').hidden = !busy || !fight.config.surrender;
    el('flee').hidden = !busy || !fight.config.flee;
    el('useCombatBlessing').disabled = !busy || !character?.combatBlessing;
    if (el('useCombatBlessing').disabled) el('useCombatBlessing').checked = false;
    el('luckReroll').disabled = !busy || !character?.luckBlessing;
    if (el('luckReroll').disabled) el('luckReroll').value = '';
    for (const key of ['abilityRoll', 'rankRoll', 'seaRoll']) el(key).disabled = !supported(game) || busy || !character?.stamina;
    el('safetyFromStorms').disabled = !character?.stormsBlessing && !character?.permanentStorms;
    if (el('safetyFromStorms').disabled) el('safetyFromStorms').checked = false;
    el('status').textContent = fight ? [tk('status.' + fight.status), tk('rounds', { count: fight.rounds }),
      ...fight.enemies.map(foe => `${enemyName(foe)}: ${tk('combat')} ${foe.combat}, ${tk('defence')} ${foe.defence}, ${tk('stamina')} ${foe.stamina}`),
      ...(fight.destination ? [tk('destination', { section: fight.destination })] : [])].join('\n') : '';
    el('history').innerHTML = game.history.slice(-30).reverse().map(item => `<div>${escape(item.enemy)} - ${escape(tk('status.' + item.outcome))}</div>`).join('');
    el('log').innerHTML = game.log.map(line => `<div>${escape(line)}</div>`).join('');
    el('log').scrollTop = el('log').scrollHeight;
    contextChanged();
    extension.render?.(game, {busy, blocked});
  }
  const field = (key, min = 0, max = 1000000) => {
    const spec = extraFields.find(field => field.key === key);
    return `<label class="inv-edit-row"><span class="inv-edit-label">${escape(tk(key))}</span><input class="inv-edit-input" type="number" min="${spec?.min ?? min}" max="${spec?.max ?? max}" step="1" id="${ID}-${key}"></label>`;
  };
  const checkbox = key => `<label class="bsim-checkbox" id="${ID}-${key}-row"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  const button = key => `<button class="bsim-action-btn" type="button" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const select = (key, values) => `<label class="inv-edit-row"><span class="inv-edit-label">${escape(tk(key))}</span><select class="inv-edit-input" id="${ID}-${key}">${values.map(value => `<option value="${escape(value)}">${escape(tk(key + '.' + value))}</option>`).join('')}</select></label>`;
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(tk('title'))}</span><button class="inv-close-btn" type="button" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-status" id="${ID}-characterStatus"></div>${select('profession', Object.keys(FABLED_PROFESSIONS))}${button('create')}<details><summary>${escape(tk('character'))}</summary>${fields.map(key => field(key, FABLED_ABILITIES.includes(key) || ['rank', 'staminaInitial'].includes(key) ? 1 : 0)).join('')}${flags.map(checkbox).join('')}${button('apply')}</details><label class="inv-edit-row"><span class="inv-edit-label">${escape(tk('context'))}</span><select class="inv-edit-input" id="${ID}-context">${WAR_TORN_FIGHTS.map((spec, index) => `<option value="${index}">${escape(encounterName(spec))} (${spec.section})</option>`).join('')}</select></label>${checkbox('applyEntry')}${checkbox('ratPoisonUse')}<details><summary>${escape(tk('overrides'))}</summary>${field('attackModifier', -1000, 1000)}<p>${escape(tk('overrideNote'))}</p></details><p class="bsim-status" id="${ID}-contextNote"></p>${button('start')}<div class="bsim-status" id="${ID}-status"></div>${checkbox('useCombatBlessing')}${select('luckReroll', ['', 'player', 'enemy'])}<div class="bsim-btn-row">${button('step')}${button('surrender')}${button('cancel')}</div><details><summary>${escape(tk('checks'))}</summary>${select('ability', FABLED_ABILITIES)}${field('difficulty', 0, 1000)}${button('abilityRoll')}${field('rankDice', 1, 3)}${field('rankModifier', -1000, 1000)}${button('rankRoll')}</details></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details><div class="bsim-log" id="${ID}-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    el('context').innerHTML = `<option value="-1">${escape(t('battlesim.editor.custom'))}</option>`
      + fights.map((spec, index) => `<option value="${index}">${escape(encounterName(spec))} (${spec.section})</option>`).join('');
    opponents = createOpponentEditor({document, id: ID, t, isStatUnavailable: opponentStatUnavailable,
      fields: [{key: 'combat', label: tk('combat')}, {key: 'defence', label: tk('defence'), min: 1}, {key: 'stamina', label: tk('stamina'), min: 1}],
      presets: fights.flatMap(spec => spec.enemies.map(enemy => ({...enemy, displayName: enemyName(enemy.name)})))});
    el('context').closest('label').after(opponents.element);
    el('surrender').insertAdjacentHTML('afterend', button('flee'));
    el('flee').hidden = true;
    for (const key of extraFlags) el('apply').insertAdjacentHTML('beforebegin', checkbox(key));
    for (const option of encounterOptions) {
      el('start').insertAdjacentHTML('beforebegin', option.type==='checkbox' ? checkbox(option.key)
        : field(option.key,option.min??0,option.max??1000000).replace('<label ',`<label id="${ID}-${option.key}-row" `));
    }
    {
      el('step').parentElement.insertAdjacentHTML('beforebegin', `<label class="inv-edit-row" id="${ID}-target-row"><span class="inv-edit-label">${escape(tk('target'))}</span><select class="inv-edit-input" id="${ID}-target"></select></label>`);
    }
    const sea = document.createElement('details');
    sea.innerHTML = `<summary>${escape(tk('sea'))}</summary><label class="inv-edit-row"><span class="inv-edit-label">${escape(tk('seaContext'))}</span><select class="inv-edit-input" id="${ID}-seaContext">${Object.entries(seaChecks).map(([section, spec]) => `<option value="${section}">${escape(tk('seaKind.' + spec.kind))} (${section})</option>`).join('')}</select></label>${select('ship', ['barque', 'brigantine', 'galleon'])}${select('crew', ['poor', 'average', 'good', 'excellent'])}${checkbox('safetyFromStorms')}${button('seaRoll')}`;
    overlay.querySelector('.bsim-col-left').appendChild(sea);
    extension = extendPanel({el, tk, button, checkbox, select, field, number, action, report, active, overlay, render});
    const btn = document.createElement('button');
    btn.id = ID + '-btn'; btn.textContent = t('battlesim.title'); btn.style.display = 'none';
    getButtonRow().appendChild(btn); btn.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    registerShortcut({ button: btn, overlay, open, close });
    el('context').addEventListener('change', () => {
      const preset = fights[Number(el('context').value)];
      if (preset) opponents.set(preset.enemies.map(enemy => ({...enemy, displayName: enemyName(enemy.name)})));
      else if (opponents.snapshot().some(enemy => enemy.dynamic)) {
        opponents.set(opponents.snapshot().map(({dynamic, ...enemy}) => enemy));
      }
      contextChanged();
    });
    el('create').addEventListener('click', () => {
      const run = getRun(), original = data(), profession = el('profession').value;
      if (!supported(original) || active(original)) return;
      const update = () => {
        if (run !== getRun() || original !== data()) return;
        action(game => { game.character = createCharacter(profession); game.fight = null; game.log.push(tk('created')); });
      };
      if (original.character) showConfirm(tk('createConfirm'), update); else update();
    });
    el('apply').addEventListener('click', () => action(game => {
      if (active(game) || !game.character) return;
      const character = { ...game.character, ...Object.fromEntries(fields.map(key => [key, number(key)])),
        profession: el('profession').value, ...Object.fromEntries(characterFlags.map(key => [key, el(key).checked])) };
      validateCharacter(character); game.character = character; game.fight = null; game.log.push(tk('adjusted'));
    }));
    el('start').addEventListener('click', () => action(game => {
      if (active(game) || !game.character) return;
      const index = number('context'), enemies = opponents.read().map(enemy => ({...enemy,
        name: enemy.name || enemy.displayName || t('battlesim.default_enemy')}));
      const preset = fights[index];
      const spec = {...(preset ?? {custom: true, section: 0}), enemies};
      game.setup = { context: index, opponents: enemies, attackModifier: number('attackModifier'), applyEntry: el('applyEntry').checked };
      const extra = Object.fromEntries(encounterOptions.map(option => [option.key, option.sections.includes(spec.section)
        ? option.type==='checkbox' ? el(option.key).checked : number(option.key) : option.type==='checkbox' ? false : 0]));
      Object.assign(game.setup,extra);
      game.log.push(encounterName(spec));
      report(game, startFight(spec, game.character, { applyEntry: el('applyEntry').checked,
        defence: spec.unarmoured ? game.character.combat + game.character.rank + number('attackModifier') : undefined,
        attackModifier: number('attackModifier'), ratPoison: !!spec.ratPoison && el('ratPoisonUse').checked, ...extra }));
    }));
    el('step').addEventListener('click', () => action(game => {
      report(game, roundFight(game.fight, { combatBlessing: el('useCombatBlessing').checked,
        luckReroll: el('luckReroll').value || null,
        ...extension.roundOptions?.(),
        ...(game.fight.config.simultaneous ? {target:number('target')} : {}) }), game.fight.events.length);
    }));
    el('surrender').addEventListener('click', () => action(game => report(game, surrenderFabledFight(game.fight), game.fight.events.length)));
    el('flee').addEventListener('click', () => action(game => report(game, fleeFight(game.fight), game.fight.events.length)));
    el('cancel').addEventListener('click', () => {
      const run = getRun(), original = data();
      if (!supported(original) || !active(original)) return;
      showConfirm(tk('cancelConfirm'), () => {
        if (run !== getRun() || original !== data()) return;
        action(game => { game.fight = cancelFight(game.fight); game.log.push(tk('status.cancelled')); });
      });
    });
    for (const kind of ['ability', 'rank']) el(kind + 'Roll').addEventListener('click', () => action(game => {
      if (active(game)) return;
      const result = kind === 'ability' ? abilityCheck(game.character, el('ability').value, number('difficulty'), extension.abilityOptions?.())
        : fabledRankCheck(game.character, number('rankDice'), number('rankModifier'));
      if (result.character) { game.fight = null; game.character = result.character; }
      game.log.push(tk('checkResult', { total: result.total, result: tk(result.success ? 'success' : 'failure') }));
    }));
    el('seaRoll').addEventListener('click', () => action(game => {
      if (active(game)) return;
      const result = seaCheck(number('seaContext'), game.character, { ship: el('ship').value,
        crew: el('crew').value, safetyFromStorms: el('safetyFromStorms').checked, ...extension.seaOptions?.() });
      game.fight = null; game.character = result.character;
      if (result.crew) el('crew').value = result.crew;
      game.log.push(result.usedBlessing ? tk('stormBlessingUsed') : tk('seaResult', { total: result.total, damage: result.damage }));
      game.log.push(tk('destination', { section: result.destination }));
      if (['win', 'loss'].includes(result.status)) game.history.push({ enemy: tk('seaKind.' + (result.kind || 'naval')), outcome: result.status,
        ts: Math.max(Date.now(), (game.history.at(-1)?.ts ?? 0) + 1) });
    }));
  }
  return { init, render, setVisible(visible) {
    const btn = el('btn'); if (btn) btn.style.display = visible ? '' : 'none'; if (!visible) close();
  } };
}
