import {urowenBetPayout,createUrowenAnimalContest,resolveUrowenAnimalRound,
  createUrowenDrinkingContest,resolveUrowenDrinkingRound,
  createUrowenPointContest,resolveUrowenPointRound} from './contests.js';
import {UROWEN_RULES} from './roster.js';
const clone=value=>structuredClone(value);
function available(state) {
  if(['prepared','fighting'].includes(state.fight?.status)||state.contest?.status==='fighting') {
    throw new RangeError('Finish or reset the active encounter');
  }
}
function affordable(state,stake) {
  if(!Number.isSafeInteger(stake)||stake<0||!Number.isSafeInteger(state.character.coins)||state.character.coins<stake) {
    throw new RangeError('Invalid or unaffordable wager');
  }
}
export function stakeUrowenFight(state,stake) {
  if(state.fight?.section!==UROWEN_RULES.contests.fight.section||state.fight.status!=='prepared'||state.fight.wager)throw new RangeError('Fight wager unavailable');
  affordable(state,stake);
  const next=clone(state);next.character.coins-=stake;
  next.fight.wager={stake,paid:false};
  return next;
}
export function settleUrowenFight(state) {
  const fight=state.fight,wager=fight?.wager;
  if(!wager||wager.paid||!['win','loss'].includes(fight.status))return;
  const payout=urowenBetPayout({section:UROWEN_RULES.contests.fight.section,stake:wager.stake,
    selected:'player',winner:fight.status==='win'?'player':'enemy'});
  state.character.coins+=payout.returned;
  wager.paid=true;wager.returned=payout.returned;
}
export function startUrowenAnimalBet(state,section,animals,{stake=0,selected=animals[0]?.name}={}) {
  available(state);affordable(state,stake);
  if(!animals.some(animal=>animal.name===selected))throw new RangeError('Invalid animal');
  urowenBetPayout({section,stake,winner:null,selected});
  const next=clone(state);next.character.coins-=stake;
  next.contest={...createUrowenAnimalContest(section,animals),stake,selected,
    thief:next.character.career==='thief',paid:false};
  return next;
}
export function rollUrowenAnimalBet(state,roll) {
  if(!UROWEN_RULES.contests.animal.sections.includes(state.contest?.section)||state.contest.status!=='fighting'||state.contest.paid) {
    throw new RangeError('No active animal bet');
  }
  const next=clone(state),result=resolveUrowenAnimalRound(next.contest,roll);
  next.contest=result.contest;
  if(next.contest.status==='finished') {
    const payout=urowenBetPayout(next.contest);
    next.character.coins+=payout.returned+payout.extra;
    next.contest.paid=true;result.payout=payout;
  }
  next.log.push({kind:'animal-contest',rolls:result.rolls,damage:result.damage,payout:result.payout});
  next.log=next.log.slice(-150);
  return {state:next,result};
}
export function startUrowenDrinkingBet(state,stake=UROWEN_RULES.contests.drinking.defaultStake) {
  available(state);affordable(state,stake);
  const next=clone(state);next.character.coins-=stake;
  next.contest={...createUrowenDrinkingContest(next.character.maxLife),section:UROWEN_RULES.contests.drinking.section,
    stake,selected:'player',paid:false};
  return next;
}
export function startUrowenPointBet(state,section,stake) {
  available(state);affordable(state,stake);
  urowenBetPayout({section,stake,winner:null,selected:'player'});
  const rules=UROWEN_RULES.contests.point;
  if(!rules.sections.includes(section))throw new RangeError('Invalid points contest');
  const played=state.pointContestsPlayed?.[section]??0;
  if(played>=rules.opponents[section])throw new RangeError('No opponents remaining');
  const next=clone(state);next.character.coins-=stake;
  (next.pointContestsPlayed??={})[section]=played+1;
  next.contest={...createUrowenPointContest(section),stake,selected:'player',paid:false};
  return next;
}
export function rollUrowenPointBet(state,roll) {
  if(!UROWEN_RULES.contests.point.sections.includes(state.contest?.section)||state.contest.status!=='fighting'||state.contest.paid) {
    throw new RangeError('No active points bet');
  }
  const next=clone(state),result=resolveUrowenPointRound(next.contest,roll);
  next.contest=result.contest;
  if(next.contest.status==='finished') {
    const payout=urowenBetPayout(next.contest);
    next.character.coins+=payout.returned;next.contest.paid=true;result.payout=payout;
  }
  next.log.push({kind:'points-contest',rolls:result.rolls,payout:result.payout});
  next.log=next.log.slice(-150);
  return {state:next,result};
}
export function rollUrowenDrinkingBet(state,roll) {
  if(state.contest?.section!==UROWEN_RULES.contests.drinking.section||state.contest.status!=='fighting'||state.contest.paid) {
    throw new RangeError('No active drinking bet');
  }
  const next=clone(state),result=resolveUrowenDrinkingRound(next.contest,roll);
  next.contest=result.contest;
  if(next.contest.status!=='fighting') {
    const payout=urowenBetPayout({...next.contest,winner:next.contest.status==='win'?'player':'enemy'});
    next.character.coins+=payout.returned;next.contest.paid=true;result.payout=payout;
  }
  next.log.push({kind:'drinking-contest',rolls:result.rolls,status:next.contest.status,payout:result.payout});
  next.log=next.log.slice(-150);
  return {state:next,result};
}
