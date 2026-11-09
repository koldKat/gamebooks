import {createState} from '../../../public/js/battlesim/engines/grey-star/state.js';
import {createCombat} from '../../../public/js/battlesim/engines/grey-star/combat.js';
import {createEffects} from '../../../public/js/battlesim/engines/grey-star/effects.js';

// Exercise the actual shared factories with deterministic rolls and database rules.
export function greyStarFixture(definition, entries, table, saved) {
  const pt = saved ? {[definition.stateKey]: structuredClone(saved)} : {};
  const math = {random: () => .2};
  const context = {definition, currentBookId: definition.id, currentPlaythrough: () => pt,
    COMBAT_TABLE: table, HEALING_POTION_HEAL: 4,
    ENCOUNTER_RULES: Object.fromEntries(entries.map(entry => [entry.section, entry.rules])),
    DEADLINES: Object.fromEntries(entries.filter(entry => entry.rules.deadline).map(entry => [entry.section, entry.rules.deadline])),
    saveState() {}, showAlert() {}, _renderAll() {}, escapeHtml: value => value,
    SVG_SKULL: '', SVG_TROPHY: '',
    t: (key, values) => key.endsWith('.ui.neijjin') ? `Najin ${values.n} §101` : key};
  Object.assign(context, createState(() => context), createCombat(() => context), createEffects(() => context));
  context._pick10 = () => Math.floor(math.random() * 10);
  const sim = {data: context._data, capture: context._captureFightEffects, skill: context._effectiveSkill,
    round: context._runRound, reset: context._resetBattle, potion: context._usePotion, escapeRoute: context._escapeRoute,
    ceaseRoute: context._ceaseRoute, cease: context._ceaseFight};
  return {sim, data: sim.data(), math, context, pt};
}
