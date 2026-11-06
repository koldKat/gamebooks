// Present controls for database-defined printed spell tactics and reflection reactions.
import {DAMAGE_TYPES} from './damage.js';

export function renderSourceSpellControls(parent, ui, {actor, act, manual, safely}) {
  const features = actor.features ?? {};
  if (!features.scriptedInvisibility && !features.displacement && !features.reflectSpell) return;
  const group = ui.group(parent,'printedCombat',true);
  if (features.scriptedInvisibility) {
    const opening = ui.button(group,'scriptedInvisibility',safely(()=>act('scriptedInvisibility')));
    opening.disabled = Boolean(actor.sourceInvisibilityUsed || (actor.turn ?? 0) > features.scriptedInvisibility.turn);
  }
  if (features.printedMageArmour) {
    const armor = ui.button(group,'printedMageArmour',safely(()=>act('printedMageArmour')));
    armor.disabled = !actor.sourceInvisibilityUsed || Boolean(actor.sourceMageArmourCast);
  }
  if (features.displacement) {
    const button = ui.button(group,'displacement',safely(()=>act('displacement')));
    button.disabled = actor.sourceDisplacementReady === false || actor.currentSpeed === 0
      || actor.conditions.some(c=>c.name==='displaced') || actor.sourceDisplacementTurn === (actor.turn ?? 0);
    const speed = ui.field(group,'currentSpeed',{type:'number',max:1000,value:actor.currentSpeed ?? actor.speed?.walk ?? 0});
    ui.button(group,'combatSpeed',safely(()=>act('combatSpeed',{amount:ui.number(speed)})));
  }
  const illusions = features.printedIllusions?.filter(r=>r.stage === (actor.sourceIllusionStage ?? 0)+1) ?? [];
  if (illusions.length) {
    const selected = ui.field(group,'printedIllusion',{entries:illusions.map(r=>[r.key,r.name])});
    const button = ui.button(group,'castPrintedIllusion',safely(()=>act('printedIllusion',{illusion:selected.value,saveDice:manual()})));
    button.disabled = !actor.sourceMageArmourCast;
  }
  if (features.reflectSpell) {
    ui.text(group,ui.tr('reflectionHelp'));
    const isAttack = ui.checkbox(group,'attackSpell');
    const bonus = ui.field(group,'spellAttackBonus',{type:'number',min:-1000,max:1000,value:0});
    const rows = [], list = ui.document.createElement('div');group.append(list);
    const add = () => {
      if (rows.length >= 10) return;
      const row = ui.document.createElement('fieldset');row.className='bsim-opponent-row';list.append(row);
      const amount = ui.field(row,'originalSpellDamage',{type:'number',value:0});
      const type = ui.field(row,'damageType',{entries:DAMAGE_TYPES.map(k=>[k,ui.tr('damage.'+k)]),value:'force'});
      const item = {row,amount,type};rows.push(item);
      ui.button(row,'remove',()=>{rows.splice(rows.indexOf(item),1);row.remove();});
    };
    add();ui.button(group,'addDamageComponent',add);
    const reflect = ui.button(group,'reflectSpell',safely(()=>act('reflectSpell',{attackSpell:isAttack.checked,
      spellAttackBonus:ui.number(bonus),reflectedAttackDice:manual(),
      damageParts:rows.map(row=>({amount:ui.number(row.amount),type:row.type.value}))})));
    const update = () => { reflect.disabled = !isAttack.checked || actor.sourceReflectionTurn === (actor.turn ?? 0); };
    isAttack.addEventListener('change',update);update();
  }
}
