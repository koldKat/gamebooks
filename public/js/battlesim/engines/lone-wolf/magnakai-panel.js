// Present a single optional Magnakai encounter without controlling the reader or the journey.
import {createOpponentEditor} from '../../opponents.js';
import {createMagnakaiCombat} from './magnakai-combat.js';
import {createMagnakaiState} from './magnakai-state.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createMagnakaiPanel(catalog, dependencies) {
  const {definition} = catalog;
  const {document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, fetcher, registerShortcut = () => {}} = dependencies;
  const id = definition.stateKey, el = key => document.getElementById(id + '-' + key);
  const tk = (key, values) => t(definition.i18nPrefix + '.' + key, values);
  const controls = definition.controls ?? [['animal','nextAnimal'],['tracking','nextTracking'],['nexus','nextNexus'],['sommerwerd','nextSommerwerd']];
  const supportsArchery = definition.supportsArchery !== false;
  const numericControls = definition.numericControls ?? [];
  const characterFields = [['skill','combatSkill'],['endurance','endurance'],['maximum','enduranceInitial'],['modifier','attackModifier'],['potions','potions'],
    ...(definition.allowPriorRounds ? [['priorRounds','nextPriorRounds']] : []), ...numericControls];
  const stepFor = key => key === 'endurance' ? (definition.enduranceStep ?? 1) : 1;
  const toggles = [...controls, ...(supportsArchery ? [['mastery','nextBowMastery'],['jakan','nextJackan']] : [])];
  const encounterKey = row => String(row.key ?? row.section);
  const selectedEncounter = () => catalog.ENCOUNTERS.find(row => encounterKey(row) === el('encounter').value);
  let shownRun, ticket = 0, editor, editorRun, core, characterRun, characterStamp;
  const store = createMagnakaiState(definition, () => ({currentBookId: getBookId(), currentPlaythrough: getRun, health: core._health}));
  function close() { ticket++; el('overlay')?.classList.remove('active'); shownRun = null; }
  function data() {
    if (getRun() !== shownRun || Number(getBookId()) !== definition.id || !el('overlay')?.classList.contains('active')) { close(); return null; }
    return store.data();
  }
  function number(key, min = 0, max = 100000) {
    const raw = el(key).value, value = Number(raw);
    if (!raw.trim() || !Number.isSafeInteger(value / stepFor(key)) || value < min || value > max) throw new RangeError('Invalid ' + key);
    return value;
  }
  function pick() { return el('manual').checked ? number('pick', 0, 9) : core._pick10(); }
  core = createMagnakaiCombat(() => ({...core, COMBAT_TABLE: catalog.COMBAT_TABLE, ENCOUNTER_RULES: catalog.ENCOUNTER_RULES,
    effectControls: controls, numericEffectControls: numericControls, combatOptions: definition.combatOptions,
    _data: data, _appendLog: store.appendLog, _recordOutcome: store.recordOutcome, _battleOver: store.battleOver,
    _pick10: pick, _renderAll: () => {}, saveState: () => {}, t, escapeHtml: value => value, SVG_SKULL: '', SVG_TROPHY: ''}), definition.i18nPrefix);
  function act(update) {
    const value = data();
    if (!value) return;
    try { update(value); saveState(); render(); } catch { showAlert(tk('invalid')); }
  }
  function confirmed(key, update) {
    const run = getRun(), original = data(), serial = original?.fightSerial;
    if (!original) return;
    showConfirm(tk(key), () => { if (getRun() === run && data() === original && original.fightSerial === serial) act(update); }, {confirmLabel:tk('confirm'),danger:false});
  }
  function character() {
    const value = {combatSkill: number('skill', 0, 1000), endurance: number('endurance'),
      enduranceInitial: number('maximum', 1), attackModifier: number('modifier', -1000, 1000), potions: number('potions', 0, 8),
      ...Object.fromEntries(numericControls.map(([key,field,min,max]) => [field, number(key,min,max)])),
      ...(definition.allowPriorRounds ? {nextPriorRounds: number('priorRounds')} : {})};
    if (value.endurance > value.enduranceInitial) throw new RangeError('Endurance above initial score');
    if (definition.basicEnduranceBonusField && value[definition.basicEnduranceBonusField] >= value.enduranceInitial)
      throw new RangeError('Basic Endurance must be positive');
    return value;
  }
  function active(value) { return value && !store.battleOver(value); }
  function ensureEditor() {
    if (editor) return;
    editor = createOpponentEditor({document, id, t, fields: [
      {key:'skill', label:tk('enemySkill'), min:0, max:1000},
      {key:'stamina', label:tk('enemyEndurance'), min:1, max:100000}], presets:catalog.ENCOUNTERS,
      isStatUnavailable:(key,row)=>row.unavailableStats?.includes(key),
      onSelect(preset) { el('encounter').value = encounterKey(preset); rememberOpponent(); render(); }});
    el('editor').append(editor.element); editor.fixCount(true);
    for (const event of ['input','change']) editor.element.addEventListener(event, rememberOpponent);
    el('encounter').innerHTML = '<option value="0">' + escape(tk('custom')) + '</option>'
      + catalog.ENCOUNTERS.map(row => '<option value="' + escape(encounterKey(row)) + '">' + escape(row.name) + '</option>').join('');
  }
  function rememberOpponent() {
    const value = data();
    if (!value || active(value)) return;
    const preset = selectedEncounter();
    if (definition.allowPriorRounds && value.nextEncounterKey !== (preset?.key || '')) {
      value.nextPriorRounds = 0; el('priorRounds').value = 0;
    }
    value.opponents = editor.snapshot(); value.nextSection = preset?.section || 0;
    value.nextEncounterKey = preset?.key || ''; saveState();
  }
  function render() {
    if (!el('overlay')?.classList.contains('active')) return;
    const value = data();
    if (!value) return;
    const locked = active(value);
    if (editorRun !== getRun()) {
      editorRun = getRun(); editor.set(value.opponents ?? [{name:'', skill:0, stamina:1}]);
      el('encounter').value = value.nextEncounterKey || value.nextSection || 0;
    }
    editor.lock(locked);
    const stamp = JSON.stringify(characterFields.map(([,field]) => value[field]));
    for (const [key, field] of characterFields) {
      if (characterRun !== getRun() || characterStamp !== stamp || locked) el(key).value = value[field] ?? 0;
      el(key).disabled = locked;
    }
    characterRun = getRun(); characterStamp = stamp;
    for (const [key, field] of toggles) {
      el(key).checked = !!value[field]; el(key).disabled = locked;
    }
    el('psychic').value = value.nextPsychic || 'none';
    el('psychic').disabled = locked && !definition.allowCombatPsychicChanges;
    if (supportsArchery) { el('bowModifier').value = value.nextBowModifier || 0; el('bowModifier').disabled = locked; }
    for (const key of ['encounter','roll','start']) el(key).disabled = locked;
    el('round').disabled = !locked; el('cancel').disabled = !locked;
    if (definition.allowContinuations) el('continue').disabled = !value.combatEffects?.continuable || value.endurance <= 0 || value.enemy.endurance <= 0;
    const rules = catalog.ENCOUNTER_RULES[value.combatEffects?.ruleKey ?? value.combatEffects?.section] || {};
    el('escape').disabled = !locked || !core._escapeRoute(value);
    el('pick').disabled = !locked || !el('manual').checked;
    el('potion').disabled = locked || value.endurance <= 0 || value.endurance >= value.enduranceInitial || value.potions < 1 || value.roundsThisBattle === 0;
    if (definition.combatOptions?.healing) el('heal').disabled = !core._healingAvailable(value);
    const preset = selectedEncounter();
    el('archery').hidden = !catalog.ENCOUNTER_RULES[preset?.key ?? preset?.section]?.archery;
    el('hint').textContent = preset?.hint || '';
    const status = !value.rolled ? 'ready' : value.combatEffects?.cancelled ? 'cancelled'
      : core._health(value) <= 0 ? 'loss' : value.combatEffects?.finished ? 'reader' : value.enemy.endurance <= 0 ? 'win' : 'active';
    el('status').textContent = tk('status.' + status);
    el('destination').textContent = value.combatEffects?.route ? tk('destination', {section:value.combatEffects.route}) : '';
    el('totals').textContent = value.rolled ? tk(rules.archery ? 'targetTotals' : 'totals', {
      endurance:core._health(value), maximum:rules.archery?.targetPoints ?? value.enduranceInitial,
      enemy:value.enemy.endurance, ratio:core._combatRatio(value), rounds:value.roundsThisBattle}) : '';
    el('log').innerHTML = value.log.map(line => '<div>' + escape(line) + '</div>').join('');
    el('history').innerHTML = value.history.slice(-40).reverse().map(row => '<div>' + escape(row.enemy + ': ' + tk('status.'+row.outcome)) + '</div>').join('') || escape(tk('emptyHistory'));
  }
  function open() {
    if (Number(getBookId()) !== definition.id || !getRun()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    const run = getRun(), attempt = ++ticket;
    const show = () => {
      if (attempt !== ticket || getRun() !== run || Number(getBookId()) !== definition.id) return;
      ensureEditor(); shownRun = run; editorRun = null; characterRun = null;
      el('overlay').classList.add('active'); store.data(); render(); el('close').focus();
    };
    if (catalog.ENCOUNTERS.length) { show(); return; }
    return catalog.loadRoster(fetcher).then(show).catch(() => { if (attempt === ticket) showAlert(tk('unavailable')); });
  }
  const button = key => '<button type="button" class="inv-add-btn bsim-action-btn" id="'+id+'-'+key+'">'+escape(tk(key))+'</button>';
  const numeric = (key, min = 0, max = 100000) => '<label class="inv-edit-row"><span class="bsim-stat-label">'+escape(tk(key))+'</span><input class="inv-edit-input" type="number" min="'+min+'" max="'+max+'" step="'+stepFor(key)+'" autocomplete="off" id="'+id+'-'+key+'"></label>';
  const check = key => '<label class="bsim-checkbox"><input type="checkbox" id="'+id+'-'+key+'">'+escape(tk(key))+'</label>';
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id=id+'-overlay'; overlay.className='inv-overlay';
    overlay.innerHTML='<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="'+id+'-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="'+id+'-title">'+escape(tk('title'))+'</span><button type="button" class="inv-close-btn" id="'+id+'-close" aria-label="'+escape(t('btn.close'))+'">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>'+escape(tk('note'))+'</p>'+numeric('skill',0,1000)+numeric('endurance')+numeric('maximum',1)+numeric('modifier',-1000,1000)+numeric('potions',0,8)+(definition.allowPriorRounds?numeric('priorRounds'):'')+'<div class="bsim-btn-row">'+button('roll')+'</div><label class="inv-edit-row"><span>'+escape(tk('encounter'))+'</span><select class="inv-edit-input" id="'+id+'-encounter"></select></label><div id="'+id+'-editor"></div><p id="'+id+'-hint"></p><label class="inv-edit-row"><span>'+escape(tk('psychic'))+'</span><select class="inv-edit-input" id="'+id+'-psychic"><option value="none">'+escape(tk('none'))+'</option><option value="blast">'+escape(tk('blast'))+'</option><option value="surge">'+escape(tk('surge'))+'</option></select></label>'+controls.map(([key])=>check(key)).join('')+'<div id="'+id+'-archery">'+(supportsArchery ? ['mastery','jakan'].map(check).join('')+numeric('bowModifier',-1000,1000)+'<p>'+escape(tk('bowNote'))+'</p>' : '')+'</div><div class="bsim-btn-row">'+['start','round','escape','cancel'].map(button).join('')+'</div>'+check('manual')+numeric('pick',0,9)+'<div class="bsim-btn-row">'+button('potion')+'</div></div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="'+id+'-status"></div><p id="'+id+'-destination"></p><p id="'+id+'-totals"></p><div class="bsim-log" id="'+id+'-log"></div><details class="bsim-history"><summary>'+escape(tk('history'))+'</summary><div class="bsim-history-list" id="'+id+'-history"></div></details></div></div></div>';
    if (numericControls.length) overlay.querySelector('#'+id+'-potions').closest('label')
      .insertAdjacentHTML('afterend',numericControls.map(([key,,min,max])=>numeric(key,min,max)).join(''));
    if (definition.combatOptions?.healing) overlay.querySelector('#'+id+'-potion')
      .insertAdjacentHTML('afterend',button('heal'));
    if (definition.allowContinuations) overlay.querySelector('#'+id+'-round')
      .insertAdjacentHTML('afterend',button('continue'));
    document.body.append(overlay);
    for (const mode of Object.keys(definition.combatOptions?.psychicModes || {})) {
      const option = document.createElement('option');
      option.value = mode; option.textContent = tk(mode); el('psychic').append(option);
    }
    const trigger=document.createElement('button'); trigger.id=id+'-btn'; trigger.style.display='none'; trigger.textContent=t('battlesim.title'); getButtonRow().append(trigger); trigger.addEventListener('click',open);
    registerShortcut({button:trigger,overlay,open,close});
    el('pick').value=0; el('close').addEventListener('click',close);
    let backdrop=false; overlay.addEventListener('mousedown',e=>{backdrop=e.target===overlay;}); overlay.addEventListener('click',e=>{if(backdrop&&e.target===overlay)close();});
    overlay.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented){e.stopPropagation();close();}});
    el('manual').addEventListener('change',render);
    for(const [key]of characterFields)el(key).addEventListener('change',()=>{
      const value=data();if(!value||active(value))return;
      try{Object.assign(value,character());saveState();render();}catch{/* Partial setup remains editable until all fields are valid. */}
    });
    el('encounter').addEventListener('change',()=>{const value=data();if(!value||active(value))return;editor.set([selectedEncounter()??{name:'',skill:0,stamina:1}]);rememberOpponent();render();});
    for(const [key,field]of toggles)el(key).addEventListener('change',()=>act(value=>{if(!active(value))value[field]=el(key).checked;}));
    el('psychic').addEventListener('change',()=>act(value=>{
      if (!active(value) || definition.allowCombatPsychicChanges) {
        value.nextPsychic=el('psychic').value;
        if (active(value) && value.combatEffects?.captured) value.combatEffects.psychic=value.nextPsychic;
      }
    }));
    if(supportsArchery)el('bowModifier').addEventListener('change',()=>act(value=>{if(!active(value))value.nextBowModifier=number('bowModifier',-1000,1000);}));
    el('roll').addEventListener('click',()=>confirmed('rollConfirm',value=>{if(active(value))return;value.combatSkill=value.combatSkillInitial=(definition.roll?.skill ?? 10)+core._pick10();value.endurance=value.enduranceInitial=(definition.roll?.endurance ?? 20)+core._pick10();value.rolled=false;store.appendLog(value,tk('rolled'));}));
    el('start').addEventListener('click',()=>act(value=>{
      if(active(value))return;
      const stats=character(),opponent=editor.read()[0];if(stats.endurance<=0)throw new RangeError('No Endurance');
      const preset=selectedEncounter();
      Object.assign(value,stats);value.combatSkillInitial=stats.combatSkill;value.nextSection=preset?.section||0;value.nextEncounterKey=preset?.key||'';value.opponents=editor.snapshot();
      value.enemy={name:opponent.displayName||opponent.name||tk('custom'),skill:opponent.skill,endurance:opponent.stamina,enduranceMax:opponent.stamina};
      value.fightSerial=(value.fightSerial||0)+1;value.roundsThisBattle=definition.allowPriorRounds?stats.nextPriorRounds:0;value.rolled=true;core._captureFightEffects(value);if(!value.combatEffects.finished)store.appendLog(value,tk('started',{enemy:value.enemy.name}));
    }));
    el('round').addEventListener('click',()=>act(()=>core._runRound()));
    if (definition.allowContinuations) el('continue').addEventListener('click',()=>act(value=>core._continueCombat(value)));
    el('escape').addEventListener('click',()=>act(()=>core._escape()));
    el('cancel').addEventListener('click',()=>confirmed('cancelConfirm',value=>{if(active(value)){value.combatEffects.finished=true;value.combatEffects.cancelled=true;core._finishCombatEffects(value);store.appendLog(value,tk('cancelled'));}}));
    el('potion').addEventListener('click',()=>act(value=>{const restored=store.potion(value);store.appendLog(value,tk('healed',{restored}));}));
    if (definition.combatOptions?.healing) el('heal').addEventListener('click',()=>act(value=>core._heal(value)));
  }
  return {init,render,open,close,setVisible(visible){if(el('btn'))el('btn').style.display=visible?'':'none';if(!visible)close();}};
}
