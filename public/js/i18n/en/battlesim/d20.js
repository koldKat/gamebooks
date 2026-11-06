// English controls shared by independent d20 encounter panels.
const labels={
  title:'D20 Combat',
  rules:'Choose an encounter or enter your own foes. Set current stats, roll initiative, and resolve actions in turn. Positioning, class features, and spell effects remain in your hands.',
  manualStory:'Apply story instructions, codewords, and inventory changes yourself.',
  invalid:'Check the required stats, dice, range, and available actions.',
  player:'Your character',companion:'Companion',companions:'Companions',addCompanion:'Add companion',remove:'Remove',
  name:'Name',hp:'Current HP',maxHp:'Maximum HP',ac:'Armor Class',bonus:'Attack bonus',formula:'Damage dice',damageType:'Damage type',
  attackAbility:'Attack ability',manualModifier:'Enter modifiers manually',magical:'Magical',silvered:'Silvered weapon',
  characterDetails:'Abilities and defenses',strengthScore:'Current Strength score',athletics:'Athletics bonus',
  immunities:'Damage immunities (comma-separated)',resistances:'Damage resistances (comma-separated)',
  vulnerabilities:'Damage vulnerabilities (comma-separated)',conditionImmunities:'Condition immunities (comma-separated)',
  elf:'Elf',undead:'Undead',magicResistance:'Magic resistance',physicalResistance:'Resist nonmagical physical attacks',
  spellSetup:'Prepared spells',availableSlots:'Available spell slots',spell:'Spell',spellLevel:'Slot level',cantrip:'Cantrip',addSpell:'Add spell',
  preset:'Encounter',custom:'Custom opponents',customStats:'Custom opponent damage and abilities',opponent:'Opponent',
  enemyHp:'Opponent HP',enemyBonus:'First attack bonus',count:'Count',failedSave:'Failed the earlier Dexterity save',readiedAttack:'Use the readied opening attack',
  start:'Start encounter',cancel:'Cancel encounter',cancelConfirm:'Cancel this encounter? No victory or defeat will be recorded.',
  ready:'Ready for an encounter',combatant:'Combatant',target:'Target',attack:'Attack',distance:'Distance (ft.)',manualDice:'Manual d20s (comma-separated; blank rolls)',
  advantage:'Advantage',disadvantage:'Disadvantage',useBoon:'Use an advantaged attack',chooseAttack:'Roll printed attack choice',
  initiative:'Roll initiative',startTurn:'Start combatant’s turn',endTurn:'End combatant’s turn',round:'Next round',
  consumeLife:'Consume Life',escape:'Try to escape',arenaGore:'Roll arena hazard',boneFloor:'Check bone-floor movement',
  spells:'Cast a prepared spell',cast:'Cast',resolveSpellHelp:'Resolve the spell using your spell rules. Add each affected target and effect, then apply them together. Utility spells can be resolved with a note.',
  addEffect:'Add effect',spellNote:'Resolution note',resolveSpell:'Apply spell results',cancelSpell:'Cancel unresolved spell',
  combatChecks:'Combat checks',ability:'Ability',dc:'DC',save:'Saving throw',check:'Ability check',
  manualEffects:'Other resolved effects',manualEffect:'Manually resolved combat effect',effect:'Effect',amount:'Amount before defenses',
  rollDamage:'Roll damage',isAttack:'Damage came from an attack',condition:'Condition',duration:'Turns remaining (blank means ongoing)',
  repeatSave:'Repeat saving throw at turn end',saveAbility:'Saving throw ability',concentrationMinimum:'Concentration DC minimum (optional)',
  acBonus:'AC bonus (optional)',expiresAtStart:'Expires at the next turn start',conditionNumber:'Condition number',applyEffect:'Apply effect',
  web:'Destroy webbing',damageWeb:'Apply damage to web',roundNumber:'Round',opening:'Opening attacks',boonRemaining:'Advantaged attacks remaining',
  bonusAttacks:'Bonus attacks remaining',movementLost:'Movement lost this turn (ft.)',dead:'Dead',sourceNotes:'Original combat notes',
  log:'Combat log',history:'Past encounters',passed:'Passed',failed:'Failed',hit:'Hit',miss:'Miss',
};
for(const key of ['str','dex','con','int','wis','cha']){labels['ability.'+key]=key.toUpperCase()+' modifier';labels['save.'+key]=key.toUpperCase()+' saving throw';}
for(let level=1;level<=9;level++)labels['slots.'+level]='Level '+level+' slots';
for(const key of ['acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder'])labels['damage.'+key]=key[0].toUpperCase()+key.slice(1);
for(const key of ['blinded','charmed','deafened','exhaustion','frightened','grappled','incapacitated','invisible','paralyzed','petrified','poisoned','prone','restrained','stunned','unconscious','confused','blurred','quicksand','shielded'])labels['condition.'+key]=key[0].toUpperCase()+key.slice(1);
Object.assign(labels,{'effect.damage':'Damage','effect.heal':'Healing','effect.maximumHp':'Maximum-HP drain','effect.condition':'Apply condition','effect.removeCondition':'Remove condition',
  'status.fighting':'Encounter in progress','status.win':'Victory','status.loss':'Defeat','status.fled':'Escaped','status.cancelled':'Canceled'});
