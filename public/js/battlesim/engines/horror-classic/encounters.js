// Resolve encounter-specific combat checks without story travel or invented opponent stats.
import {ready, finish, completeStrike, inflictDamage} from './core.js';
import {fighter, number, rollDice} from './math.js';

function record(fight,event) {
  fight.events.push(event);
  fight.events=fight.events.slice(-160);
}

export function breakOff(input) {
  ready(input);
  if (!input.enemies.some(enemy=>enemy.rules.allowBreakOff)) {
    throw new RangeError('This encounter does not allow an unconditional break-off.');
  }
  const fight=structuredClone(input);
  fight.outcome='escaped';
  record(fight,{kind:'source-condition',condition:'break-off',destinationManual:true});
  return finish(fight);
}

export function resolveAttackMode(input,{mode,countCurrentRound,note}={}) {
  if (input?.outcome || input?.pending?.kind!=='attack-mode'
      || !['electric','wrap','both'].includes(mode) || !String(note || '').trim()) {
    throw new RangeError('Record a ruling for the overlapping attack modes.');
  }
  if (mode!=='electric' && typeof countCurrentRound!=='boolean') {
    throw new RangeError('Choose whether the wrapping round counts toward the three-round limit.');
  }
  const fight=structuredClone(input),pending=fight.pending,enemy=fight.enemies[pending.enemyIndex];
  const recipient=pending.targetAllyIndex==null?fight.player:fight.allies[pending.targetAllyIndex];
  if (mode!=='electric') {
    recipient.status.wrapSourceIndex=pending.enemyIndex;
    const rounds=number(enemy.rules.wrapRounds,1,100);
    recipient.status.wrapLastRound=fight.round+rounds-(countCurrentRound?1:0);
  }
  fight.pending=null;
  record(fight,{kind:'manual-ruling',enemy:enemy.name,note:String(note).trim().slice(0,500),
    mode,wrapLastRound:recipient.status.wrapLastRound});
  return completeStrike(fight,{actor:'enemy',enemyIndex:pending.enemyIndex,
    targetAllyIndex:pending.targetAllyIndex,roll:pending.roll,score:pending.score,
    damage:mode==='wrap'?0:number(enemy.rules.electricDamage),effects:[]},'damage-first');
}

export function startMachine({player,role,name='Mechanical opponent',section='custom',options={},rules}={}) {
  if (!['harker','dracula','monster','doctor'].includes(role)) throw new RangeError('Choose a role.');
  const stopRoll=number(rules?.machineStopRoll,2,12),damage=number(rules?.machineDamage);
  if (!Number.isInteger(stopRoll)) throw new RangeError('Enter the printed mechanical stop roll.');
  return {rulesVersion:1,section:String(section),role,player:fighter(player,{player:true}),
    enemies:[{name:String(name).slice(0,200),rules:{machine:true,machineStopRoll:stopRoll,machineDamage:damage},status:{}}],allies:[],
    options:structuredClone(options),special:{kind:'machine'},round:1,roundActions:0,
    outcome:null,pending:null,events:[]};
}

export function machineStrike(input,{actor,total}={},die) {
  ready(input);
  if (input.special?.kind!=='machine' || !['player','enemy'].includes(actor)) {
    throw new RangeError('Choose an attacker in the mechanical encounter.');
  }
  const fight=structuredClone(input),roll=rollDice(2,die,total);
  let damage=0;
  const score=roll.total+(actor==='player'?number(fight.options.luckBonus ?? 0,0,2):0);
  if (actor==='player' && score===fight.enemies[0].rules.machineStopRoll) fight.outcome='win';
  else if (actor==='enemy' && roll.total>=6) damage=inflictDamage(fight,fight.player,fight.enemies[0].rules.machineDamage);
  fight.roundActions++;
  record(fight,{kind:'machine-strike',actor,roll,score,damage,playerLife:fight.player.lifePoints});
  return finish(fight);
}

export function enemyShot(input,{enemyIndex=0,total}={},die) {
  ready(input);
  const fight=structuredClone(input),enemy=fight.enemies[enemyIndex];
  if (!enemy?.rules.singleFatalShot || enemy.status.shotUsed || enemy.withdrawn || enemy.lifePoints<=0) {
    throw new RangeError('Choose an opponent with an unused single shot.');
  }
  const roll=rollDice(2,die,total);
  enemy.status.shotUsed=true;
  if (roll.total>=enemy.rules.singleFatalShot) fight.player.lifePoints=0;
  fight.roundActions++;
  record(fight,{kind:'single-shot',enemy:enemy.name,roll,hit:fight.player.lifePoints<=0});
  return finish(fight);
}
