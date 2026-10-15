import { definition, ENCOUNTERS } from './definition.js';
import * as rules from './combat.js';
import * as effects from './effects.js';
import { createState } from './state.js';
import { currentBookId, currentPlaythrough, saveState } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';

const ID = definition.stateKey;
const STATS = ['skill', 'skillInitial', 'stamina', 'staminaInitial', 'luck', 'luckInitial', 'gold', 'provisions'];
const RESOURCES = ['attackModifier', 'nextFightSkill', 'mealsToday', 'goblinTeeth', 'giantTeeth', 'pebbles', 'medicines', 'silverArrows', 'explosiveDarts', 'cakeHalves', 'predictionBets'];
const FLAGS = ['libraUsed', 'libraChampion', 'luckCharm', 'luckRollCharm', 'wax', 'sunJewel', 'boneBracelet', 'helpfulGlove', 'cursedGlove', 'magicChain', 'intoxicated', 'noEatingToday'];
const SIGNED = new Set(['attackModifier', 'nextFightSkill']);
const active = fight => Boolean(fight && !fight.outcome);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createKharePanel({ document, t, getRun, getBookId, saveState, showAlert, showConfirm,
  getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, params) => t(definition.i18nPrefix + '.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({ currentBookId: getBookId(), currentPlaythrough: getRun, saveState }));
  let shownRun, rendered;
  const button = key => `<button type="button" class="inv-add-btn bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const checkbox = key => `<label class="bsim-checkbox" id="${ID}-${key}-row"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  const input = (key, min = SIGNED.has(key) ? -1000 : key.endsWith('Initial') ? 1 : 0, max = ({ silverArrows: 10, explosiveDarts: 2, cakeHalves: 2, predictionBets: 5 })[key] ?? (SIGNED.has(key) ? 1000 : 10000), optional = false) => `<label class="inv-edit-row" id="${ID}-${key}-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="${max}" step="1"${optional ? '' : ' required'}></label>`;
  const select = (key, values) => `<label class="inv-edit-row" id="${ID}-${key}-row"><span>${escape(tk(key))}</span><select class="inv-edit-input" id="${ID}-${key}">${values.map(([value, label]) => `<option value="${value}">${escape(tk(label))}</option>`).join('')}</select></label>`;
  const sourceName = ref => ref.team === 'player' ? tk('you') : tk('enemy.' + (ref.team === 'enemy' ? store.read().fight.enemies : store.read().fight.allies)[ref.index].key);
  function number(key, optional = false) {
    const field = el(key), raw = field.value.trim(), value = Number(raw);
    if (!raw && optional) return undefined;
    if (!raw || !Number.isSafeInteger(value) || value < Number(field.min) || value > Number(field.max)) {
      field.closest('details')?.setAttribute('open', ''); field.focus(); throw new RangeError('Invalid field');
    }
    return value;
  }
  function selected() { return ENCOUNTERS.find(item => item.section === Number(el('encounter').value)); }
  const setupKeys = ['encounter', 'target', 'champion', 'ally', 'favoured', 'summonCount', 'beggarStamina', 'confuse', 'enemyVictim', 'limbSpell', 'chainFirst', 'chainSecond', 'exit', 'chosen', 'excluded', 'betFighter', 'stake'];
  function setup() {
    return { ...Object.fromEntries(setupKeys.map(key => [key, el(key).value])), predictionCake: el('predictionCake').checked,
      enemyStamina: [...el('enemyOverrides').querySelectorAll('input')].map(field => field.value),
      goblinTargets: [...el('goblinTargets').querySelectorAll('select')].map(field => field.value) };
  }
  function character() {
    const result = { ...store.read()?.character, ...Object.fromEntries([...STATS, ...RESOURCES].map(key => [key, number(key)])) };
    for (const key of FLAGS) result[key] = el(key).checked;
    result.role = el('role').value; result.weapon = el('weapon').value;
    result.afflictions = result.afflictions ?? [];
    result.dead = !result.stamina;
    return rules.validateCharacter(result);
  }
  function close() { el('overlay')?.classList.remove('active'); rendered = null; }
  function change(update) {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) { close(); return; }
    try { if (store.change(data => { data.setup = setup(); update(data); })) render(true); }
    catch { showAlert(tk('invalid')); }
  }
  function confirmed(message, update) {
    const run = getRun(), before = store.read();
    showConfirm(tk(message), () => { if (getRun() === run && store.read() === before && Number(getBookId()) === definition.id) change(update); });
  }
  function report(data, fight) {
    const previous = data.fight;
    data.fight = fight; data.character = structuredClone(fight.player);
    const name = ref => ref.team === 'player' ? tk('you') : tk('enemy.' + (ref.team === 'enemy' ? fight.enemies : fight.allies)[ref.index].key);
    for (const event of fight.events) {
      if (event.kind === 'damage') data.log.push(tk('damage', { target: name(event.target), damage: event.damage }));
      else if (event.kind === 'attack') data.log.push(tk('attack', { ...event, enemy: tk('enemy.' + fight.enemies[event.enemy].key) }));
      else if (event.kind === 'actorAttack') data.log.push(tk('actorAttack', { ...event, a: name(event.a), b: name(event.b) }));
      else if (event.kind === 'harpyAttack') data.log.push(tk('harpyAttack', { ...event, enemy: tk('enemy.' + fight.enemies[event.enemy].key), victim: name(event.victim) }));
      else if (event.kind === 'allianceAttack') data.log.push(tk('allianceAttack', event));
      else if (event.kind === 'goblinAttack') data.log.push(tk('goblinAttack', { ...event, enemy: tk('enemy.' + fight.enemies[event.enemy].key) }));
      else if (event.kind === 'luck') data.log.push(tk('luckResult', { roll: event.cake ? tk('cake') : event.effective, result: tk(event.lucky ? 'lucky' : 'unlucky') }));
      else if (['silverArrow', 'pebble', 'dart'].includes(event.kind)) data.log.push(tk('projectile', { item: tk(event.kind), roll: event.roll, result: tk(event.hit ? 'hit' : 'miss') }));
      else if (event.kind === 'entry' || event.kind === 'spell') data.log.push(tk('entry', { cost: event.cost, damage: event.damage }));
      else if (event.kind === 'intoxicated') data.log.push(tk('intoxicatedRoll', { actor: name(event.actor), roll: event.roll }));
      else if (event.kind === 'openingArrow' || event.kind === 'clumsy') data.log.push(tk('rollResult', { action: tk(event.kind), roll: event.roll }));
      else if (['splitCorpse', 'giantDefeated', 'reinforcement', 'illusionMiss', 'disabledTarget', 'libraChampion', 'bound', 'confusedHarpy', 'glove'].includes(event.kind)) data.log.push(tk('event.' + event.kind));
    }
    if (fight.noticeDestination && fight.noticeDestination !== previous?.noticeDestination) data.log.push(tk('destination', { section: fight.noticeDestination }));
    if (fight.outcome && !previous?.outcome) data.log.push(tk('status.' + fight.outcome));
    if (fight.destination && fight.destination !== previous?.destination) data.log.push(tk('destination', { section: fight.destination }));
    if (fight.winner && data.ticket && !data.ticket.settled) {
      const result = effects.settleBet(data.character, data.ticket, fight.winner);
      data.character = result.character; data.ticket = result.ticket;
      data.fight.player = structuredClone(data.character);
      data.log.push(tk('betResult', { result: tk(result.won ? 'won' : 'lost'), profit: result.profit }));
    }
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (Number(getBookId()) !== definition.id || !getRun() || getRun() !== shownRun) { close(); return; }
    const data = store.read();
    if (!data || !force && data === rendered) return;
    rendered = data;
    const hero = data.character, fight = data.fight, busy = active(fight), pending = !!fight?.pending.length, decision = fight?.decision;
    const dead = !hero || hero.dead || !hero.stamina, ready = busy && !pending && !decision;
    for (const key of [...STATS, ...RESOURCES]) { el(key).value = hero?.[key] ?? ''; el(key).disabled = busy; }
    for (const key of FLAGS) { el(key).checked = hero?.[key] ?? false; el(key).disabled = busy; }
    el('role').value = hero?.role ?? 'warrior'; el('weapon').value = hero?.weapon ?? 'sword';
    el('role').disabled = busy; el('weapon').disabled = busy;
    const defaults = { encounter: '11', champion: 'ogre', ally: 'sprite', favoured: '0', summonCount: String(hero?.goblinTeeth ?? 0), beggarStamina: '8', confuse: 'skip', enemyVictim: 'player', limbSpell: '373', chainFirst: 'luck', chainSecond: 'luck', chosen: '1', betFighter: 'barbarian', stake: '1' };
    for (const key of setupKeys) el(key).value = data.setup[key] ?? defaults[key] ?? '';
    el('predictionCake').checked = data.setup.predictionCake ?? false;
    const config = selected(), mode = busy ? fight.config.mode : config.mode;
    let enemies = config.enemies;
    if (config.mode === 'champion') enemies = enemies.filter(enemy => enemy.key === el('champion').value);
    if (config.mode === 'street-alliance') enemies = enemies.filter(enemy => enemy.key !== el('ally').value);
    if (config.mode === 'double') enemies = [{ key: 'double', stamina: hero?.stamina ?? 1 }];
    el('enemyOverrides').innerHTML = enemies.map((enemy, index) => `<label class="inv-edit-row"><span>${escape(tk('enemy.' + enemy.key))}</span><input class="inv-edit-input" type="number" min="1" max="${enemy.stamina}" step="1" placeholder="${enemy.stamina}" value="${escape(data.setup.enemyStamina?.[index] ?? '')}"${busy ? ' disabled' : ''}></label>`).join('');
    for (const [key, visible] of [['champion', config.mode === 'champion'], ['ally', config.mode === 'street-alliance'], ['favoured', config.mode === 'spectator'], ['summonCount', config.summonGoblins], ['beggarStamina', config.mode === 'harpies'], ['confuse', config.confuseHarpy]]) {
      el(key + '-row').hidden = !visible; el(key).disabled = busy;
    }
    el('encounter').disabled = busy;
    for (const key of ['roll', 'apply']) el(key).disabled = busy;
    el('start').disabled = busy || dead || hero.role !== 'wizard' && Boolean(config.entryCost || config.summonGoblins);
    el('cancel').disabled = !busy;
    const encounterNote = 'note.encounter.' + (busy ? fight.config.section : config.section);
    const extraNote = tk(encounterNote);
    el('note').textContent = tk('note.' + (mode ?? 'standard'))
      + (extraNote === definition.i18nPrefix + '.' + encounterNote ? '' : '\n' + extraNote);
    const available = decision?.kind === 'target' ? decision.targets : rules.targets(fight);
    el('target').innerHTML = available.map(index => `<option value="${index}">${escape(tk('enemy.' + fight.enemies[index].key))}</option>`).join('');
    if (available.includes(Number(data.setup.target))) el('target').value = data.setup.target;
    el('target').disabled = !busy || pending || !!decision && decision.kind !== 'target' || available.length < 2;
    const goblins = busy && mode === 'harpies' ? fight.allies.slice(1) : [];
    el('goblinTargets').innerHTML = goblins.map((_, offset) => `<label class="inv-edit-row"><span>${escape(tk('goblinTarget', { n: offset + 1 }))}</span><select class="inv-edit-input"${ready ? '' : ' disabled'}>${available.map(index => `<option value="${index}"${String(index) === data.setup.goblinTargets?.[offset] ? ' selected' : ''}>${escape(tk('enemy.' + fight.enemies[index].key))}</option>`).join('')}</select></label>`).join('');
    el('enemyVictim-row').hidden = !busy || mode !== 'harpies' || available.length !== 1 || !fight.allies[0]?.stamina;
    el('enemyVictim').disabled = !ready;
    for (const key of ['round', 'dart', 'pebble', 'bind', 'limbCast']) el(key).disabled = !ready;
    el('dart').hidden = !busy || !hero.explosiveDarts || !!fight.rounds || mode === 'spectator' || fight.giantActive;
    el('pebble').hidden = !busy || !fight.pebbleWindow || !hero.pebbles;
    el('bind').hidden = !busy || !hero.magicChain || mode === 'spectator' || fight.giantActive;
    el('limbControls').hidden = !busy || mode !== 'limbs' || hero.role !== 'wizard';
    el('chooseTarget').hidden = decision?.kind !== 'target';
    for (const key of ['glove0', 'glove1', 'gloveKeep']) el(key).hidden = decision?.kind !== 'glove';
    if (decision?.kind === 'glove') for (const index of [0, 1]) el('glove' + index).textContent = tk('gloveDie', { n: index + 1, value: decision.dice[index] });
    const luckDecision = pending || decision?.kind === 'wraithLuck';
    for (const key of ['useLuck', 'useCake', 'skipLuck']) el(key).hidden = !luckDecision;
    el('useLuck').disabled = !hero?.luck; el('useCake').disabled = !hero?.cakeHalves;
    el('recover').hidden = fight?.outcome !== 'win' || !fight.chainUsed || fight.chainRecoveryAttempted;
    el('chainControls').hidden = el('recover').hidden;
    el('exitControls').hidden = fight?.outcome !== 'win' || !fight.config.alternateWins;
    if (!el('exitControls').hidden) el('exit').innerHTML = fight.config.alternateWins.map(n => `<option value="${n}">${escape(tk('destination', { section: n }))}</option>`).join('');
    const noRecovery = busy || dead;
    el('wheel').disabled = noRecovery || !hero.gold || hero.wheelWon;
    for (const key of ['eat', 'sharedMeal', 'nextDay', 'medicine', 'libraRestore', 'libraCure', 'libraBless', 'testLuck', 'testCake', 'herbs', 'prediction', 'placeBet']) el(key).disabled = noRecovery;
    if (!dead && busy && !pending && !decision) for (const key of ['libraRestore', 'libraCure']) el(key).disabled = hero.libraUsed;
    if (!noRecovery) {
      el('eat').disabled = el('sharedMeal').disabled = !hero.provisions || hero.noEatingToday;
      el('medicine').disabled = !hero.medicines || hero.role !== 'wizard';
      for (const key of ['libraRestore', 'libraCure', 'libraBless']) el(key).disabled = hero.libraUsed;
      el('testLuck').disabled = !hero.luck; el('testCake').disabled = !hero.cakeHalves;
      el('prediction').disabled = !hero.gold || hero.predictionBets >= 5;
      el('placeBet').disabled = !hero.gold || !!data.ticket && !data.ticket.settled;
    }
    const actors = fight ? [...fight.enemies.map(enemy => ({ ...enemy, team: 'enemy' })), ...fight.allies.map(ally => ({ ...ally, team: 'ally' }))] : [];
    el('opponents').innerHTML = actors.length ? `<table class="bsim-combat-table"><thead><tr><th>${escape(tk('opponents'))}</th><th>${escape(tk('skill'))}</th><th>${escape(tk('stamina'))}</th></tr></thead><tbody>${actors.map(actor => `<tr><td>${escape(tk('enemy.' + actor.key))}${actor.team === 'ally' ? ' · ' + escape(tk('allyLabel')) : ''}${actor.bound || actor.disabled ? ' · ' + escape(tk('disabled')) : ''}</td><td>${actor.skill}</td><td>${actor.stamina}/${actor.staminaInitial}</td></tr>`).join('')}</tbody></table>` : '';
    const status = [dead ? tk('dead') : tk('ready')];
    if (fight) {
      status.length = 0; status.push(tk('rounds', fight));
      if (fight.outcome) { status.push(tk('status.' + fight.outcome)); if (fight.destination) status.push(tk('destination', { section: fight.destination })); }
      else if (pending) status.push(tk('pending', { target: sourceName(fight.pending[0].target), damage: fight.pending[0].damage * (fight.pending[0].multiplier ?? 1) }));
      else if (decision) status.push(tk('decision.' + decision.kind));
    }
    el('status').textContent = status.join('\n');
    el('log').textContent = data.log.join('\n');
    el('history').textContent = data.history.slice(-30).reverse().map(item => item.enemy + ': ' + tk('status.' + item.outcome)).join('\n');
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    try { store.ensure(); shownRun = getRun(); el('overlay').classList.add('active'); render(true); el('close').focus(); }
    catch { close(); showAlert(tk('invalid')); }
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><details open><summary>${escape(tk('character'))}</summary>${select('role', [['warrior','warrior'],['wizard','wizard']])}${STATS.map(key => input(key)).join('')}<div class="bsim-btn-row">${button('roll')}${button('apply')}</div></details><details><summary>${escape(tk('equipment'))}</summary>${select('weapon', [['sword','sword'],['broadsword','broadsword'],['other','otherWeapon']])}${RESOURCES.map(key => input(key)).join('')}${FLAGS.map(checkbox).join('')}</details><details><summary>${escape(tk('recovery'))}</summary><p>${escape(tk('recoveryNote'))}</p><div class="bsim-btn-row">${['eat','sharedMeal','nextDay','medicine','libraRestore','libraCure','libraBless','testLuck','testCake','herbs'].map(button).join('')}</div></details><details><summary>${escape(tk('gambling'))}</summary>${input('chosen',1,6)}${input('excluded',1,6,true)}${checkbox('predictionCake')}<div class="bsim-btn-row">${button('prediction')}</div>${select('betFighter',[['barbarian','enemy.barbarian'],['ogre','enemy.ogre']])}${input('stake',1)}<div class="bsim-btn-row">${button('placeBet')}</div></details></div><div class="bsim-col bsim-col-right"><label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter">${ENCOUNTERS.map(item => `<option value="${item.section}">${escape(tk('encounter.'+item.section))} (${item.section})</option>`).join('')}</select></label><p class="bsim-status" id="${ID}-note"></p><details><summary>${escape(tk('fightSetup'))}</summary>${select('champion',[['ogre','enemy.ogre'],['barbarian','enemy.barbarian']])}${select('ally',[['sprite','enemy.sprite'],['pixie','enemy.pixie']])}${select('favoured',[['0','enemy.barbarian'],['1','enemy.ogre']])}${input('summonCount')}${input('beggarStamina',0,8)}${select('confuse',[['skip','skipConfusion'],['luck','useLuck'],['cake','useCake']])}<p>${escape(tk('overridesNote'))}</p><div id="${ID}-enemyOverrides"></div></details><div class="bsim-btn-row">${button('start')}${button('cancel')}</div><div id="${ID}-opponents"></div><label class="inv-edit-row"><span>${escape(tk('target'))}</span><select class="inv-edit-input" id="${ID}-target"></select></label><div id="${ID}-goblinTargets"></div>${select('enemyVictim',[['player','you'],['beggar','enemy.beggar']])}<div class="bsim-btn-row">${['round','chooseTarget','dart','pebble','bind','useLuck','useCake','skipLuck','glove0','glove1','gloveKeep'].map(button).join('')}</div><div id="${ID}-limbControls">${select('limbSpell',[[373,'spell.373'],[357,'spell.357'],[435,'spell.435'],[441,'spell.441'],[450,'spell.450']])}<div class="bsim-btn-row">${button('limbCast')}</div></div><div id="${ID}-chainControls">${select('chainFirst',[['luck','useLuck'],['cake','useCake']])}${select('chainSecond',[['luck','useLuck'],['cake','useCake']])}<div class="bsim-btn-row">${button('recover')}</div></div><div id="${ID}-exitControls"><label class="inv-edit-row"><span>${escape(tk('exit'))}</span><select class="inv-edit-input" id="${ID}-exit"></select></label><div class="bsim-btn-row">${button('chooseExit')}</div></div><p class="bsim-status" id="${ID}-status" role="status" aria-live="polite"></p><details open><summary>${escape(tk('log'))}</summary><div class="bsim-status bsim-log" id="${ID}-log"></div></details><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-status bsim-history-list" id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    el('chosen').closest('details').insertAdjacentHTML('beforeend', `<p>${escape(tk('wheelNote'))}</p><div class="bsim-btn-row">${button('wheel')}</div>`);
    el('wheel').addEventListener('click', () => change(data => {
      if (active(data.fight)) return;
      const result = effects.wheel(data.character);
      data.character = result.character;
      data.log.push(tk('wheelResult', result));
      if (result.destination) data.log.push(tk('destination', { section: result.destination }));
    }));
    const trigger = document.createElement('button'); trigger.id = ID + '-btn'; trigger.textContent = t('battlesim.title'); trigger.style.display = 'none';
    getButtonRow().appendChild(trigger); trigger.addEventListener('click', open);
    el('close').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    for (const key of ['encounter','champion','ally','favoured','target','enemyVictim','limbSpell','chainFirst','chainSecond']) el(key).addEventListener('change', () => change(data => { if (['encounter','champion','ally'].includes(key)) data.setup.enemyStamina = []; }));
    el('goblinTargets').addEventListener('change', () => change(() => {}));
    el('roll').addEventListener('click', () => {
      const update = data => { if (!active(data.fight)) { data.character = rules.newCharacter(el('role').value); data.fight = null; data.ticket = null; data.log.push(tk('newCharacter')); } };
      if (store.read()?.character) confirmed('rollConfirm', update); else change(update);
    });
    el('apply').addEventListener('click', () => {
      const update = data => { if (!active(data.fight)) { data.character = character(); data.fight = null; } };
      if (store.read()?.character?.dead) confirmed('restoreConfirm', update); else change(update);
    });
    el('start').addEventListener('click', () => change(data => {
      if (active(data.fight) || !data.character || data.character.dead) return;
      data.character = character();
      const fields = [...el('enemyOverrides').querySelectorAll('input')];
      const enemyStamina = fields.map(field => { const raw = field.value.trim(), value = Number(raw || field.placeholder); if (!Number.isSafeInteger(value) || value < 1 || value > Number(field.max)) throw new RangeError('Invalid enemy health'); return value; });
      const options = { champion: el('champion').value, ally: el('ally').value, favoured: Number(el('favoured').value), confuse: el('confuse').value, enemyStamina };
      if (selected().summonGoblins) options.summonCount = number('summonCount');
      if (selected().mode === 'harpies') options.beggarStamina = number('beggarStamina');
      const fight = rules.startFight(selected().section, data.character, options); fight.name = tk('encounter.' + selected().section); report(data, fight);
    }));
    const action = (key, transform) => el(key).addEventListener('click', () => change(data => report(data, transform(data.fight))));
    action('round', fight => rules.round(fight, Number(el('target').value), undefined, { enemyVictim: el('enemyVictim').value, goblinTargets: [...el('goblinTargets').querySelectorAll('select')].map(field => Number(field.value)) }));
    action('chooseTarget', fight => rules.chooseTarget(fight, Number(el('target').value)));
    for (const [key, mode] of [['useLuck','luck'],['useCake','cake'],['skipLuck','skip']]) action(key, fight => fight.decision?.kind === 'wraithLuck' ? rules.decideWraithLuck(fight, mode) : rules.resolveWound(fight, mode));
    for (const [key, index] of [['glove0',0],['glove1',1],['gloveKeep',null]]) action(key, fight => rules.chooseGlove(fight,index));
    action('pebble', fight => rules.throwPebble(fight, Number(el('target').value)));
    action('dart', fight => rules.useDart(fight, Number(el('target').value)));
    action('bind', fight => rules.bindEnemy(fight, Number(el('target').value)));
    action('limbCast', fight => rules.castLimbSpell(fight, Number(el('limbSpell').value)));
    action('recover', fight => rules.recoverChain(fight, undefined, [el('chainFirst').value, el('chainSecond').value]));
    action('chooseExit', fight => rules.chooseDestination(fight, Number(el('exit').value)));
    el('cancel').addEventListener('click', () => confirmed('cancelConfirm', data => { if (active(data.fight)) report(data, { ...data.fight, outcome: 'cancelled', pending: [], decision: null, events: [], destination: null }); }));
    for (const [key, effect] of [['eat',effects.eat],['sharedMeal',value=>effects.eat(value,{shared:true})],['medicine',effects.healingSpell],['nextDay',effects.nextDay]]) el(key).addEventListener('click', () => change(data => { if (!active(data.fight)) { data.character = effect(data.character); data.log.push(tk('effectUsed',{effect:tk(key)})); } }));
    for (const [key, kind] of [['libraRestore','restore'],['libraCure','cure'],['libraBless','champion']]) el(key).addEventListener('click', () => change(data => {
      if (active(data.fight)) { if (kind === 'champion' || data.fight.pending.length || data.fight.decision) return; data.fight.player = effects.useLibra(data.fight.player,kind); data.character = structuredClone(data.fight.player); }
      else data.character = effects.useLibra(data.character,kind);
      data.log.push(tk('effectUsed',{effect:tk(key)}));
    }));
    for (const [key, cake] of [['testLuck',false],['testCake',true]]) el(key).addEventListener('click', () => change(data => { if (!active(data.fight)) { const result = effects.testLuck(data.character,undefined,{cake}); data.character = result.character; data.log.push(tk('luckResult',{roll:cake?tk('cake'):result.effective,result:tk(result.lucky?'lucky':'unlucky')})); } }));
    el('herbs').addEventListener('click', () => change(data => { if (!active(data.fight)) { const result = effects.herbs(data.character); data.character = result.character; data.log.push(tk('rollResult',{action:tk('herbs'),roll:result.roll}),tk('destination',{section:result.destination})); } }));
    el('prediction').addEventListener('click', () => change(data => { if (!active(data.fight)) { const result = effects.prediction(data.character,number('chosen'),number('excluded',true)??null,undefined,{cake:el('predictionCake').checked}); data.character = result.character; data.log.push(tk('predictionResult',{roll:result.roll,result:tk(result.won?'won':'lost')})); if(result.destination)data.log.push(tk('destination',{section:result.destination})); } }));
    el('placeBet').addEventListener('click', () => change(data => { if (!active(data.fight) && (!data.ticket || data.ticket.settled)) { const result = effects.placeBet(data.character,el('betFighter').value,number('stake')); data.character=result.character;data.ticket=result.ticket;data.log.push(tk('betPlaced')); } }));
    registerShortcut({ button: trigger, overlay, open, close });
  }
  return { init, render, open, close, setVisible(visible) { if (el('btn')) el('btn').style.display = visible ? '' : 'none'; if (!visible) { close(); shownRun = null; } } };
}

const panel = createKharePanel({ document, t, getRun: currentPlaythrough, getBookId: () => currentBookId,
  saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  registerShortcut({button,overlay,open,close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  },
});
export function initSim722() { panel.init(); }
export function renderSim722() { panel.render(); }
export function setSim722Visible(visible) { panel.setVisible(visible); }
export { initSim722 as init, renderSim722 as render, setSim722Visible as setVisible };
