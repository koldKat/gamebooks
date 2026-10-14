import { newSamuraiCharacter, validateSamuraiCharacter, eatSamuraiMeal, drinkSamuraiPotion,
  SAMURAI_ARTS, SAMURAI_ARROW_DAMAGE } from './character.js';
import { startSamuraiFight, samuraiRound, resolveSamuraiAction, setSamuraiTarget } from './core.js';
import { SAMURAI_FIGHTS } from './roster.js';

const ID = 'sim672';
const stats = ['skill', 'skillInitial', 'stamina', 'staminaInitial', 'luck', 'luckInitial', 'honour', 'provisions', 'swords'];
const arrows = Object.keys(SAMURAI_ARROW_DAMAGE);
const setupFields = ['context', 'playerModifier', 'enemyModifier', 'incomingDamage', 'arrowType', 'arrowCount', 'continuationStamina', 'charcoalTiming'];
const setupFlags = ['applyEntry', 'acrobatics', 'iaijutsuUsed', 'recover'];
const escape = value => String(value).replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

export function createSamuraiPanel({ document, t, getRun, getBookId, saveState,
  showAlert, showConfirm, getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, params) => t('battlesim672.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const active = game => game?.fight?.status === 'fighting';
  const carried = game => game?.fight?.status === 'story' && game.fight.config.section === 82 && game.fight.destination === 32;
  const supported = game => game && (!game.fight || game.fight.rulesRevision === 1);
  let shownRun;
  function data() {
    if (Number(getBookId()) !== 672) return null;
    const run = getRun();
    return run ? run[ID] ||= { character: null, fight: null, history: [], log: [], setup: {} } : null;
  }
  function close() { el('overlay')?.classList.remove('active'); }
  function open() {
    if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    render(); el('overlay').classList.add('active'); el('close').focus();
  }
  function number(key, optional = false) {
    const value = el(key).value.trim();
    if (!value && optional) return null;
    if (!value || !Number.isSafeInteger(Number(value))) throw new RangeError('Invalid input');
    return Number(value);
  }
  function action(update) {
    const run = getRun(), original = data();
    if (!supported(original)) return;
    try {
      const next = structuredClone(original);
      update(next);
      if (run !== getRun() || Number(getBookId()) !== 672 || original !== data()) return;
      if (next.fight) next.character = structuredClone(next.fight.character);
      const fight = next.fight;
      if (fight && !fight.recorded && ['win', 'loss'].includes(fight.status)) {
        fight.recorded = true;
        next.history.push({ enemy: encounterName(fight.config), outcome: fight.status,
          ts: Math.max(Date.now(), (next.history.at(-1)?.ts ?? 0) + 1) });
      }
      next.log = next.log.slice(-100);
      run[ID] = next; saveState(); render();
    } catch (_) { showAlert(tk('invalid')); }
  }
  function encounterName(spec) {
    return [...new Set(spec.enemies.map(enemy => tk('enemy.' + enemy.name)))].join(' / ')
      + (spec.copies || spec.enemies.length > 1 ? ` ×${spec.copies || spec.enemies.length}` : '')
      + (spec.continuation ? ' — ' + tk('continuation') : '');
  }
  function report(game, fight) {
    game.fight = fight;
    for (const event of fight.events) {
      const name = Number.isSafeInteger(event.enemy) ? tk('enemy.' + fight.enemies[event.enemy].name) : '';
      if (event.kind === 'attack') game.log.push(tk('attackRoll', { name, player: event.playerAttack, opponent: event.enemyAttack }));
      else if (event.kind === 'damage') game.log.push(tk('damage', { name: event.direction === 'outgoing' ? name : tk('you'), amount: event.amount }));
      else if (event.kind === 'luck') game.log.push(tk('luckRoll', { roll: event.total, result: tk(event.lucky ? 'lucky' : 'unlucky') }));
      else if (event.kind === 'entry') game.log.push(tk('entryCost') + ' ' + Object.entries(event.changes).map(([stat, value]) => `${tk(stat)} ${value}`).join(', '));
      else if (event.kind === 'arrow') game.log.push(tk('arrowRoll', { type: tk('arrowType.' + event.type), roll: event.total, damage: event.damage }));
      else if (event.kind === 'spell') game.log.push(tk('spellRoll', { roll: event.total, stat: tk(event.stat), amount: event.amount, section: event.section }));
      else if (event.kind === 'beam') game.log.push(tk('beamRoll', { roll: event.total, amount: event.amount }));
      else if (event.kind === 'runeLoss') game.log.push(tk('runeLoss'));
      else if (event.kind === 'carriedWounds') game.log.push(tk('carriedWounds', event));
      else if (event.kind === 'iaijutsu') game.log.push(tk('iaijutsuStrike', { name }));
      else if (event.kind === 'nito') game.log.push(tk('nitoRoll', event));
      else if (event.kind === 'rest') game.log.push(tk('rested', event));
      else if (event.kind === 'spearDefence') game.log.push(tk('spearRoll', { roll: event.total, result: tk(event.defended ? 'defended' : 'wounded') }));
      else if (['phantom', 'flame', 'runeRoll'].includes(event.kind)) game.log.push(tk('specialRoll', { kind: tk('event.' + event.kind), roll: event.total }));
      else if (event.kind === 'runeEquality') game.log.push(tk(event.applyLoss ? 'runeLoss' : 'runeContinue'));
    }
    if (fight.status !== 'fighting') game.log.push(tk('status.' + fight.status));
    if (fight.destination) game.log.push(tk('destination', { section: fight.destination }));
    if (carried(game)) el('context').value = '32';
  }
  function contextChanged() {
    const game = data(), spec = SAMURAI_FIGHTS.find(item => item.section === Number(el('context').value));
    if (!spec) return;
    for (const [key, visible] of Object.entries({ arrowType: !!spec.preArrowMax && !spec.preArrowType,
      arrowCount: !!spec.preArrowMax, continuationStamina: !!spec.continuation && !carried(game),
      acrobatics: !!spec.acrobatics, charcoalTiming: [93, 307].includes(spec.section), recover: !!spec.entryRecovery,
      applyEntry: !!(spec.entry || spec.entryDefence || spec.unarmed || spec.entryRecovery) })) {
      el(key + '-row').hidden = !visible;
    }
    el('arrowCount').max = String(spec.preArrowMax || 0);
    el('incomingDamage-row').hidden = spec.incoming === 'phoenix';
    const notes = [tk(spec.mode === 'simultaneous' ? 'simultaneous' : 'sequential')];
    if (spec.deadline) notes.push(tk('deadline', { rounds: spec.deadline.rounds }));
    if (spec.threshold) notes.push(tk('threshold', { stamina: spec.threshold.stamina, section: spec.threshold.section }));
    if (spec.hitExit) notes.push(tk('hitExit', spec.hitExit));
    for (const key of ['curse', 'critical', 'swordRunes', 'enemySpells', 'periodicBeam', 'outgoing', 'firstKill', 'defenceAttacks', 'unarmed']) {
      if (spec[key]) notes.push(tk('rule.' + (key === 'outgoing' ? spec[key] : key)));
    }
    if (spec.skillModifier) notes.push(tk('skillPenalty', { modifier: spec.skillModifier }));
    el('contextNote').textContent = notes.join('\n');
    el('start').disabled = !supported(game) || active(game) || !game.character?.stamina || !game.character?.honour
      || carried(game) && spec.section !== 32;
  }
  function render() {
    if (!el('overlay')) return;
    const game = data();
    if (!game) { shownRun = undefined; close(); return; }
    if (shownRun !== getRun()) {
      if (shownRun) close();
      shownRun = getRun();
      const defaults = { context: carried(game) ? 32 : 13, playerModifier: 0, enemyModifier: 0, incomingDamage: '',
        arrowType: 'leaf', arrowCount: 0, continuationStamina: '', charcoalTiming: 'firstKill' };
      for (const key of setupFields) el(key).value = String(game.setup[key] ?? defaults[key]);
      for (const key of setupFlags) el(key).checked = game.setup[key] ?? key !== 'iaijutsuUsed';
    }
    const fight = game.fight, character = game.character, busy = active(game), blocked = busy || carried(game) || !supported(game);
    el('characterStatus').textContent = !supported(game) ? tk('unsupported') : character ? tk('characterStatus', character) : tk('ready');
    for (const key of stats) {
      if (document.activeElement !== el(key)) el(key).value = character?.[key] ?? '';
      el(key).disabled = blocked || !character;
    }
    for (const type of arrows) {
      if (document.activeElement !== el('arrow-' + type)) el('arrow-' + type).value = character?.arrows[type] ?? '';
      el('arrow-' + type).disabled = blocked || !character;
    }
    for (const key of ['bow', 'potionUsed']) { el(key).checked = character?.[key] ?? false; el(key).disabled = blocked || !character; }
    for (const key of ['art', 'potion']) {
      if (character) el(key).value = character[key];
      el(key).disabled = blocked;
    }
    for (const key of ['roll', 'apply']) el(key).disabled = blocked || key === 'apply' && !character;
    for (const key of [...setupFields, ...setupFlags]) el(key).disabled = busy || !supported(game);
    el('meal').disabled = blocked || !character?.stamina || !character.honour || !character.provisions || character.stamina >= character.staminaInitial;
    el('drink').disabled = blocked || !character?.stamina || !character.honour || character.potionUsed;
    el('step').disabled = !supported(game) || !busy || !!fight.pending;
    el('cancel').disabled = !supported(game) || !(busy || carried(game));
    const pending = busy && fight.pending;
    el('pending-row').hidden = !pending;
    el('pending').textContent = pending ? tk('pending.' + pending.kind) : '';
    el('yes').textContent = pending ? tk('yes.' + pending.kind) : '';
    el('no').textContent = pending ? tk('no.' + pending.kind) : '';
    el('no').hidden = !!pending && ['curse', 'critical'].includes(pending.kind);
    el('yes').disabled = el('no').disabled = !supported(game) || !pending;
    const groupSize = fight?.config.mode === 'sequential' ? 1 : fight?.config.groupSize || fight?.enemies.length || 0;
    const targets = fight?.enemies.map((foe, index) => ({ foe, index })).filter(({ foe, index }) =>
      foe.stamina > 0 && index >= fight.groupStart && index < fight.groupStart + groupSize) || [];
    el('target-row').hidden = !busy || targets.length < 2;
    el('target').innerHTML = targets.map(({ foe, index }) => `<option value="${index}">${escape(tk('enemy.' + foe.name))} (${index + 1})</option>`).join('');
    el('target').value = String(fight?.target ?? 0); el('target').disabled = !supported(game) || !busy || !!pending;
    el('status').textContent = fight ? [tk('status.' + fight.status), tk('roundCount', { rounds: fight.rounds }),
      ...fight.enemies.map((foe, index) => `${index + 1}. ${tk('enemy.' + foe.name)}: ${tk('skill')} ${foe.skill}, ${tk('stamina')} ${foe.stamina}/${foe.staminaInitial}`),
      ...(fight.destination ? [tk('destination', { section: fight.destination })] : [])].join('\n') : '';
    el('history').innerHTML = game.history.slice(-30).reverse().map(item => `<div>${escape(item.enemy)} — ${escape(tk('status.' + item.outcome))}</div>`).join('');
    el('log').innerHTML = game.log.map(line => `<div>${escape(line)}</div>`).join('');
    el('log').scrollTop = el('log').scrollHeight;
    contextChanged();
  }
  const field = (key, min = 0, max = 10000, label = key) => `<label class="inv-edit-row" id="${ID}-${key}-row"><span class="inv-edit-label">${escape(tk(label))}</span><input class="inv-edit-input" type="number" min="${min}" max="${max}" step="1" id="${ID}-${key}"></label>`;
  const checkbox = key => `<label class="bsim-checkbox" id="${ID}-${key}-row"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  const button = key => `<button class="bsim-action-btn" type="button" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const select = (key, values) => `<label class="inv-edit-row" id="${ID}-${key}-row"><span class="inv-edit-label">${escape(tk(key))}</span><select class="inv-edit-input" id="${ID}-${key}">${values.map(value => `<option value="${value}">${escape(tk(key + '.' + value))}</option>`).join('')}</select></label>`;
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(tk('title'))}</span><button class="inv-close-btn" type="button" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-status" id="${ID}-characterStatus"></div>${select('art', SAMURAI_ARTS)}${select('potion', ['skill', 'stamina', 'luck'])}${button('roll')}<details><summary>${escape(tk('character'))}</summary>${stats.map(key => field(key, key.endsWith('Initial') ? 1 : 0, key === 'swords' ? 2 : 10000)).join('')}${arrows.map(type => field('arrow-' + type, 0, 10000, 'arrowType.' + type)).join('')}${checkbox('bow')}${checkbox('potionUsed')}${button('apply')}</details><div class="bsim-btn-row">${button('meal')}${button('drink')}</div><label class="inv-edit-row"><span class="inv-edit-label">${escape(tk('context'))}</span><select class="inv-edit-input" id="${ID}-context">${[...SAMURAI_FIGHTS].sort((a, b) => a.section - b.section).map(spec => `<option value="${spec.section}">${escape(encounterName(spec))} (${spec.section})</option>`).join('')}</select></label>${checkbox('applyEntry')}${select('arrowType', arrows)}${field('arrowCount', 0, 3)}${field('continuationStamina', 1, 5)}${checkbox('acrobatics')}${checkbox('iaijutsuUsed')}${checkbox('recover')}${select('charcoalTiming', ['firstKill', 'firstWound'])}<details><summary>${escape(tk('overrides'))}</summary>${field('playerModifier', -1000, 1000)}${field('enemyModifier', -1000, 1000)}${field('incomingDamage')}<p>${escape(tk('overrideNote'))}</p></details><p class="bsim-status" id="${ID}-contextNote"></p>${button('start')}<div class="bsim-status" id="${ID}-status"></div><label class="inv-edit-row" id="${ID}-target-row"><span class="inv-edit-label">${escape(tk('target'))}</span><select class="inv-edit-input" id="${ID}-target"></select></label><div class="bsim-btn-row">${button('step')}${button('cancel')}</div><div id="${ID}-pending-row"><p id="${ID}-pending"></p><div class="bsim-btn-row">${button('yes')}${button('no')}</div></div></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details><div class="bsim-log" id="${ID}-log"></div></div></div></div>`;
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
      const run = getRun(), original = data(), art = el('art').value, potion = el('potion').value;
      if (!supported(original) || active(original) || carried(original)) return;
      const update = () => {
        if (run !== getRun() || original !== data()) return;
        action(game => { game.character = newSamuraiCharacter({ art, potion }); game.fight = null; game.log.push(tk('rolled')); });
      };
      if (original.character) showConfirm(tk('rollConfirm'), update); else update();
    });
    el('apply').addEventListener('click', () => action(game => {
      if (active(game) || carried(game) || !game.character) return;
      const character = { ...game.character, ...Object.fromEntries(stats.map(key => [key, number(key)])),
        art: el('art').value, potion: el('potion').value, bow: el('bow').checked, potionUsed: el('potionUsed').checked,
        arrows: Object.fromEntries(arrows.map(type => [type, number('arrow-' + type)])) };
      validateSamuraiCharacter(character); game.character = character; game.fight = null; game.log.push(tk('adjusted'));
    }));
    el('start').addEventListener('click', () => action(game => {
      if (active(game) || !game.character) return;
      const section = number('context'), spec = SAMURAI_FIGHTS.find(item => item.section === section);
      if (!spec || carried(game) && section !== 32) throw new RangeError('Finish the continued encounter');
      game.setup = Object.fromEntries(setupFields.map(key => [key, el(key).value]));
      for (const key of setupFlags) game.setup[key] = el(key).checked;
      const arrowCount = spec.preArrowMax ? number('arrowCount') : 0;
      if (arrowCount < 0 || arrowCount > (spec.preArrowMax || 0)) throw new RangeError('Invalid arrow count');
      game.log.push(encounterName(spec));
      report(game, startSamuraiFight(section, game.character, { ...Object.fromEntries(setupFlags.map(key => [key, el(key).checked])),
        playerModifier: number('playerModifier'), enemyModifier: number('enemyModifier'),
        incomingDamage: spec.incoming === 'phoenix' ? null : number('incomingDamage', true),
        charcoalTiming: [93, 307].includes(section) ? el('charcoalTiming').value : 'firstKill',
        preArrows: Array(arrowCount).fill(spec.preArrowType || el('arrowType').value),
        carryFrom: spec.continuation && carried(game) ? game.fight : null,
        continuationStamina: spec.continuation && !carried(game) ? number('continuationStamina') : null }));
    }));
    el('step').addEventListener('click', () => action(game => report(game, samuraiRound(game.fight))));
    el('target').addEventListener('change', () => action(game => { game.fight = setSamuraiTarget(game.fight, number('target')); }));
    for (const [key, choice] of [['yes', true], ['no', false]]) el(key).addEventListener('click', () => action(game => report(game, resolveSamuraiAction(game.fight, choice))));
    for (const [key, recover] of [['meal', eatSamuraiMeal], ['drink', drinkSamuraiPotion]]) {
      el(key).addEventListener('click', () => action(game => {
        if (active(game) || carried(game)) return;
        game.character = recover(game.character); game.fight = null; game.log.push(tk(key + 'Used'));
      }));
    }
    el('cancel').addEventListener('click', () => {
      const run = getRun(), original = data();
      if (!supported(original) || !(active(original) || carried(original))) return;
      showConfirm(tk('cancelConfirm'), () => {
        if (run !== getRun() || original !== data()) return;
        action(game => { game.fight.status = 'cancelled'; game.fight.pending = null; game.fight.queue = []; game.log.push(tk('status.cancelled')); });
      });
    });
  }
  return { init, render, setVisible(visible) {
    const btn = el('btn'); if (btn) btn.style.display = visible ? '' : 'none'; if (!visible) close();
  } };
}