Object.assign(labels, {acrobatics:'Acrobatics bonus',perception:'Perception bonus',survival:'Survival bonus',
  aquatic:'Aquatic creature',opportunityAttack:'Opportunity attack',stationaryTarget:'Target is standing absolutely still',
  attemptWildShot:'Try a wild shot if the location check fails',awarenessSkill:'Detect the incoming attack using',
  'event.targetLocation':'Locate target','event.defenderAwareness':'Detect incoming attack','event.camouflage':'Mirror camouflage'});
Object.assign(labels, {priorEnemyDamage:'Damage already dealt to the first opponent',corrosionAlreadyResolved:'Earlier weapon corrosion is already included',
  printedCombat:'Printed combat tactics',scriptedInvisibility:'Printed opening: Greater Invisibility',printedMageArmour:'Printed Mage Armor (AC already included)',
  displacement:'Use Displacement (bonus action)',currentSpeed:'Current speed (ft.)',combatSpeed:'Update speed',
  printedIllusion:'Printed illusion',castPrintedIllusion:'Cast the printed illusion',attackSpell:'The spell used an attack roll',
  spellAttackBonus:'Original spell attack bonus',originalSpellDamage:'Damage originally inflicted',addDamageComponent:'Add damage component',
  reflectSpell:'Reflect the attack spell',reflectionHelp:'Enter the attack spell damage actually inflicted. If the spell would defeat the reflector, use prepared-spell resolution to apply both results together.',
  movementFeet:'Movement (ft.)',droppedWeaponHelp:'Weapon dropped; picking it up uses an action unless you use a different attack.',
  'condition.displaced':'Displaced','event.scriptedInvisibility':'Printed invisibility opening','event.printedMageArmour':'Printed Mage Armor',
  'event.displacement':'Displacement','event.printedIllusion':'Printed illusion','event.combatSpeed':'Current speed (ft.)','event.reflectSpell':'Spell reflection',
  tryFlee:'Try to flee',escapeSkill:'Escape using','event.sourceEscape':'Escape attempt',
  metalWeapon:'This attack uses a metal weapon',douse:'Douse fire (action)',touchFire:'Touch the elemental',enterFireSpace:'Enter the target’s space',
  reappear:'Reappear',waterExposure:'Water exposure',waterUnit:'Measure',waterFeet:'Feet traveled through water',waterGallons:'Gallons splashed',water:'Apply water exposure',
  mergedUntilRound:'Absent in the fire until round',darknessDisadvantage:'Attacks have disadvantage from shifting darkness',weaponDamagePenalty:'Damage penalty',
  'condition.burning':'Burning','event.burningDamage':'Burning damage','event.fireContact':'Contact fire damage','event.sourceDamage':'Source damage',
  'event.shiftingDarkness':'Shifting darkness','event.emergeDistance':'Emerged (distance in squares)','event.ignited':'Caught fire',
  'event.weaponCorrosion':'Weapon corrosion','event.mergedIntoFire':'Merged into the fire','event.douse':'Fire doused',
  'event.touchFire':'Touched fire','event.enterFireSpace':'Entered an occupied space','event.water':'Water damage','event.reappear':'Reappeared (distance in squares)'});
const events={attack:'Attack',save:'Saving throw',check:'Ability check',condition:'Condition applied',removeCondition:'Condition removed',
  damage:'Damage',heal:'Healing',maximumHp:'Maximum-HP drain',cast:'Spell prepared',resolveCast:'Spell resolved',cancelCast:'Spell cancelled',
  startTurn:'Turn started',endTurn:'Turn ended',selectAttack:'Printed attack choice',escape:'Escape attempt',webDamage:'Web damage',
  arenaGore:'Arena hazard',boneFloor:'Bone-floor movement',consumeLife:'Consume Life',initiative:'Initiative',round:'New round',
  cancel:'Encounter canceled',flee:'Escaped',fortitude:'Undead Fortitude',concentration:'Concentration',maximumHpDrain:'Life drain',
  strengthDrain:'Strength drain',conditionTurn:'Condition at turn end',invisibilityRoll:'Invisibility',martialFury:'Martial Fury',martialFuryRoll:'Martial Fury roll'};
for(const [key,value]of Object.entries(events))labels['event.'+key]=value;
export default labels;
