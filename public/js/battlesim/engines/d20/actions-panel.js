// Present combat actions and atomic spell resolution for the active encounter.
import {ABILITIES} from './core.js';
import {DAMAGE_TYPES, isDefeated} from './damage.js';
import {createD20ResultForm} from './result-form.js';
import {renderSourceSpellControls} from './source-spell-controls.js';
import {combatActionsRemaining, attackAvailable} from './action-allowance.js';

export function renderD20Actions(parent, ui, fight, {send, memory, onError}) {
  parent.replaceChildren(); if (fight.status !== 'fighting') return;
  if (fight.surrenderOffer === 'offered') {
    ui.text(parent,ui.tr('event.surrenderOffered'));
    for (const kind of ['acceptSurrender','refuseSurrender']) ui.button(parent,kind,() => send({kind}));
    return;
  }
  const actors = [['player',fight.player], ...fight.companions.map((value,i) => ['ally'+i,value]), ...fight.groups.map((value,i) => ['enemy'+i,value])];
  const caption = (key,actor) => actor.name+(key==='player'?'':' '+(Number(key.match(/\d+/)[0])+1));
  const targets = actors.filter(([,actor]) => !actor.withdrawn && !actor.untrackedStoryAlly).map(([key,actor]) => [key,caption(key,actor)]);
  const safely = fn => () => { try { fn(); } catch { onError(); } };
  const pending = actors.find(([, actor]) => actor.pendingCast);
  if (pending) {
    const [key,actor] = pending, effects = [], spell = actor.pendingCast;
    ui.text(parent, spell.spell, 'h4'); ui.text(parent, ui.tr('resolveSpellHelp'));
    const list = ui.document.createElement('div'); parent.append(list);
    ui.button(parent, 'addEffect', safely(() => {
      const row = createD20ResultForm(list, ui, targets, {magical:true, reason:spell.spell, onError}); effects.push(row);
      ui.button(row.root, 'remove', () => { effects.splice(effects.indexOf(row),1); row.root.remove(); });
    }));
    const note = ui.field(parent, 'spellNote', {value:spell.spell});
    const hasReflector = actors.some(([id,value])=>id!==key && value.hp && value.features?.reflectSpell);
    const attackSpell = hasReflector ? ui.checkbox(parent,'attackSpell') : null;
    const spellBonus = hasReflector ? ui.field(parent,'spellAttackBonus',{type:'number',min:-1000,max:1000,value:actor.spellcasting?.attackBonus ?? 0}) : null;
    if (spellBonus) {
      spellBonus.closest('label').hidden = true;
      attackSpell.addEventListener('change',()=>{spellBonus.closest('label').hidden=!attackSpell.checked;});
    }
    ui.button(parent, 'resolveSpell', safely(() => send({kind:'resolveCast',actor:key,note:note.value,results:effects.map(row => row.read()),
      attackSpell:attackSpell?.checked ?? false,spellAttackBonus:attackSpell?.checked ? ui.number(spellBonus) : undefined})));
    ui.button(parent, 'cancelSpell', safely(() => send({kind:'cancelCast',actor:key,note:ui.tr('cancelSpell'),results:[]})));
    return;
  }
  const active = actors.filter(([, actor]) => !isDefeated(actor));
  const opening = fight.openingAttacks[0];
  memory.actor = opening ?? (active.some(([key]) => key === memory.actor) ? memory.actor : active[0][0]);
  const actorField = ui.field(parent, 'combatant', {entries:active.map(([key,actor]) => [key,caption(key,actor)]),value:memory.actor});
  const actor = actors.find(([key]) => key === memory.actor)[1];
  const rules = fight.opponent.contextRules;
  const actionsRemaining = combatActionsRemaining(fight, memory.actor, actor);
  if (actionsRemaining != null) ui.text(parent, ui.tr('remainingActions')+' '+actionsRemaining);
  if (!targets.some(([key]) => key === memory.target) || memory.target === memory.actor) {
    memory.target = targets.find(([key]) => key.startsWith('enemy') !== memory.actor.startsWith('enemy'))[0];
  }
  const target = ui.field(parent, 'target', {entries:targets,value:memory.target});
  const last = fight.events.at(-1);
  if (last?.kind === 'selectAttack' && last.actor === memory.actor && last.selection) memory.attack = last.selection.attackIndex;
  const openingIndex = opening === memory.actor ? fight.opponent.options?.openingAttackIndex : undefined;
  const mustDrain = actor.features?.abilityDrain && actor.abilityDrainReady !== false;
  const listedAttacks = mustDrain ? [] : actor.attacks.flatMap((value,i) =>
    (openingIndex == null || openingIndex === i) && (value.maxUses == null || (actor.attackUses?.[i] ?? 0) < value.maxUses)
    && (!actor.smothering || actor.features.smother.attackIndices[0] !== i)
    && (!actor.features?.printedTurn || actor.printedTurnRound === fight.round && actor.printedTurnChoice === i)
    && attackAvailable(fight, memory.actor, actor, i) ? [[String(i),value.name]] : []);
  const attackValue = listedAttacks.find(([index]) => Number(index) === memory.attack)?.[0] ?? listedAttacks[0]?.[0];
  const attack = ui.field(parent, 'attack', {entries:listedAttacks,value:attackValue});
  const distance = ui.field(parent, 'distance', {type:'number',value:memory.distance ?? 5});
  const dice = ui.field(parent, 'manualDice', {optional:true});
  const ranged = rules?.manualRangedAttack && !memory.actor.startsWith('enemy')
    ? ui.checkbox(parent,'rangedAttack',memory.rangedAttack ?? false) : null;
  const rolledDamage = rules?.printedEnemyDamage && memory.actor.startsWith('enemy')
    && actor.attacks.some(attack => attack.damage.some(part => part.fixed != null))
    ? ui.checkbox(parent,'rollEnemyDamage',memory.rollEnemyDamage ?? false) : null;
  ranged?.addEventListener('change', () => { memory.rangedAttack=ranged.checked; });
  rolledDamage?.addEventListener('change', () => { memory.rollEnemyDamage=rolledDamage.checked; });
  const advantage = ui.checkbox(parent, 'advantage'), disadvantage = ui.checkbox(parent, 'disadvantage');
  const charge = actor.encounterAdvantageCharges ? ui.checkbox(parent, 'useBoon') : null;
  const selectedTarget = actors.find(([key]) => key === memory.target)?.[1];
  const reactor = actors.find(([key,value]) => {
    const rule = value.features?.armorReaction;
    return rule && key.startsWith('enemy') === memory.target.startsWith('enemy') && !isDefeated(value)
      && value.armorReactionReady !== false && value.armorReactionRound !== fight.round
      && (!rule.targetKeys || rule.targetKeys.includes(selectedTarget?.key));
  });
  const defend = reactor ? ui.checkbox(parent,'useArmorReaction') : null;
  if (defend) ui.text(parent,reactor[1].features.armorReaction.name);
  const reactionDistance = defend && reactor[0] !== memory.target
    ? ui.field(parent,'reactionDistance',{type:'number',value:5,min:0,max:reactor[1].features.armorReaction.range}) : null;
  if (reactionDistance) {
    reactionDistance.closest('label').hidden = true;
    defend.addEventListener('change',()=>{ reactionDistance.closest('label').hidden = !defend.checked; });
  }
  const smite = (actor.printedSmiteRemaining ?? actor.features?.meleeSmite?.charges)
    ? ui.checkbox(parent,'usePrintedSmite') : null;
  const opportunity = rules?.showOpportunityAttack || selectedTarget?.features?.retreatOpportunityDisadvantage || selectedTarget?.features?.camouflage
    ? ui.checkbox(parent, 'opportunityAttack') : null;
  const stationary = selectedTarget?.features?.camouflage ? ui.checkbox(parent, 'stationaryTarget') : null;
  const wildShot = selectedTarget?.features?.targetLocation?.wildShot ? ui.checkbox(parent, 'attemptWildShot') : null;
  const awareness = actor.features?.defenderAwareness
    ? ui.field(parent, 'awarenessSkill', {entries:actor.features.defenderAwareness.skills.map(key => [key,ui.tr(key)])}) : null;
  const metal = selectedTarget?.features?.firstSuccessfulHitCorrosion && !fight.sourceCorrosionResolved
    ? ui.checkbox(parent, 'metalWeapon') : null;
  actorField.addEventListener('change', () => { memory.actor=actorField.value; memory.target=null; memory.attack=0; renderD20Actions(parent,ui,fight,{send,memory,onError}); });
  target.addEventListener('change', () => { memory.target=target.value; renderD20Actions(parent,ui,fight,{send,memory,onError}); });
  attack.addEventListener('change', () => { memory.attack=Number(attack.value); });
  distance.addEventListener('change', () => { memory.distance=Number(distance.value); });
  const manual = () => {
    if (!dice.value.trim()) return undefined;
    const values = dice.value.split(',').map(value => Number(value.trim()));
    if (!values.length || values.some(value => !Number.isSafeInteger(value)||value<1||value>20)) throw new RangeError(ui.tr('invalid'));
    return values;
  };
  const act = (kind, extra = {}) => send({kind,actor:actorField.value,target:target.value,...extra});
  const attackButton = ui.button(parent, 'attack', safely(() => {
    const values=manual(); act('attack',{attackIndex:Number(attack.value),distance:ui.number(distance),
      dice:values,saveDice:values,advantage:advantage.checked,disadvantage:disadvantage.checked,useAdvantageCharge:charge?.checked??false,
      rangedAttack:ranged?.checked,rollEnemyDamage:rolledDamage?.checked,
      useArmorReaction:defend?.checked,reactionDistance:reactionDistance && defend.checked ? ui.number(reactionDistance) : undefined,
      usePrintedSmite:smite?.checked,
      opportunity:opportunity?.checked??false,targetStationary:stationary?.checked??false,
      attemptWildShot:wildShot?.checked??false,awarenessSkill:awareness?.value,metalWeapon:metal?.checked??false});
  }));
  attackButton.disabled = (!actor.hp && actor.zeroRecoveryTurn == null) || !listedAttacks.length || actor.sourceMergedUntilRound != null
    || selectedTarget?.sourceMergedUntilRound != null || selectedTarget?.features?.protectedWhilePlayerActive && fight.player.hp > 0;
  if (mustDrain) {
    const scores = ABILITIES.filter(key => selectedTarget?.abilityScores?.[key] > 0);
    const ability = ui.field(parent, 'drainAbility', {entries:scores.map(key => [key,ui.tr('abilityScore.'+key)])});
    const drain = ui.button(parent, 'abilityDrain', safely(() => act('abilityDrain', {
      ability:ability.value, distance:ui.number(distance), dice:manual(),
    })));
    drain.disabled = !scores.length || actionsRemaining === 0;
    if (!scores.length) ui.text(parent,ui.tr('enterDrainScores'));
  }
  const bonusSpent = actor.specialBonusRound === fight.round;
  if (actor.untrackedStoryAlly && actor.features?.storySupport) {
    const support = actor.features.storySupport;
    const heal = ui.button(parent,'allyHealing',safely(()=>act('allyHealing',{dice:manual()})));
    heal.disabled = actionsRemaining === 0;
    const edition = support.boon === 'barkskin'
      ? ui.field(parent,'barkskinEdition',{entries:[['16','2014'],['17','2024']],value:memory.barkskinEdition ?? '16'}) : null;
    edition?.addEventListener('change',()=>{memory.barkskinEdition=edition.value;});
    const boon = ui.button(parent,support.boon,safely(()=>act('allyBoon',{barkskinAc:edition ? Number(edition.value) : undefined})));
    boon.disabled = actionsRemaining === 0;
    if (fight.player.conditions.some(item => item.storyAllyBoon === memory.actor)) {
      ui.button(parent,'endAllyBoon',safely(()=>act('endAllyBoon')));
    }
  }
  if (selectedTarget?.features?.defeatedByDispel && memory.actor === 'player') {
    const dispel = ui.button(parent,'dispelOpponent',safely(()=>act('dispelOpponent')));
    dispel.disabled = fight.successfulDispelStrike?.target !== memory.target
      || fight.successfulDispelStrike?.round !== fight.round;
  }
  const recovery = actor.features?.focusedRecovery;
  const terrain = recovery ? ui.checkbox(parent,'naturalTerrain', memory.naturalTerrain ?? true) : null;
  terrain?.addEventListener('change',()=>{ memory.naturalTerrain=terrain.checked; });
  if (recovery && !actor.conditions.some(item => item.name === 'focusedRecovery')) {
    const renew = ui.button(parent,'renewRecovery',safely(()=>act('renewRecovery')));
    renew.disabled = bonusSpent || actor.recoveryLostRound === fight.round;
  }
  const healingPool = actor.layOnHandsRemaining ?? actor.features?.layOnHands?.pool;
  if (healingPool > 0) {
    const hand = ui.group(parent,'layOnHands');
    const patients = actors.filter(([key,value]) => key.startsWith('enemy') === memory.actor.startsWith('enemy') && !value.dead && !value.withdrawn);
    const patient = ui.field(hand,'target',{entries:patients.map(([key,value])=>[key,caption(key,value)]),value:memory.actor});
    const amount = ui.field(hand,'amount',{type:'number',min:1,max:healingPool,value:1});
    for (const [label,cure] of [['heal',undefined],['curePoison','poisoned'],['cureDisease','diseased']]) {
      if (cure && healingPool < 5) continue;
      const button = ui.button(hand,label,safely(()=>act('layOnHands',{
        target:patient.value,distance:ui.number(distance),amount:cure ? undefined : ui.number(amount),cure,
      })));
      button.disabled = actionsRemaining === 0;
    }
  }
  if (actor.features?.turnInvisibility) {
    const vanish = ui.button(parent,'turnInvisibility',safely(() => act('turnInvisibility')));
    vanish.disabled = bonusSpent || actor.turnInvisibilityReady === false;
  }
  if (actor.features?.demoralizingLaugh) {
    const laugh = ui.button(parent,'demoralizingLaugh',safely(() => act('demoralizingLaugh',{distance:ui.number(distance),dice:manual()})));
    laugh.disabled = bonusSpent;
  }
  const escapingSmother = selectedTarget?.smothering?.target === memory.actor;
  if (actor.features?.smother || escapingSmother) {
    const ability = ui.field(parent,'escapeAbility',{entries:['str','dex'].map(key => [key,ui.tr('abilityScore.'+key)])});
    const kind = escapingSmother ? 'escapeSmother' : 'smother';
    const button = ui.button(parent,kind,safely(() => act(kind,{ability:ability.value,distance:ui.number(distance),dice:manual()})));
    const hits = actor.smotherHitsRound === fight.round ? actor.smotherHits[target.value] : [];
    button.disabled = bonusSpent || !escapingSmother && (actor.smothering != null
      || !actor.features.smother.attackIndices.every(index => hits?.includes(index)));
  }
  if (actor.conditions.some(c => c.name === 'burning')) ui.button(parent,'douse',safely(()=>act('douse')));
  if (selectedTarget?.features?.fireForm?.contactDamage) ui.button(parent,'touchFire',safely(()=>act('touchFire',{distance:ui.number(distance)})));
  if (actor.features?.fireForm?.enterSpaceDamage) ui.button(parent,'enterFireSpace',safely(()=>act('enterFireSpace',{distance:ui.number(distance)})));
  if (actor.sourceMergedUntilRound != null) {
    const reappear = ui.button(parent,'reappear',safely(()=>act('reappear')));
    reappear.disabled = fight.round < actor.sourceMergedUntilRound;
  }
  if (actor.features?.waterSusceptibility) {
    const water = ui.group(parent,'waterExposure'), amount = ui.field(water,'amount',{type:'number',value:0});
    const unit = ui.field(water,'waterUnit',{entries:[['feet',ui.tr('waterFeet')],['gallons',ui.tr('waterGallons')]]});
    ui.button(water,'water',safely(()=>act('water',{amount:ui.number(amount),unit:unit.value})));
  }
  const escapeRule = fight.groups.find(value => value.hp && value.features?.encounterEscape)?.features.encounterEscape;
  if (escapeRule && !memory.actor.startsWith('enemy')) {
    const skill = ui.field(parent,'escapeSkill',{entries:escapeRule.skills.map(key=>[key,ui.tr(key)])});
    ui.button(parent,'tryFlee',safely(()=>act('flee',{escapeSkill:skill.value,dice:manual()})));
  } else if (fight.opponent.contextRules?.retreat === 'opportunity' && !fight.opponent.options?.noRetreat
      && !memory.actor.startsWith('enemy')) {
    const closeToEnemy = ui.checkbox(parent,'withinOpportunityReach');
    ui.button(parent,'tryFlee',safely(()=>act('flee',{withinOpportunityReach:closeToEnemy.checked})));
  }
  if (actor.features?.attackSelection || actor.features?.webSelection || actor.features?.randomAttack || actor.features?.printedTurn) {
    const button = ui.button(parent,actor.features?.printedTurn ? 'rollPrintedAction' : 'chooseAttack',safely(() => act('selectAttack',{
      distance:ui.number(distance), roll:actor.features.randomAttack || actor.features.printedTurn ? manual()?.[0] : undefined,
    })));
    button.disabled = actor.printedTurnRound === fight.round;
    if (button.disabled && actor.printedTurnChoice === 'heal') {
      const heal = ui.button(parent,'resolvePrintedHealing',safely(()=>act('resolvePrintedHealing',{dice:manual()})));
      heal.disabled = actionsRemaining === 0;
    }
  }
  for (const kind of ['initiative','startTurn','endTurn','round']) {
    const button=ui.button(parent,kind,safely(() => act(kind,kind === 'startTurn' && terrain ? {naturalTerrain:terrain.checked} : {})));
    button.disabled=Boolean(opening && ['initiative','startTurn','round'].includes(kind)) ||
      kind === 'startTurn' && (rules?.actionAllowance || actor.features?.zeroHpRecovery || actor.features?.abilityDrain || actor.features?.turnInvisibility || memory.actor === 'player' && fight.opponent.options?.attackPenaltySave)
      && actor.sourceStartRound === fight.round;
  }
  if (memory.actor === 'player' && fight.opponent.options?.attackPenaltySave) {
    const penalty = actor.encounterAttackPenalty;
    if (penalty || !fight.attackPenaltyChecked) {
      const button = ui.button(parent, 'encounterAttackPenaltySave',
        safely(() => act('encounterAttackPenaltySave', {dice:manual()})));
      button.disabled = !!penalty && (actor.turn ?? 0) < penalty.retryTurn;
    }
  }
  if (fight.secondPlayer) {
    const pending = actors.slice(0, 1 + fight.companions.length).filter(([, value]) =>
      !value.hp && value.maxHp && !value.dead && !value.features?.protectedWhilePlayerActive && value.deathSaves?.successes !== 3);
    if (pending.length) {
      const downed = ui.field(parent, 'deathSaveTarget', {entries:pending.map(([key, value]) => [key, caption(key,value)])});
      ui.button(parent, 'deathSave', safely(() => act('deathSave', {actor:downed.value, dice:manual()})));
    }
  }
  if (actor.features?.consumeLife) ui.button(parent,'consumeLife',safely(() => act('consumeLife',{distance:ui.number(distance),dice:manual()})));
  const escapes=actor.conditions.flatMap((value,i) => value.escape?[[String(i),ui.tr('condition.'+value.name)]]:[]);
  if (escapes.length) {
    const selected=ui.field(parent,'condition',{entries:escapes}); ui.button(parent,'escape',safely(() => act('escape',{index:Number(selected.value),dice:manual()})));
  }
  if (fight.opponent.options?.arenaGore) {
    const button=ui.button(parent,'arenaGore',safely(() => act('arenaGore',{dice:manual()}))); button.disabled=fight.arenaGoreRound===fight.round;
  }
  if (fight.groups.some(value => value.features?.boneFloor) && !actor.features?.boneFloor?.immuneToOwnFloor) ui.button(parent,'boneFloor',safely(() => act('boneFloor',{dice:manual()})));
  if (rules?.spellSource === 'items' && actor.itemSpells?.some(item => item.remaining)) {
    const group = ui.group(parent, 'spellItems');
    const spell = ui.field(group, 'spell', {entries:actor.itemSpells.flatMap((item,index) =>
      item.remaining ? [[String(index),item.spell+' · '+ui.tr('spellItem.'+item.source)+' · '+item.remaining]] : [])});
    const hand = ui.checkbox(group, 'oneHandFree');
    const cast = ui.button(group, 'cast', safely(() => act('cast',{itemIndex:Number(spell.value),freeHand:hand.checked})));
    const update = () => { cast.disabled = !hand.checked || actionsRemaining === 0 || !actor.hp; };
    hand.addEventListener('change', update);
    update();
  } else if (rules?.spellSource !== 'items' && actor.spellcasting) {
    const group=ui.group(parent,'spells'), spells=Object.entries(actor.spellcasting.spells).flatMap(([level,names]) => names.map(name => [name,name+' ('+level+')']));
    const spell=ui.field(group,'spell',{entries:spells}), level=ui.field(group,'spellLevel',{type:'number',max:9,value:0});
    const update=()=>{level.value=Object.entries(actor.spellcasting.spells).find(([,names])=>names.includes(spell.value))?.[0]??0;}; spell.addEventListener('change',update); update();
    ui.button(group,'cast',safely(() => act('cast',{spell:spell.value,level:ui.number(level)})));
  }
  if (actionsRemaining != null && !memory.actor.startsWith('enemy')) {
    const group = ui.group(parent, 'combatItems');
    const name = ui.field(group, 'itemName');
    const potion = ui.field(group, 'potionHealing', {optional:true});
    const armor = ui.field(group, 'newArmorClass', {type:'number', max:1000,optional:true});
    const drink = ui.button(group,'drinkPotion',safely(() => act('combatItem',{
      source:'potion',note:name.value,formula:potion.value,
    })));
    const equip = ui.button(group,'swapGear',safely(() => act('combatItem',{
      source:'equipment',note:name.value,armorClass:ui.number(armor,true),
    })));
    drink.disabled = equip.disabled = actionsRemaining === 0 || !actor.hp;
  }
  if (!memory.actor.startsWith('enemy') && memory.target.startsWith('enemy') && selectedTarget?.features?.defeatingAssets) {
    const group = ui.group(parent, 'encounterAssets');
    const select = ui.field(group, 'encounterAsset', {entries:selectedTarget.features.defeatingAssets.map(asset => [asset.id,asset.label])});
    const available = ui.checkbox(group,'assetAvailable');
    const use = ui.button(group,'useEncounterAsset',safely(() => act('encounterAsset',{asset:select.value})));
    use.disabled = true;
    available.addEventListener('change', () => { use.disabled = !available.checked; });
  }
  renderSourceSpellControls(parent,ui,{actor,act,manual,safely});
  const checks=ui.group(parent,'combatChecks'), ability=ui.field(checks,'ability',{entries:ABILITIES.map(key=>[key,key.toUpperCase()])});
  const dc=ui.field(checks,'dc',{type:'number',max:1000,value:rules?.abilityDcDefault ?? ''}), magical=ui.checkbox(checks,'magical');
  for (const kind of ['save','check']) ui.button(checks,kind,safely(()=>act(kind,{ability:ability.value,dc:ui.number(dc),dice:manual(),magical:magical.checked,advantage:advantage.checked,disadvantage:disadvantage.checked})));
  const edits=ui.group(parent,'manualEffects'), edit=createD20ResultForm(edits,ui,targets,{target:target.value,onError});
  ui.button(edits,'applyEffect',safely(()=>send(edit.read())));
  const webs=actors.flatMap(([key,value])=>value.conditions.flatMap((condition,i)=>condition.web?[[key+':'+i,value.name+' · '+ui.tr('condition.restrained')]]:[]));
  if (webs.length) {
    const group=ui.group(parent,'web'), selected=ui.field(group,'target',{entries:webs});
    const amount=ui.field(group,'amount',{type:'number'}), type=ui.field(group,'damageType',{entries:DAMAGE_TYPES.map(key=>[key,ui.tr('damage.'+key)]),value:'slashing'});
    ui.button(group,'damageWeb',safely(()=>{const [key,index]=selected.value.split(':');send({kind:'webDamage',target:key,index:Number(index),amount:ui.number(amount),type:type.value});}));
  }
}
