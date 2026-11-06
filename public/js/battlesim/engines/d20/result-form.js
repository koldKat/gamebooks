// Collect one explicitly adjudicated combat or spell effect.
import {DAMAGE_TYPES} from './damage.js';
import {ABILITIES} from './core.js';
import {rollDamage} from './dice.js';

export function createD20ResultForm(parent, ui, targets, {target, magical = false, reason, onError} = {}) {
  const root = ui.document.createElement('fieldset'); root.className = 'bsim-opponent-row'; parent.append(root);
  const kind = ui.field(root, 'effect', {entries:['damage','heal','maximumHp','condition','removeCondition'].map(key => [key, ui.tr('effect.'+key)])});
  const destination = ui.field(root, 'target', {entries:targets, value:target ?? targets[0]?.[0]});
  const amount = ui.field(root, 'amount', {type:'number', optional:true});
  const expression = ui.field(root, 'formula', {optional:true});
  const roll = ui.button(root, 'rollDamage', () => { try { amount.value = rollDamage(expression.value.trim()).amount; } catch { onError?.(); } });
  const type = ui.field(root, 'damageType', {entries:DAMAGE_TYPES.map(key => [key, ui.tr('damage.'+key)]), value:'force'});
  const magic = ui.checkbox(root, 'magical', magical), attack = ui.checkbox(root, 'isAttack');
  const condition = ui.field(root, 'condition', {entries:['paralyzed','confused','restrained','poisoned','invisible','blurred','shielded','prone','charmed','frightened','stunned'].map(key => [key,ui.tr('condition.'+key)])});
  const turns = ui.field(root, 'duration', {type:'number', min:1, max:10000, optional:true});
  const repeat = ui.checkbox(root, 'repeatSave'), ability = ui.field(root, 'saveAbility', {entries:ABILITIES.map(key => [key,key.toUpperCase()])});
  const dc = ui.field(root, 'dc', {type:'number', max:1000, optional:true});
  const concentration = ui.field(root, 'concentrationMinimum', {type:'number', max:1000, optional:true});
  const acBonus = ui.field(root, 'acBonus', {type:'number', min:-100, max:100, optional:true});
  const atStart = ui.checkbox(root, 'expiresAtStart');
  const index = ui.field(root, 'conditionNumber', {type:'number', min:1, max:30, optional:true});
  function visible(input, value) { input.closest('label').hidden = !value; }
  function update() {
    const name = kind.value;
    for (const input of [amount, expression]) visible(input, ['damage','heal','maximumHp'].includes(name));
    roll.hidden = !['damage','heal','maximumHp'].includes(name);
    for (const input of [type, attack]) visible(input, name === 'damage');
    visible(magic, name === 'damage' || name === 'condition');
    for (const input of [condition,turns,repeat,ability,dc,concentration,acBonus,atStart]) visible(input, name === 'condition');
    visible(index, name === 'removeCondition');
  }
  kind.addEventListener('change', update); update();
  function read() {
    const result = {kind:kind.value, target:destination.value, reason:reason ?? ui.tr('manualEffect')};
    if (kind.value === 'condition') {
      result.condition = {name:condition.value, magical:magic.checked};
      for (const [key, input] of [['remainingTurns',turns],['concentrationMinimum',concentration],['acBonus',acBonus]]) {
        const value = ui.number(input, true); if (value != null) result.condition[key] = value;
      }
      if (atStart.checked) result.condition.expiresAtStart = true;
      if (repeat.checked) Object.assign(result.condition, {save:{ability:ability.value, dc:ui.number(dc)}, repeatSave:true});
    } else if (kind.value === 'removeCondition') result.index = ui.number(index) - 1;
    else {
      result.amount = ui.number(amount);
      if (kind.value === 'damage') Object.assign(result, {type:type.value, magical:magic.checked, isAttack:attack.checked});
    }
    return result;
  }
  return {root, read};
}
