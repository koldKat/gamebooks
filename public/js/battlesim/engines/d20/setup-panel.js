// Assemble character forms and autocomplete-backed editable encounter opponents.
import {createOpponentEditor} from '../../opponents.js';
import {createD20ActorForm} from './actor-form.js';
import {startD20Fight} from './core.js';

export function createD20Setup(parent, ui, {id, t, getEncounters, getOpponents, getRules}) {
  const player = createD20ActorForm(parent, ui, {name:ui.tr('player'), title:'player'});
  const allies = [], allyArea = ui.group(parent, 'companions');
  function addAlly(actor) {
    if (allies.length >= 5) throw new RangeError(ui.tr('invalid'));
    const form = createD20ActorForm(allyArea, ui, {name:ui.tr('companion'), title:'companion', open:false});
    const item = {form}; allies.push(item);
    ui.button(form.root, 'remove', () => { allies.splice(allies.indexOf(item), 1); form.root.remove(); add.disabled = false; });
    if (actor) form.fill(actor);
    add.disabled = allies.length >= 5;
  }
  const add = ui.button(allyArea, 'addCompanion', () => addAlly());
  const preset = ui.field(parent, 'preset', {entries:[['',ui.tr('custom')], ...getEncounters().map(row => [row.key,row.name])]});
  const custom = createD20ActorForm(parent, ui, {name:ui.tr('opponent'), title:'customStats', open:false, hideBasics:true});
  const editable = row => ({...structuredClone(row), displayName:row.name, bonus:row.attacks?.[0]?.bonus ?? 0, count:row.count ?? 1});
  const editor = createOpponentEditor({document:ui.document, id, t, presets:getOpponents().map(editable), fields:[
    {key:'hp',label:ui.tr('enemyHp'),min:1}, {key:'ac',label:ui.tr('ac'),min:0,max:1000},
    {key:'bonus',label:ui.tr('enemyBonus'),min:-1000,max:1000}, {key:'count',label:ui.tr('count'),min:1,max:30},
  ]}); parent.append(editor.element);
  const failedSave = ui.checkbox(parent, 'failedSave'), ready = ui.checkbox(parent, 'readiedAttack', true);
  const priorDamage = ui.field(parent, 'priorEnemyDamage', {type:'number', value:0});
  const priorCorrosion = ui.checkbox(parent, 'corrosionAlreadyResolved');
  function choose() {
    const entry = getEncounters().find(row => row.key === preset.value);
    editor.set(entry ? entry.profiles.map(editable) : [{displayName:'',hp:null,ac:null,bonus:0,count:1}]);
    editor.fixCount(Boolean(entry)); custom.root.hidden = Boolean(entry); custom.root.open = !entry;
    failedSave.closest('label').hidden = !entry?.options?.enemyOpeningAttackIfFailedDexteritySave;
    ready.closest('label').hidden = !entry?.options?.readyAttack;
    failedSave.checked = false; ready.checked = true;
    priorDamage.closest('label').hidden = priorCorrosion.closest('label').hidden = !entry?.options?.previousDamageEntryRequired;
    priorDamage.value = 0; priorCorrosion.checked = false;
    editor.element.querySelectorAll('[data-stat="count"]').forEach(input => { input.disabled = Boolean(entry); });
  }
  preset.addEventListener('change', choose); choose();
  function read() {
    const template = getEncounters().find(row => row.key === preset.value);
    let fallback;
    const profiles = editor.read().map(row => {
      const known = template || getOpponents().some(value => value.key === row.key);
      const source = known && row.attacks?.length ? structuredClone(row) : structuredClone(fallback ??= custom.read({
        name:row.displayName, hp:Number(row.hp), maxHp:Number(row.hp), ac:Number(row.ac), bonus:Number(row.bonus)}));
      source.name = row.displayName; source.hp = source.maxHp = source.baseMaxHp = Number(row.hp); source.ac = Number(row.ac);
      source.count = template?.profiles[0].count ?? Number(row.count);
      if (source.attacks[0].kind !== 'save') source.attacks[0].bonus = Number(row.bonus);
      return source;
    });
    const opponent = {...template, name:template?.name ?? profiles.map(row => row.name).join(' / '), profiles,
      contextRules:getRules(), options:template?.options ?? {}};
    return startD20Fight(player.read(), opponent, allies.map(item => item.form.read()),
      {failedDexteritySave:failedSave.checked, readiedAttack:ready.checked,
        priorEnemyDamage:ui.number(priorDamage), corrosionAlreadyResolved:priorCorrosion.checked});
  }
  function fill(state) {
    player.fill(state.player);
    for (const item of allies) item.form.root.remove(); allies.length = 0;
    for (const actor of state.fight?.companions ?? []) addAlly(actor);
    preset.value = getEncounters().find(row => row.key === state.opponent?.key)?.key ?? ''; choose();
    if (state.opponent?.profiles) editor.set(state.opponent.profiles.map(editable));
    if (!preset.value) custom.fill(state.opponent?.profiles?.[0]);
  }
  function lock(value) {
    player.lock(value); custom.lock(value); for (const item of allies) item.form.lock(value);
    preset.disabled = failedSave.disabled = ready.disabled = value; add.disabled = value || allies.length >= 5;
    priorDamage.disabled = priorCorrosion.disabled = value;
    editor.lock(value); editor.fixCount(Boolean(preset.value));
    editor.element.querySelectorAll('[data-stat="count"]').forEach(input => { input.disabled = value || Boolean(preset.value); });
  }
  return {read, fill, lock};
}
