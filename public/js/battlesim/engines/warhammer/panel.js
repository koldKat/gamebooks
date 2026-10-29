import { createOpponentEditor } from '../../opponents.js';
import { warhammerCharacter, startWarhammerFight, warhammerRound, reloadWarhammerAfterFight } from './core.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const active = state => state?.fight?.status === 'fighting';
const fields = [
  ['ws','Weapon Skill',1,6], ['s','Strength',1,6], ['t','Toughness',1,6],
  ['w','Wounds',0], ['maxW','Starting Wounds',1], ['aRanged','Attacks / ranged',1,100],
  ['aClose','Attacks / close',1,100], ['purity','Purity',0], ['armour','Armour save',0,6], ['cover','Cover save',0,6],
];
const enemyFields = [
  ...fields.filter(([key]) => !['maxW','purity','cover'].includes(key)).map(([key,label,min,max]) => ({ key,label,min:key === 'w' ? 1 : min,max:max ?? 1000000 })),
  {key:'attackMode',label:'Weapons',options:[{value:'melee',label:'Close only'},{value:'ranged',label:'Ranged only'},{value:'both',label:'Both'}]},
  {key:'rangedS',label:'Ranged Strength',min:1,max:6}, {key:'rangedDamage',label:'Ranged damage',min:1,max:1000},
  {key:'meleeDamage',label:'Close multiplier',min:0.1,max:1000,step:0.1},
];
const editableEnemy = enemy => ({ ...enemy, displayName: enemy.name,
  attackMode: enemy.ranged ? enemy.melee ? 'both' : 'ranged' : 'melee',
  rangedS: enemy.ranged?.s ?? 1, rangedDamage: enemy.ranged?.damage ?? 1, meleeDamage: enemy.melee?.damage ?? 1 });

