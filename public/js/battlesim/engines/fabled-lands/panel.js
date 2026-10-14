import { FABLED_ABILITIES, FABLED_PROFESSIONS, newFabledCharacter, validateFabledCharacter,
  fabledDefence, fabledAbilityCheck, fabledRankCheck } from './character.js';
import { startFabledFight, fabledRound, surrenderFabledFight, fleeFabledFight } from './core.js';
import { WAR_TORN_FIGHTS } from './roster.js';
import { FABLED_SEA_CHECKS, fabledSeaCheck } from './navigation.js';

const fields = [...FABLED_ABILITIES, 'rank', 'stamina', 'staminaInitial', 'armour', 'shards', 'ratPoison'];
const flags = ['combatBlessing', 'luckBlessing', 'stormsBlessing'];
const escape = value => String(value).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createFabledPanel({ document, t, getRun, getBookId, saveState,
  showAlert, showConfirm, getButtonRow, registerShortcut = () => {},
  bookId = 674, fights = WAR_TORN_FIGHTS, seaChecks = FABLED_SEA_CHECKS,
  seaCheck = fabledSeaCheck, characterDefaults = {} }) {
  const ID = 'sim' + bookId;
  const tk = (key, params) => t('battlesim' + bookId + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const active = game => game?.fight?.status === 'fighting';
  const supported = game => game && (!game.fight || game.fight.rulesRevision === 1);
  const enemyName = name => tk('enemy.' + name);
  const encounterName = spec => [...new Set(spec.enemies.map(enemy => enemyName(enemy.name)))].join(' / ')
    + (spec.enemies.length > 1 ? ` (${spec.enemies.length})` : '');
  let shownRun;
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
      if (event.kind === 'attack') game.log.push(tk('attack', { name: event.direction === 'player' ? tk('you') : enemyName(fight.enemies[fight.target].name),
        total: event.total, defence: event.defence, damage: event.damage }));
      else if (event.kind === 'entry') game.log.push(tk('entry', event));
      else if (event.kind === 'reroll') game.log.push(tk('reroll', { previous: event.previous }));
      else if (event.kind === 'ratPoison') game.log.push(tk('poisonUsed'));
    }
    if (fight.status !== 'fighting') {
      game.log.push(tk('status.' + fight.status));
      if (fight.destination) game.log.push(tk('destination', { section: fight.destination }));
      if (fight.wounded && fight.config.woundEffect && fight.status === 'win') game.log.push(tk('effect.' + fight.config.woundEffect));
    }
  }
  function contextChanged() {
    const game = data(), spec = fights[Number(el('context').value)];
    if (!game || !spec) return;
    el('applyEntry-row').hidden = !spec.entryDamage && !spec.entryDice;
    el('ratPoisonUse-row').hidden = !spec.ratPoison;
    const notes = [tk(spec.nonfatal ? 'duel' : 'sequential')];
    if (spec.threshold !== undefined) notes.push(tk('threshold', { stamina: spec.threshold, section: spec.win }));
    if (spec.attackModifier) notes.push(tk('penalty', { amount: spec.attackModifier }));
    if (bookId === 674 && spec.section === 121) notes.push(tk('underwater'));
    if (spec.woundEffect) notes.push(tk('effect.' + spec.woundEffect));
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
      el('context').value = String(game.setup.context ?? 0);
      el('attackModifier').value = String(game.setup.attackModifier ?? 0);
      el('applyEntry').checked = game.setup.applyEntry ?? true;
      el('ratPoisonUse').checked = false;
      el('difficulty').value = '10'; el('rankDice').value = '1'; el('rankModifier').value = '0';
    }
    const character = game.character, fight = game.fight, busy = active(game), blocked = busy || !supported(game);
    el('characterStatus').textContent = !supported(game) ? tk('unsupported') : character ? tk('characterStatus', { ...character, defence: fabledDefence(character) }) : tk('ready');
    for (const key of fields) {
      if (document.activeElement !== el(key)) el(key).value = character?.[key] ?? '';
      el(key).disabled = blocked || !character;
    }
    for (const key of flags) { el(key).checked = character?.[key] ?? false; el(key).disabled = blocked || !character; }
    if (character) el('profession').value = character.profession;
    el('profession').disabled = blocked;
    for (const key of ['create', 'context', 'applyEntry', 'ratPoisonUse', 'attackModifier']) el(key).disabled = blocked;
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
    el('safetyFromStorms').disabled = !character?.stormsBlessing;
    if (el('safetyFromStorms').disabled) el('safetyFromStorms').checked = false;
    el('status').textContent = fight ? [tk('status.' + fight.status), tk('rounds', { count: fight.rounds }),
      ...fight.enemies.map(foe => `${enemyName(foe.name)}: ${tk('combat')} ${foe.combat}, ${tk('defence')} ${foe.defence}, ${tk('stamina')} ${foe.stamina}`),
      ...(fight.destination ? [tk('destination', { section: fight.destination })] : [])].join('\n') : '';
    el('history').innerHTML = game.history.slice(-30).reverse().map(item => `<div>${escape(item.enemy)} - ${escape(tk('status.' + item.outcome))}</div>`).join('');
    el('log').innerHTML = game.log.map(line => `<div>${escape(line)}</div>`).join('');
    el('log').scrollTop = el('log').scrollHeight;
    contextChanged();
  }
  const field = (key, min = 0, max = 1000000) => `<label class="inv-edit-row"><span class="inv-edit-label">${escape(tk(key))}</span><input class="inv-edit-input" type="number" min="${min}" max="${max}" step="1" id="${ID}-${key}"></label>`;
  const checkbox = key => `<label class="bsim-checkbox" id="${ID}-${key}-row"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  const button = key => `<button class="bsim-action-btn" type="button" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const select = (key, values) => `<label class="inv-edit-row"><span class="inv-edit-label">${escape(tk(key))}</span><select class="inv-edit-input" id="${ID}-${key}">${values.map(value => `<option value="${escape(value)}">${escape(tk(key + '.' + value))}</option>`).join('')}</select></label>`;
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(tk('title'))}</span><button class="inv-close-btn" type="button" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-status" id="${ID}-characterStatus"></div>${select('profession', Object.keys(FABLED_PROFESSIONS))}${button('create')}<details><summary>${escape(tk('character'))}</summary>${fields.map(key => field(key, FABLED_ABILITIES.includes(key) || ['rank', 'staminaInitial'].includes(key) ? 1 : 0)).join('')}${flags.map(checkbox).join('')}${button('apply')}</details><label class="inv-edit-row"><span class="inv-edit-label">${escape(tk('context'))}</span><select class="inv-edit-input" id="${ID}-context">${WAR_TORN_FIGHTS.map((spec, index) => `<option value="${index}">${escape(encounterName(spec))} (${spec.section})</option>`).join('')}</select></label>${checkbox('applyEntry')}${checkbox('ratPoisonUse')}<details><summary>${escape(tk('overrides'))}</summary>${field('attackModifier', -1000, 1000)}<p>${escape(tk('overrideNote'))}</p></details><p class="bsim-status" id="${ID}-contextNote"></p>${button('start')}<div class="bsim-status" id="${ID}-status"></div>${checkbox('useCombatBlessing')}${select('luckReroll', ['', 'player', 'enemy'])}<div class="bsim-btn-row">${button('step')}${button('surrender')}${button('cancel')}</div><details><summary>${escape(tk('checks'))}</summary>${select('ability', FABLED_ABILITIES)}${field('difficulty', 0, 1000)}${button('abilityRoll')}${field('rankDice', 1, 3)}${field('rankModifier', -1000, 1000)}${button('rankRoll')}</details></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details><div class="bsim-log" id="${ID}-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    el('context').innerHTML = fights.map((spec, index) => `<option value="${index}">${escape(encounterName(spec))} (${spec.section})</option>`).join('');
    el('surrender').insertAdjacentHTML('afterend', button('flee'));
    el('flee').hidden = true;
    const sea = document.createElement('details');
    sea.innerHTML = `<summary>${escape(tk('sea'))}</summary><label class="inv-edit-row"><span class="inv-edit-label">${escape(tk('seaContext'))}</span><select class="inv-edit-input" id="${ID}-seaContext">${Object.entries(seaChecks).map(([section, spec]) => `<option value="${section}">${escape(tk('seaKind.' + spec.kind))} (${section})</option>`).join('')}</select></label>${select('ship', ['barque', 'brigantine', 'galleon'])}${select('crew', ['poor', 'average', 'good', 'excellent'])}${checkbox('safetyFromStorms')}${button('seaRoll')}`;
    overlay.querySelector('.bsim-col-left').appendChild(sea);
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
    el('create').addEventListener('click', () => {
      const run = getRun(), original = data(), profession = el('profession').value;
      if (!supported(original) || active(original)) return;
      const update = () => {
        if (run !== getRun() || original !== data()) return;
        action(game => { game.character = newFabledCharacter(profession, characterDefaults); game.fight = null; game.log.push(tk('created')); });
      };
      if (original.character) showConfirm(tk('createConfirm'), update); else update();
    });
    el('apply').addEventListener('click', () => action(game => {
      if (active(game) || !game.character) return;
      const character = { ...game.character, ...Object.fromEntries(fields.map(key => [key, number(key)])),
        profession: el('profession').value, ...Object.fromEntries(flags.map(key => [key, el(key).checked])) };
      validateFabledCharacter(character); game.character = character; game.fight = null; game.log.push(tk('adjusted'));
    }));
    el('start').addEventListener('click', () => action(game => {
      if (active(game) || !game.character) return;
      const index = number('context'), spec = fights[index];
      if (!spec) throw new RangeError('Invalid encounter');
      game.setup = { context: index, attackModifier: number('attackModifier'), applyEntry: el('applyEntry').checked };
      game.log.push(encounterName(spec));
      report(game, startFabledFight(spec, game.character, { applyEntry: el('applyEntry').checked,
        defence: spec.unarmoured ? game.character.combat + game.character.rank + number('attackModifier') : undefined,
        attackModifier: number('attackModifier'), ratPoison: !!spec.ratPoison && el('ratPoisonUse').checked }));
    }));
    el('step').addEventListener('click', () => action(game => {
      report(game, fabledRound(game.fight, { combatBlessing: el('useCombatBlessing').checked,
        luckReroll: el('luckReroll').value || null }), game.fight.events.length);
    }));
    el('surrender').addEventListener('click', () => action(game => report(game, surrenderFabledFight(game.fight), game.fight.events.length)));
    el('flee').addEventListener('click', () => action(game => report(game, fleeFabledFight(game.fight), game.fight.events.length)));
    el('cancel').addEventListener('click', () => {
      const run = getRun(), original = data();
      if (!supported(original) || !active(original)) return;
      showConfirm(tk('cancelConfirm'), () => {
        if (run !== getRun() || original !== data()) return;
        action(game => { game.fight.status = 'cancelled'; game.log.push(tk('status.cancelled')); });
      });
    });
    for (const kind of ['ability', 'rank']) el(kind + 'Roll').addEventListener('click', () => action(game => {
      if (active(game)) return;
      const result = kind === 'ability' ? fabledAbilityCheck(game.character, el('ability').value, number('difficulty'))
        : fabledRankCheck(game.character, number('rankDice'), number('rankModifier'));
      game.log.push(tk('checkResult', { total: result.total, result: tk(result.success ? 'success' : 'failure') }));
    }));
    el('seaRoll').addEventListener('click', () => action(game => {
      if (active(game)) return;
      const result = seaCheck(number('seaContext'), game.character, { ship: el('ship').value,
        crew: el('crew').value, safetyFromStorms: el('safetyFromStorms').checked });
      game.fight = null; game.character = result.character;
      game.log.push(result.usedBlessing ? tk('stormBlessingUsed') : tk('seaResult', { total: result.total, damage: result.damage }));
      game.log.push(tk('destination', { section: result.destination }));
      if (['win', 'loss'].includes(result.status)) game.history.push({ enemy: tk('seaKind.naval'), outcome: result.status,
        ts: Math.max(Date.now(), (game.history.at(-1)?.ts ?? 0) + 1) });
    }));
  }
  return { init, render, setVisible(visible) {
    const btn = el('btn'); if (btn) btn.style.display = visible ? '' : 'none'; if (!visible) close();
  } };
}
