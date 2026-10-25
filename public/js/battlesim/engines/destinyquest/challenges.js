import {winterChallenge} from './winters-fury.js';
import {destinyDie} from './damage.js';
import {createDestinyCharacter, destinyCharacterAbilityCounts} from './character.js';

export function beginDestinyChallenge(session, setup, {roster, outcomeId, leif=false, useOptionalAbilities=true} = {}) {
  if (session.fight?.status === 'active' || session.challenge?.status === 'active') throw new RangeError('Finish the active encounter first');
  if (session.fight && !session.character?.outcomeIds?.includes(session.fightId)) throw new RangeError('Record the finished outcome first');
  if (typeof outcomeId !== 'string' || !outcomeId || outcomeId.length>128 || session.history?.some(entry=>entry.id===outcomeId)) throw new RangeError('Choose a new challenge identifier');
  const next=structuredClone(session), character=createDestinyCharacter(next.character);
  if(character.pendingRingDestruction)throw new RangeError('Resolve the lost ring first');
  const context={character, opponents:[], equipment:setup.equipment||character.equipment||{},
    abilities:destinyCharacterAbilityCounts(character,setup.abilities||character.abilities||{},setup.equipment||character.equipment||{})};
  const rules=winterChallenge(context,setup.section,{roster,leif,useOptionalAbilities});
  const attribute=setup.hero?.[rules.attribute];
  if(!Number.isSafeInteger(attribute)||attribute<0||attribute>1000000)throw new RangeError('Enter the challenge attribute');
  if(!Number.isSafeInteger(rules.turns)||rules.turns<1||!Number.isSafeInteger(rules.dice)||rules.dice<1||rules.dice>100)throw new RangeError('Invalid challenge settings');
  next.setup=structuredClone(setup);
  next.character=character;
  next.challenge={id:outcomeId,section:String(setup.section),name:rules.name,rules,attribute,
    status:'active',phase:'ready',turns:0,failures:0,history:[],leif,useOptionalAbilities};
  return next;
}

export function applyDestinyChallengeAction(session, action, {roll=()=>Math.floor(Math.random()*6)+1,timestamp=Date.now()} = {}) {
  const next=structuredClone(session), challenge=next.challenge;
  if(!challenge||challenge.status!=='active')throw new RangeError('No active challenge');
  if(action==='challenge-cancel'){
    if(challenge.turns||challenge.phase!=='ready')throw new RangeError('A challenge with rolled dice cannot be cancelled');
    delete next.challenge;return next;
  }
  if(action==='challenge-roll'){
    if(challenge.phase!=='ready')throw new RangeError('Resolve the saved challenge roll first');
    challenge.dice=Array.from({length:challenge.rules.dice},()=>destinyDie(roll));challenge.phase='rolled';return next;
  }
  if(action!=='challenge-resolve'||challenge.phase!=='rolled')throw new RangeError('Roll the challenge dice first');
  const total=challenge.dice.reduce((sum,face)=>sum+face,0)+challenge.attribute+challenge.rules.rollBonus;
  const success=total>=challenge.rules.threshold;
  challenge.turns++;if(!success)challenge.failures++;
  challenge.history.push({turn:challenge.turns,dice:[...challenge.dice],total,success});
  delete challenge.dice;challenge.phase='ready';
  if(challenge.failures>=challenge.rules.failureLimit||challenge.turns>=challenge.rules.turns){
    challenge.status='finished';challenge.phase='finished';
    challenge.outcome=challenge.failures>=challenge.rules.failureLimit?'failure':'success';
    challenge.destination=challenge.outcome==='success'?challenge.rules.successSection:challenge.rules.failureSection;
    (next.history??=[]).push({id:challenge.id,section:challenge.section,opponents:[challenge.name],
      outcome:challenge.outcome,destination:challenge.destination,timestamp});
  }
  return next;
}