export function createWarhammerPanel({ document, definition, getRoster, getPlayerDefaults, t,
  getRun, getBookId, saveState, getButtonRow, showAlert, showConfirm, registerShortcut = () => {} }) {
  const ID = definition.stateKey, el = key => document.getElementById(ID + '-' + key);
  let shownRun, shownPreset, editor;
  const defaults = () => getPlayerDefaults();
  const selected = state => getRoster().find(entry => entry.section === state.encounter);
  function data() {
    if (Number(getBookId()) !== definition.id) return null;
    const run = getRun();
    if (!run) return null;
    return run[ID] ??= { mode:'basic', character:warhammerCharacter(defaults().basic), encounter:'',
      fight:null, custom:{}, history:[], log:[] };
  }
  const close = () => el('overlay')?.classList.remove('active');
  function open() {
    if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    render(); el('overlay').classList.add('active');
  }
  function number(key) {
    const input = el(key), raw = input.value.trim(), value = Number(raw);
    if (!raw || !Number.isFinite(value) || value < Number(input.min) || value > Number(input.max)
        || Math.abs(value / Number(input.step) - Math.round(value / Number(input.step))) > 1e-8) throw new RangeError('Check ' + key.replaceAll('-', ' '));
    return value;
  }
  function readWeapon(kind) {
    const key = el(kind + '-preset').value;
    if (!key) return null;
    return { presetKey:key, name:el(kind + '-name').value.trim().slice(0,200), damage:number(kind + '-damage'),
      fire:el(kind + '-fire').checked, poison:el(kind + '-poison').checked,
      ...(kind === 'ranged' ? { s:number('ranged-s'), ammo:number('ranged-ammo'), capacity:number('ranged-capacity'), reserve:number('ranged-reserve') } : {}) };
  }
  function readCharacter() {
    return warhammerCharacter({ ...data().character,
      ...Object.fromEntries(fields.map(([key]) => [key,number(key)])),
      poisoned:el('poisoned').checked, ranged:readWeapon('ranged'), melee:readWeapon('melee') });
  }
  function fillWeapon(kind, value) {
    el(kind + '-preset').value = value?.presetKey ?? (value ? 'custom' : '');
    el(kind + '-name').value = value?.name ?? '';
    el(kind + '-damage').value = value?.damage ?? 1;
    el(kind + '-fire').checked = Boolean(value?.fire); el(kind + '-poison').checked = Boolean(value?.poison);
    if (kind === 'ranged') {
      el('ranged-s').value = value?.s ?? 1;
      el('ranged-ammo').value = value?.ammo ?? 0;
      el('ranged-capacity').value = value?.capacity === null ? '' : value?.capacity ?? 1;
      el('ranged-reserve').value = value?.reserve ?? 0;
    }
    el(kind + '-note').textContent = defaults().weaponPresets.find(entry => entry.key === value?.presetKey)?.note ?? '';
    for (const control of el(kind + '-fields').querySelectorAll('input')) control.disabled = !value;
  }
  function action(update) {
    const run = getRun();
    if (run !== shownRun || Number(getBookId()) !== definition.id) return;
    const original = data();
    if (!original) return;
    try {
      const state = structuredClone(original); update(state);
      if (getRun() !== run || Number(getBookId()) !== definition.id) return;
      const fight = state.fight;
      if (fight && !fight.recorded && ['win','loss'].includes(fight.status)) {
        fight.recorded = true;
        state.history.push({enemy:fight.config.label ?? 'Custom fight', outcome:fight.status,
          section:fight.section, ts:Math.max(Date.now(),(state.history.at(-1)?.ts ?? 0)+1)});
      }
      state.log = state.log.slice(-100); run[ID] = state; saveState(); render();
    } catch (error) { showAlert(error.message || 'Check the simulator values.'); }
  }
  function config(state) {
    const preset = selected(state);
    if (preset?.kind === 'shooting-challenge') return structuredClone(preset);
    const enemies = editor.read().map((row,index) => ({ ...row, name:row.displayName || 'Opponent',
      key:preset?.enemies[index].key ?? 'custom-' + index, maxW:row.w,
      ranged:['both','ranged'].includes(row.attackMode) ? { ...row.ranged, name:row.ranged?.name ?? 'Ranged weapon', s:row.rangedS, damage:row.rangedDamage } : null,
      melee:['both','melee'].includes(row.attackMode) ? { ...row.melee, name:row.melee?.name ?? 'Close weapon', damage:row.meleeDamage } : null }));
    return { ...(preset ?? {}), section:preset?.section ?? 'custom', label:preset?.label ?? 'Custom fight', enemies,
      initiative:preset?.initiative ?? el('initiative').value, skipRanged:preset?.skipRanged ?? el('startClose').checked };
  }
  function start(state) {
    if (active(state)) return;
    state.character = readCharacter();
    const encounter = config(state);
    if (encounter.kind !== 'shooting-challenge' && !state.character.ranged && !state.character.melee) throw new RangeError('Choose your weapon first.');
    if (!selected(state)) state.custom = { enemies:editor.snapshot(), initiative:el('initiative').value, skipRanged:el('startClose').checked };
    state.fight = startWarhammerFight(state.character,encounter,state.mode);
    state.log.push('Started: ' + encounter.label + ' (' + state.mode + ').');
  }
  function step(state, options = {}) {
    if (!active(state)) return;
    const targets = [...el('targets').querySelectorAll('select')].map(input => Number(input.value));
    const fight = warhammerRound(state.fight,{targets,weapon:el('weapon').value,...options});
    state.fight = fight; state.character = fight.character;
    const event = fight.history.at(-1);
    if (fight.config.kind === 'shooting-challenge') {
      state.log.push(`Shot ${event.round}: ${event.hitRoll} against ${event.hitThreshold}; ${event.kills} kills. ${fight.kills}/${fight.config.killTarget} total.`);
    } else {
      const rolls = event.attacks.map(entry => `${entry.attacker}: ${entry.hitRoll}/${entry.hitThreshold} hit`
        + (entry.woundRoll ? `, ${entry.woundRoll}/${entry.woundThreshold} wound` : entry.cannotWound ? ', cannot wound' : entry.automaticWound ? ', automatic wound' : '')
        + (entry.saveRoll ? `, ${entry.saveRoll}/${entry.saveThreshold} save${entry.saved ? ' (saved)' : ''}` : '')
        + (entry.damage ? `, ${entry.damage} damage` : '')).join('; ');
      state.log.push(`Round ${event.round} (${event.phase})${event.reload ? ': reloading' : ''}. ${rolls}`);
      for (const entry of event.damage) state.log.push(`${entry.defender}: ${entry.damage} damage.`);
      for (const entry of event.effects) state.log.push(`${entry.name}: ${entry.damage} ongoing damage.`);
    }
    if (!active(state)) state.log.push((fight.status === 'win' ? 'Victory!' : 'Defeated.') + (fight.section ? ' Continue at section ' + fight.section + '.' : ''));
  }
  function render() {
    if (!el('overlay')) return;
    const state = data();
    if (!state) { shownRun = undefined; close(); return; }
    const changedRun = shownRun !== getRun();
    if (changedRun) { shownRun = getRun(); shownPreset = undefined; }
    const preset = selected(state), locked = active(state), fight = state.fight;
    el('mode').value = state.mode; el('encounter').value = state.encounter;
    if (changedRun || shownPreset !== state.encounter) {
      shownPreset = state.encounter;
      editor.fixCount(Boolean(preset));
      editor.set(preset && preset.kind !== 'shooting-challenge' ? preset.enemies.map(editableEnemy) : state.custom.enemies ?? [editableEnemy(defaults().customEnemy)]);
      editor.element.open = !preset;
      el('initiative').value = preset?.initiative ?? state.custom.initiative ?? 'you';
      el('startClose').checked = preset?.skipRanged ?? state.custom.skipRanged ?? false;
    }
    for (const [key] of fields) el(key).value = state.character[key] ?? 0;
    el('poisoned').checked = state.character.poisoned;
    for (const kind of ['ranged','melee']) fillWeapon(kind,state.character[kind]);
    editor.lock(locked);
    for (const control of el('character').querySelectorAll('input,select,button')) {
      if (locked) control.disabled = true;
      else if (!control.closest('[data-weapon-fields]')) control.disabled = false;
    }
    el('mode').disabled = el('encounter').disabled = locked;
    el('initiative').disabled = el('startClose').disabled = locked || Boolean(preset);
    const challenge = (locked ? fight.config : preset)?.kind === 'shooting-challenge';
    el('enemyEditor').hidden = Boolean(challenge);
    el('note').textContent = preset?.note ? (state.mode === 'basic' && !challenge ? 'Advanced rules only: ' : '') + preset.note : 'Custom fights use the opponent values below.';
    for (const key of ['s','t','aClose']) el(key).closest('label').hidden = state.mode === 'basic';
    el('aRanged').closest('label').querySelector('span').textContent = state.mode === 'basic' ? 'Attacks' : 'Attacks / ranged';
    for (const control of el('enemyEditor').querySelectorAll('[data-stat="s"],[data-stat="t"],[data-stat="aClose"],[data-stat="rangedS"]')) control.closest('label').hidden = state.mode === 'basic';
    el('startClose').closest('label').hidden = state.mode === 'basic' || challenge;
    for (const key of ['reload','closeCombat','reloadAfter']) el(key).hidden = state.mode === 'basic' || challenge;
    el('start').disabled = locked; el('attack').disabled = !locked; el('cancel').disabled = !locked;
    const acting = fight?.vehicle ?? state.character;
    el('weaponRow').hidden = state.mode !== 'basic' || challenge;
    el('weapon').disabled = !locked;
    const available = acting.ranged?.ammo > 0 ? 'ranged' : 'melee';
    if (!locked || !acting[el('weapon').value] || el('weapon').value === 'ranged' && !acting.ranged?.ammo) el('weapon').value = available;
    const gun = acting.ranged;
    el('reload').disabled = !locked || state.mode !== 'advanced' || fight.phase !== 'ranged' || challenge || !gun?.reserve || gun.ammo >= gun.capacity;
    el('closeCombat').disabled = !locked || state.mode !== 'advanced' || fight.phase !== 'ranged' || fight.round < 1 || challenge;
    el('reloadAfter').disabled = locked || !state.character.ranged?.reserve || state.character.ranged.ammo >= state.character.ranged.capacity;
    const actorProfile = fight?.vehicle;
    el('status').textContent = fight ? `${fight.status} · ${state.mode}${fight.phase !== 'basic' ? ' · '+fight.phase : ''}${fight.section ? ' · Section '+fight.section : ''}` : 'Ready';
    el('vehicle').textContent = actorProfile ? `${actorProfile.name}: ${actorProfile.w}/${actorProfile.maxW} Wounds. Your own sheet is kept separately.` : '';
    el('opponents').innerHTML = challenge && fight ? `<p>${fight.kills}/${fight.config.killTarget} kills · ${fight.shotsLeft} shots left</p>` : fight ? '<table class="bsim-report-table"><thead><tr><th>Opponent</th><th>Wounds</th></tr></thead><tbody>'+fight.opponents.map((enemy,index) => `<tr><td>${index+1}. ${escape(enemy.name)}</td><td>${enemy.w}/${enemy.maxW}</td></tr>`).join('')+'</tbody></table>' : '';
    const previous = [...el('targets').querySelectorAll('select')].map(input => input.value);
    const remaining = fight?.opponents.map((enemy,index) => ({enemy,index})).filter(({enemy}) => enemy.w > 0) ?? [];
    const count = locked && !challenge ? (state.mode === 'basic' || fight.phase === 'ranged' ? acting.aRanged : acting.aClose) : 0;
    el('targets').innerHTML = Array.from({length:count},(_,index) => `<label class="inv-edit-row"><span>Attack ${index+1} target</span><select class="inv-edit-input">${remaining.map(({enemy,index:i}) => `<option value="${i}">${escape(enemy.name)} (${i+1})</option>`).join('')}</select></label>`).join('');
    [...el('targets').querySelectorAll('select')].forEach((input,index) => { if (remaining.some(({index:i}) => String(i) === previous[index])) input.value = previous[index]; });
    el('log').innerHTML = state.log.slice().reverse().map(line => `<div>${escape(line)}</div>`).join('');
    el('history').innerHTML = state.history.slice(-30).reverse().map(entry => `<div>${escape(entry.enemy)} · ${escape(entry.outcome)}</div>`).join('');
  }
  const input = (key,label,value=0,min=0,max=1000000,step=1) => `<label class="inv-edit-row"><span>${escape(label)}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
  const check = (key,label) => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(label)}</label>`;
  const button = (key,label) => `<button type="button" class="bsim-action-btn" id="${ID}-${key}">${escape(label)}</button>`;
  const select = (key,label,options) => `<label class="inv-edit-row"><span>${escape(label)}</span><select class="inv-edit-input" id="${ID}-${key}">${options}</select></label>`;
  function weaponControls(kind,title) {
    const presets = defaults().weaponPresets.filter(entry => entry.kind === kind);
    return `<details><summary>${title}</summary>${select(kind+'-preset','Weapon','<option value="">None</option><option value="custom">Custom</option>'+presets.map(entry => `<option value="${escape(entry.key)}">${escape(entry.name)}</option>`).join(''))}<p id="${ID}-${kind}-note"></p><div data-weapon-fields id="${ID}-${kind}-fields"><label class="inv-edit-row"><span>Name</span><input class="inv-edit-input" id="${ID}-${kind}-name" maxlength="200"></label>${kind === 'ranged' ? input('ranged-s','Strength',1,1,6) : ''}${input(kind+'-damage',kind === 'ranged' ? 'Damage' : 'Damage multiplier',1,kind === 'ranged' ? 1 : 0.1,1000,kind === 'ranged' ? 1 : 0.1)}${kind === 'ranged' ? input('ranged-ammo','Shots loaded')+input('ranged-capacity','Shots / pack',1,1)+input('ranged-reserve','Spare full packs') : ''}${check(kind+'-fire','Fire')}${check(kind+'-poison','Poison')}</div></details>`;
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID+'-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(t(definition.i18nPrefix+'.title'))}</span><button class="inv-close-btn" type="button" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left">${select('mode','Rules','<option value="basic">Basic</option><option value="advanced">Advanced</option>')}<details open id="${ID}-character"><summary>Character and weapons</summary><p>${escape(defaults().note)} Changing rules keeps your sheet; use Starting profile to reset it.</p>${fields.map(([key,label,min,max]) => input(key,label,defaults().basic[key],min,max ?? 1000000)).join('')}${check('poisoned','Poisoned')}${weaponControls('ranged','Ranged weapon')}${weaponControls('melee','Close Combat weapon')}<div class="bsim-btn-row">${button('applyCharacter','Apply sheet')}${button('defaults','Starting profile')}${button('reloadAfter','Reload after combat')}</div></details>${select('encounter','Encounter','<option value="">Custom fight</option>'+getRoster().map(entry => `<option value="${entry.section}">${escape(entry.label)}</option>`).join(''))}<p id="${ID}-note"></p>${select('initiative','Initiative','<option value="you">You first</option><option value="enemy">Enemies first</option>')}${check('startClose','Start in Close Combat (advanced)')}<div id="${ID}-enemyEditor"></div><div id="${ID}-weaponRow">${select('weapon','Use weapon','<option value="ranged">Ranged weapon</option><option value="melee">Close weapon</option>')}</div><div id="${ID}-targets"></div><div class="bsim-btn-row">${button('start','Start fight')}${button('attack','Next round')}${button('reload','Reload')}${button('closeCombat','Close Combat')}${button('cancel','End fight')}</div></div><div class="bsim-col bsim-col-right"><div role="status" id="${ID}-status"></div><div role="status" id="${ID}-vehicle"></div><div id="${ID}-opponents"></div><div class="bsim-log" id="${ID}-log"></div><details><summary>Battle history</summary><div id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({document,id:ID,t,fields:enemyFields,
      presets:getRoster().filter(entry => entry.kind !== 'shooting-challenge').flatMap(entry => entry.enemies.map(editableEnemy))});
    el('enemyEditor').appendChild(editor.element);
    const launch = document.createElement('button'); launch.id = ID+'-btn'; launch.textContent = t('battlesim.title'); launch.style.display = 'none';
    getButtonRow().appendChild(launch); launch.addEventListener('click',open); el('close').addEventListener('click',close);
    let backdrop = false;
    overlay.addEventListener('mousedown',event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click',event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown',event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    registerShortcut({button:launch,overlay,open,close});
    for (const kind of ['ranged','melee']) el(kind+'-preset').addEventListener('change',() => {
      if (getRun() !== shownRun || active(data())) return;
      const key = el(kind+'-preset').value, preset = defaults().weaponPresets.find(entry => entry.key === key);
      fillWeapon(kind,!key ? null : {name:'',damage:1,...(kind === 'ranged' ? {s:1,ammo:0,capacity:1,reserve:0} : {}),...preset,presetKey:key});
    });
    el('applyCharacter').addEventListener('click',() => action(state => { if (!active(state)) state.character = readCharacter(); }));
    el('mode').addEventListener('change',() => action(state => { if (!active(state)) { state.character = readCharacter(); state.mode = el('mode').value; } }));
    el('encounter').addEventListener('change',() => action(state => {
      if (active(state)) return;
      state.character = readCharacter(); if (!selected(state)) state.custom.enemies = editor.snapshot();
      state.encounter = el('encounter').value;
    }));
    el('start').addEventListener('click',() => action(start));
    el('attack').addEventListener('click',() => action(state => step(state)));
    el('reload').addEventListener('click',() => action(state => step(state,{reload:true})));
    el('closeCombat').addEventListener('click',() => action(state => step(state,{close:true})));
    el('reloadAfter').addEventListener('click',() => action(state => { if (!active(state)) state.character = reloadWarhammerAfterFight(readCharacter()); }));
    for (const key of ['cancel','defaults']) el(key).addEventListener('click',() => {
      if (getRun() !== shownRun) return;
      const run = getRun(), original = data(), fight = original?.fight;
      if (!original || (key === 'cancel') !== active(original)) return;
      showConfirm(key === 'cancel' ? 'End this fight? Current Wounds, ammunition and battle history will be kept.' : 'Replace this simulator sheet with the starting profile for the selected rules?',() => {
        if (getRun() !== run || data() !== original || data()?.fight !== fight) return;
        action(state => {
          if (key === 'defaults') state.character = warhammerCharacter(defaults()[state.mode]);
          else { state.fight.status = 'cancelled'; state.fight.section = null; state.character.burning = false; }
        });
      });
    });
  }
  return {init,render,setVisible(value) { const launch = el('btn'); if (launch) launch.style.display = value ? '' : 'none'; if (!value) close(); }};
}
