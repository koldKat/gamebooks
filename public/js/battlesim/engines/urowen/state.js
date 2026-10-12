import {createUrowenCharacter} from './core.js';
import {createUrowenTransformation,createUrowenPossession,createUrowenMission,createUrowenAppendages} from './forms.js';

const clone=value=>structuredClone(value);
export function compileUrowenEncounters(source) {
  if(source.bookId!==550||source.encounters.length!==82)throw new RangeError('Invalid source specification');
  return source.encounters.map(record=>{
    const {byIndex,...common}=record.enemyRules;
    const enemies=record.rows.map((row,index)=>({
      ...clone(row),maxLife:row.life,rules:{...clone(common),...clone(byIndex?.[index]??{})},
    }));
    if(record.enemyRules.copies) {
      if(enemies.length!==1)throw new RangeError('Invalid repeated enemy');
      const repeated=enemies[0];
      enemies.splice(0,1,...Array.from({length:record.enemyRules.copies},(_,index)=>({
        ...clone(repeated),instance:index,
      })));
    }
    return {section:record.section,enemies,rules:clone(record.encounterRules)};
  });
}
export function createUrowenSimState(character=createUrowenCharacter()) {
  return {character:clone(character),temporary:null,fight:null,history:[],log:[]};
}
export function prepareUrowenEncounter(state,spec,{missionAttribute='SK',unarmedAttribute='STR',firstAttackPenalty=0}={}) {
  if(['prepared','fighting'].includes(state.fight?.status))throw new RangeError('Finish or reset the active fight');
  if(state.contest?.status==='fighting')throw new RangeError('Finish or reset the active contest');
  if(!['STR','SK','MAG'].includes(unarmedAttribute))throw new RangeError('Invalid unarmed attribute');
  if(!Number.isSafeInteger(firstAttackPenalty)||firstAttackPenalty<0||firstAttackPenalty>3)throw new RangeError('Invalid first attack penalty');
  const next=clone(state),mode=spec.rules;
  if(mode.temporaryPossession) {
    if(next.temporary?.stage!=='possession')next.temporary=createUrowenPossession(next.character);
  } else if([115,126].includes(spec.section)) {
    if(next.temporary?.stage!=='possession')next.temporary=createUrowenPossession(next.character);
  } else if(mode.curseStage) {
    if(next.temporary?.stage!==mode.curseStage)next.temporary=createUrowenTransformation(next.character,mode.curseStage);
  } else if(mode.missionLife===100||mode.missionLifeCarry) {
    if(next.temporary?.stage!=='mission')next.temporary=createUrowenMission(next.character,{weaponAttribute:missionAttribute});
  } else {
    next.temporary=null;
  }
  const player=clone(next.temporary?.player??next.character);
  const scene=next.character.nextCombat??{attack:0,damage:0,lifeLoss:0};
  if(!Number.isSafeInteger(scene.attack)||Math.abs(scene.attack)>1||
    !Number.isSafeInteger(scene.damage)||Math.abs(scene.damage)>1||
    !Number.isSafeInteger(scene.lifeLoss)||scene.lifeLoss<0||scene.lifeLoss>3)throw new RangeError('Invalid next-combat modifiers');
  delete next.character.nextCombat;
  if(mode.temporaryLife) {player.life=mode.temporaryLife;player.maxLife=mode.temporaryLife;}
  player.life-=scene.lifeLoss;
  if(mode.playerArmor===false)player.armor=[0,0,0,0,0,0];
  if(mode.bareHandsBonus!==undefined)player.weapon={attribute:unarmedAttribute,dice:1,
    bonus:mode.bareHandsBonus,reroll:[]};
  const enemies=clone(spec.enemies);
  const appendages=enemies[0].rules.appendages;
  next.fight={section:spec.section,player,enemies,target:0,round:0,status:'prepared',
    rules:clone(mode),sceneAttackBonus:scene.attack,sceneDamageBonus:scene.damage,
    appendages:appendages?createUrowenAppendages(appendages.count,appendages.life):[],
    initialArmor:clone(player.armor),appliedArmorLoss:[0,0,0,0,0,0],
    originalCharacter:clone(next.character),effects:firstAttackPenalty?
      [{type:'next-player-attack-penalty',amount:firstAttackPenalty,enemy:0}]:[],monkUsed:false,companionUsed:false,
    fireEdgeUsed:false,lethalMirrorUsed:false};
  return next;
}
export function recordUrowenTemporaryPlayer(state,player) {
  if(!state.temporary)throw new RangeError('No temporary character');
  const next=clone(state);next.temporary.player=clone(player);return next;
}
