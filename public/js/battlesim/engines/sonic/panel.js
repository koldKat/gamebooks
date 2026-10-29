import { createOpponentEditor } from '../../opponents.js';
import { sonicCharacter, sonicHit, sonicExtraLife, sonicCheck, startSonicFight, sonicRound, resumeSonicFight } from './core.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const active = state => state?.fight?.status === 'fighting';
const interrupted = state => state?.fight?.status === 'paused';

export function createSonicPanel({ document, definition, getRoster, getPlayerDefaults, t,
  getRun, getBookId, saveState, getButtonRow, showAlert, showConfirm, registerShortcut = () => {} }) {
  const ID = definition.stateKey;
  const el = key => document.getElementById(ID + '-' + key);
  let shownRun, shownPreset, editor;
  const roster = () => getRoster();
  const defaults = () => getPlayerDefaults();
  const preset = state => roster().find(entry => entry.section === state.encounter);
  function data() {
    if (Number(getBookId()) !== definition.id) return null;
    const run = getRun();
    if (!run) return null;
    return run[ID] ??= { character: sonicCharacter(defaults()), encounter: '', fight: null, history: [], log: [], custom: {} };
  }
  function close() { el('overlay')?.classList.remove('active'); }
  function open() {
    if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    render(); el('overlay').classList.add('active');
  }
  function number(key) {
    const input = el(key), raw = input.value.trim(), value = Number(raw);
    if (!raw || !Number.isSafeInteger(value) || value < Number(input.min) || value > Number(input.max)) throw new RangeError('Check ' + key);
    return value;
  }
  function readCharacter() {
    const character = data().character;
    return sonicCharacter({ ...character,
      abilities: Object.fromEntries(Object.keys(defaults().abilities).map(key => [key, number('ability-' + key)])),
      lives: number('lives'), rings: number('rings'), elapsed: number('elapsed'), shield: el('shield').checked,
      favourBonus: (defaults().modifiers ?? []).reduce((sum, modifier) => sum + (el('modifier-' + modifier.key).checked ? modifier.bonus : 0), 0),
    });
  }
  function action(update) {
    const run = getRun();
    if (run !== shownRun || Number(getBookId()) !== definition.id) return;
    const original = data();
    if (!original) return;
    try {
      const state = structuredClone(original);
      update(state);
      if (getRun() !== run || Number(getBookId()) !== definition.id) return;
      const fight = state.fight;
      if (fight && !fight.recorded && ['win', 'loss'].includes(fight.status)) {
        fight.recorded = true;
        state.history.push({ enemy: fight.config.label ?? 'Custom fight', outcome: fight.status,
          section: fight.section, ts: Math.max(Date.now(), (state.history.at(-1)?.ts ?? 0) + 1) });
      }
      state.log = state.log.slice(-100);
      run[ID] = state; saveState(); render();
    } catch (error) { showAlert(error.message || 'Check the simulator values.'); }
  }
  function currentConfig(state) {
    const selected = preset(state);
    const enemies = editor.read().map((enemy, index) => ({ ...enemy, name: enemy.displayName || 'Opponent', key: selected?.enemies[index].key ?? 'custom-' + index }));
    return { ...(selected ?? {}), section: selected?.section ?? 'custom',
      label: selected?.label ?? 'Custom fight', enemies,
      ability: selected?.ability ?? el('combatAbility').value,
      bonus: selected?.bonus ?? number('bonus'), oneAtATime: selected?.oneAtATime ?? el('oneAtATime').checked,
      enemyCounterThreshold: roster()[0].enemyCounterThreshold,
    };
  }
  function start(state) {
    if (active(state) || interrupted(state)) return;
    const config = currentConfig(state);
    state.character = readCharacter();
    state.custom = { enemies: editor.snapshot(), ability: el('combatAbility').value, bonus: el('bonus').value, oneAtATime: el('oneAtATime').checked };
    state.fight = startSonicFight(state.character, config, { applyEntryEffects: el('entryEffects').checked });
    state.character = state.fight.character;
    state.log.push('Started: ' + config.label + (el('entryEffects').checked ? '. Unrecorded entry effects applied.' : '. Entry effects left unchanged.'));
  }
  function step(state) {
    if (!active(state)) return;
    const fight = sonicRound(state.fight);
    state.fight = fight; state.character = fight.character;
    const result = fight.history.at(-1);
    state.log.push(result.instantDefeat ? `Round ${result.round}: Tails knocks out the next opponent with a snowball.`
      : `Round ${result.round}: ${result.attack.dice} + modifiers = ${result.attack.total}; ${result.attack.success ? 'hit' : 'miss'}.`
        + result.enemy.map(event => ` Counter ${event.total}: ${event.hit ? event.shieldUsed ? 'Shield used' : 'hit' : 'miss'}.`).join(''));
    if (!active(state)) state.log.push(fight.status === 'paused' ? 'Fight interrupted. Continue at section ' + fight.section + '.'
      : fight.status === 'win' ? 'Victory!' : fight.character.lives ? (fight.reason === 'timeout' ? 'Time is up.' : 'Defeated.') + ' Continue at section ' + fight.section + '.' : 'Game Over.');
    if (result.rewardsApplied) state.log.push(`After the fight: ${fight.character.rings} rings; ${fight.character.elapsed ?? 0} minutes elapsed.`);
  }
  function render() {
    if (!el('overlay')) return;
    const state = data();
    if (!state) { shownRun = undefined; close(); return; }
    const isNewRun = shownRun !== getRun();
    if (isNewRun) { shownRun = getRun(); shownPreset = undefined; }
    el('encounter').value = state.encounter;
    const selected = preset(state), locked = active(state) || interrupted(state);
    if (shownPreset !== state.encounter || isNewRun) {
      shownPreset = state.encounter;
      editor.fixCount(Boolean(selected));
      editor.set(selected ? selected.enemies : state.custom.enemies ?? [{ ...defaults().customEnemyDefaults }]);
      el('combatAbility').value = selected?.ability ?? state.custom.ability ?? Object.keys(defaults().abilities)[0];
      el('bonus').value = selected?.bonus ?? state.custom.bonus ?? 0;
      el('oneAtATime').checked = selected?.oneAtATime ?? state.custom.oneAtATime ?? false;
      el('entryEffects').checked = false;
    }
    editor.lock(active(state));
    for (const input of el('character').querySelectorAll('input')) input.disabled = locked;
    for (const key of Object.keys(state.character.abilities)) el('ability-' + key).value = state.character.abilities[key];
    for (const key of ['lives', 'rings', 'elapsed']) el(key).value = state.character[key] ?? 0;
    el('shield').checked = state.character.shield;
    for (const modifier of defaults().modifiers ?? []) el('modifier-' + modifier.key).checked = Boolean(state.character.favourBonus);
    el('encounter').disabled = active(state);
    for (const key of ['combatAbility','bonus','oneAtATime']) el(key).disabled = locked || Boolean(selected);
    el('entryEffectsRow').hidden = !selected?.entryEffects?.length;
    el('entryDescription').textContent = (selected?.entryEffects ?? []).map(effect => effect.kind === 'hit' ? 'Lose all rings, or one life if there are no rings'
      : effect.kind === 'shield' ? 'Gain a Shield' : effect.kind === 'minutes' ? `Add ${effect.amount} minutes`
        : effect.kind === 'rings' ? `Gain ${effect.amount} rings` : '').filter(Boolean).join(' · ');
    el('entryEffects').disabled = locked;
    el('note').textContent = selected?.note ?? '';
    el('start').disabled = locked;
    el('attack').disabled = !active(state);
    el('cancel').disabled = !locked;
    el('resume').disabled = !interrupted(state) || !selected?.group || selected.group !== state.fight.config.group
      || !(selected.resumeFrom ?? []).includes(String(state.fight.section));
    for (const key of ['applyCharacter','takeHit','extraLife','check']) el(key).disabled = locked;
    const fight = state.fight;
    el('status').textContent = fight ? `${fight.status}${fight.section ? ' · Section ' + fight.section : ''}` : 'Ready';
    el('opponents').innerHTML = fight ? fight.opponents.map(enemy => `<div>${escape(enemy.name)}: ${enemy.remainingHits}/${enemy.hits} hits remaining</div>`).join('') : '';
    el('destinations').textContent = fight?.status === 'win' && fight.config.winChoices ? 'Continue with the book: ' + fight.config.winChoices.join(' / ') : '';
    el('log').innerHTML = state.log.slice().reverse().map(line => `<div>${escape(line)}</div>`).join('');
    el('history').innerHTML = state.history.slice(-30).reverse().map(entry => `<div>${escape(entry.enemy)} · ${escape(entry.outcome)}</div>`).join('');
  }
  const input = (key, label, value = 0, min = 0, max = 1000000) => `<label class="inv-edit-row">${escape(label)}<input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="${max}" step="1" value="${value}"></label>`;
  const check = (key, label) => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(label)}</label>`;
  const button = (key, label) => `<button type="button" class="bsim-action-btn" id="${ID}-${key}">${escape(label)}</button>`;
  const abilities = () => Object.entries(defaults().abilityNames).map(([key, label]) => `<option value="${key}">${escape(label)}</option>`).join('');
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(t(definition.i18nPrefix + '.title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left">
      <details open><summary>Character</summary><p>${escape(defaults().note)}</p><div id="${ID}-character">${Object.entries(defaults().abilities).map(([key,value]) => input('ability-' + key, defaults().abilityNames[key], value, 0, 99)).join('')}${input('lives','Lives',defaults().lives)}${input('rings','Rings')}${input('elapsed','Minutes elapsed')}${check('shield','Shield')}${(defaults().modifiers ?? []).map(modifier => check('modifier-' + modifier.key,modifier.name)).join('')}</div><div class="bsim-actions">${button('applyCharacter','Apply character')}${button('takeHit','Take a hit')}${button('extraLife',`${defaults().ringLifeCost} rings for a life`)}</div></details>
      <label class="inv-edit-row">Encounter<select class="inv-edit-input" id="${ID}-encounter"><option value="">Custom fight</option>${roster().map(entry => `<option value="${entry.section}">${escape(entry.label)}</option>`).join('')}</select></label><p id="${ID}-note"></p>
      <label class="inv-edit-row">Ability<select class="inv-edit-input" id="${ID}-combatAbility">${abilities()}</select></label>${input('bonus','Combat bonus',0,-99,99)}${check('oneAtATime','Fight one opponent at a time')}<div id="${ID}-enemyEditor"></div><div id="${ID}-entryEffectsRow"><p id="${ID}-entryDescription"></p>${check('entryEffects',"Also apply this passage's starting changes")}</div>
      <div class="bsim-actions">${button('start','Start fight')}${button('attack','Next round')}${button('resume','Resume fight')}${button('cancel','End fight')}</div>
      <details><summary>Ability test</summary><label class="inv-edit-row">Ability<select class="inv-edit-input" id="${ID}-checkAbility">${abilities()}</select></label>${input('target','Target',7,1,999)}${button('check','Roll test')}</details>
      </div><div class="bsim-col bsim-col-right"><div id="${ID}-status" role="status"></div><div id="${ID}-opponents"></div><div id="${ID}-destinations" role="status"></div><div class="bsim-log" id="${ID}-log"></div><details><summary>Battle history</summary><div id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({ document, id: ID, t,
      fields: [{key:'rating',label:'Rating',min:1,max:99},{key:'hits',label:'Hits to defeat',min:1,max:99}],
      presets: roster().flatMap(entry => entry.enemies.map(enemy => ({ ...enemy, displayName: enemy.name }))),
    });
    el('enemyEditor').appendChild(editor.element);
    const launch = document.createElement('button'); launch.id = ID + '-btn'; launch.textContent = t('battlesim.title'); launch.style.display = 'none';
    getButtonRow().appendChild(launch); launch.addEventListener('click',open);
    el('close').addEventListener('click',close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    registerShortcut({button:launch,overlay,open,close});
    el('character').addEventListener('change', () => action(state => { if (!active(state) && !interrupted(state)) state.character = readCharacter(); }));
    el('encounter').addEventListener('change', () => action(state => { if (!active(state)) state.encounter = el('encounter').value; }));
    el('start').addEventListener('click', () => action(start));
    el('attack').addEventListener('click', () => action(step));
    el('resume').addEventListener('click', () => action(state => {
      state.fight = resumeSonicFight(state.fight, currentConfig(state)); state.character = state.fight.character;
      state.log.push('Resumed the same fight; opponent damage retained.');
    }));
    el('applyCharacter').addEventListener('click', () => action(state => { if (!active(state) && !interrupted(state)) state.character = readCharacter(); }));
    el('takeHit').addEventListener('click', () => action(state => { if (!active(state) && !interrupted(state)) state.character = sonicHit(readCharacter()); }));
    el('extraLife').addEventListener('click', () => action(state => { if (!active(state) && !interrupted(state)) state.character = sonicExtraLife(readCharacter(),defaults().ringLifeCost); }));
    el('check').addEventListener('click', () => action(state => {
      if (active(state) || interrupted(state)) return;
      state.character = readCharacter(); const result = sonicCheck(state.character,el('checkAbility').value,number('target'));
      state.log.push(`Test: ${result.total} against ${result.target} - ${result.success ? 'success' : 'failure'}.`);
    }));
    el('cancel').addEventListener('click', () => {
      if (getRun() !== shownRun) return;
      const run = getRun(), original = data(), fight = original?.fight;
      if (!active(original) && !interrupted(original)) return;
      showConfirm('End this fight? Your current character and battle history will be kept.', () => {
        if (getRun() === run && data() === original && data()?.fight === fight) action(state => { state.fight.status = 'cancelled'; });
      });
    });
  }
  return { init, render, setVisible(value) { const launch = el('btn'); if (launch) launch.style.display = value ? '' : 'none'; if (!value) close(); } };
}
