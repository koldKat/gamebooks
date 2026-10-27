// Printed sequences with branching hits, simultaneous allies, or targets
// without hit points. All opponents, thresholds and routes come from the DB.
import {integer,dice,damage,damageSpec,finish} from './values.js';

const modes=['hit-branch','melee','party','hazard','first-hit','shots','shots-with-guards'];
const abilities=['strength','intelligence','wisdom','constitution','dexterity','charisma'];
export const sequenceTargets=fight=>fight?.enemies.map((enemy,index)=>enemy.hp!==0?index:-1).filter(index=>index>=0)??[];

export function startSequenceFight(hero,enemies,rules,weaponDamage) {
  const config=structuredClone(rules),sequence=config.mechanics.sequence;
  if(!modes.includes(sequence.mode)||!Array.isArray(enemies)||!enemies.length||enemies.length>100)throw new RangeError('Invalid sequence');
  const player={hp:integer(hero.hp,1),maxHp:integer(hero.maxHp,1),attackBonus:integer(hero.attackBonus??0,-100,100),defenceBonus:integer(hero.defenceBonus??0,-100,100),damageReduction:integer(hero.damageReduction??0,0,100)};
  if(player.hp>player.maxHp)throw new RangeError('Hit points exceed maximum');
  for(const ability of abilities)player[ability]=integer(hero[ability],0,100);
  const opponents=enemies.map(enemy=>({
    name:String(enemy.name??'').slice(0,200),
    hp:enemy.hp===null?null:integer(enemy.hp,1),maxHp:enemy.hp,
    toBeHit:enemy.toBeHit===null?null:integer(enemy.toBeHit,3,18),
    attacks:(enemy.attacks??[]).map(attack=>({toHit:integer(attack.toHit,3,18),damage:damageSpec(attack.damage)})),
  }));
  for(const key of ['shotLimit','roundLimit','missesToWin','guardCount','retreatAtHp'])if(sequence[key]!==undefined)integer(sequence[key],1,1000);
  if(sequence.hitAtMost!==undefined)integer(sequence.hitAtMost,3,18);
  if(sequence.heroAttackBonus!==undefined)integer(sequence.heroAttackBonus,-100,100);
  if(sequence.heroLowRoll)integer(sequence.heroLowRoll.atMost,3,18);
  for(const rule of [sequence.heroHitCheck,sequence.enemyHitCheck])if(rule&&!abilities.includes(rule.ability))throw new RangeError('Invalid ability');
  if(sequence.dodgeAbility&&!abilities.includes(sequence.dodgeAbility))throw new RangeError('Invalid dodge ability');
  const allies=structuredClone(sequence.allies??[]);
  if(allies.length>10)throw new RangeError('Too many allies');
  for(const ally of allies){
    integer(ally.toHit,3,18);if(ally.hitsToLose!==undefined)integer(ally.hitsToLose,1,100);
    if(ally.damage)damageSpec(ally.damage);ally.hits=0;
  }
  const noHeroDamage=['shots','shots-with-guards','hazard'].includes(sequence.mode);
  const weapon=noHeroDamage?null:damageSpec(config.heroDamage??weaponDamage);
  if(!noHeroDamage&&opponents.some(enemy=>enemy.hp===null||enemy.toBeHit===null))throw new RangeError('Missing printed combat values');
  if(sequence.mode==='hazard'&&!opponents[0].attacks.length)throw new RangeError('Missing hazard attack');
  if(sequence.mode==='shots-with-guards'&&!opponents[1]?.attacks.length)throw new RangeError('Missing guard attack');
  return {rulesVersion:3,hero:player,startingHp:player.hp,enemies:opponents,rules:config,weaponDamage:weapon,status:'active',round:0,damageDealt:0,damageTaken:0,events:[],destination:null,
    encounter:{allies,misses:0,nextDexterityBonus:0,openingPending:sequence.order==='enemy-opening-then-simultaneous'}};
}

export function sequenceRound(original,{target=0,allyTargets=[],healing=null,action='attack',roll=()=>Math.floor(Math.random()*6)+1}={}) {
  if(original?.rulesVersion!==3||original.status!=='active')throw new RangeError('No active sequence');
  if(action!=='attack'||healing!==null)throw new RangeError('Resolve the printed sequence before healing');
  const fight=structuredClone(original),s=fight.rules.mechanics.sequence,state=fight.encounter;
  fight.events=[];fight.destination=null;
  const route=(status,section)=>{finish(fight,status);fight.destination=section??null;fight.events.at(-1).destination=fight.destination;};
  const check=(ability,bonus=0)=>{
    const values=dice(3,roll),total=values.reduce((a,b)=>a+b,0),extra=ability==='dexterity'?state.nextDexterityBonus:0;
    if(ability==='dexterity')state.nextDexterityBonus=0;
    const passed=total<=fight.hero[ability]+bonus+extra;
    fight.events.push({kind:'check',ability,dice:values,total,passed});return {total,passed};
  };
  const hurtHero=(amount)=>{const lost=Math.min(fight.hero.hp,Math.max(0,amount-fight.hero.damageReduction));fight.hero.hp-=lost;fight.damageTaken+=lost;return lost;};
  const enemyAttack=(index,recipient=null)=>{
    const enemy=fight.enemies[index],attack=enemy.attacks[0];
    if(!attack)throw new RangeError('No printed attack');
    const values=dice(3,roll),total=values.reduce((a,b)=>a+b,-(recipient?0:fight.hero.defenceBonus)),hit=total>=attack.toHit;
    let result={dice:[],amount:0},dodged=false;
    if(hit&&!recipient&&s.enemyHitCheck){
      const dodge=check(s.enemyHitCheck.ability);
      if(dodge.total<s.enemyHitCheck.avoidBelow){dodged=true;state.nextDexterityBonus=s.enemyHitCheck.avoidNextDexterityBonus??0;}
      else result=damage(dodge.passed?s.enemyHitCheck.reducedDamage:attack.damage,roll);
    }else if(hit&&!recipient&&s.dodgeAbility){
      dodged=check(s.dodgeAbility,s.dodgeBonus??0).passed;
      if(!dodged)result=damage(attack.damage,roll);
    }else if(hit&&!recipient)result=damage(attack.damage,roll);
    if(hit&&recipient)recipient.hits++;
    const lost=recipient?0:hurtHero(result.amount);
    fight.events.push({kind:'attack',side:'enemy',target:index,name:enemy.name,dice:values,total,hit:hit&&!dodged,damageDice:result.dice,damage:lost,...(recipient?{recipient:recipient.name,hits:recipient.hits}:{})});
    return {hit:hit&&!dodged,damage:lost};
  };
  const heroAttack=(index,ally=null)=>{
    const enemy=fight.enemies[index],values=dice(3,roll),total=values.reduce((a,b)=>a+b,ally?0:fight.hero.attackBonus+(s.heroAttackBonus??0)+(fight.rules.mechanics.heroAttackBonus??0));
    const hit=total>=(ally?.toHit??enemy.toBeHit);
    if(!ally&&s.heroLowRoll&&total<=s.heroLowRoll.atMost){
      fight.events.push({kind:'attack',side:'hero',target:index,name:enemy.name,dice:values,total,hit:false,damageDice:[],damage:0});route('win',s.heroLowRoll.section);return {hit:false};
    }
    const result=hit?damage(ally?.damage??fight.weaponDamage,roll):{dice:[],amount:0};
    const lost=Math.min(enemy.hp,result.amount);enemy.hp-=lost;fight.damageDealt+=lost;
    fight.events.push({kind:'attack',side:ally?'ally':'hero',target:index,name:ally?.name??enemy.name,dice:values,total,hit,damageDice:result.dice,damage:lost});return {hit,damage:lost};
  };
  const loss=()=>{
    if(!fight.hero.hp){route('loss',s.lossSection??fight.rules.lossSection);return true;}
    // The source lists the one-hit ally route before the two-hit ally route.
    const hurt=state.allies.filter(ally=>ally.hitsToLose&&ally.hits>=ally.hitsToLose).sort((a,b)=>a.hitsToLose-b.hitsToLose)[0];
    if(hurt){route('loss',hurt.lossSection);return true;}return false;
  };
  const won=()=>{
    if(s.retreatAtHp!==undefined&&fight.enemies[0].hp<=s.retreatAtHp){route('win',s.winSection);return true;}
    if(fight.enemies.every(enemy=>enemy.hp===0)){route('win',s.winSection??fight.rules.winSection);return true;}return false;
  };
  if(state.openingPending){
    state.openingPending=false;enemyAttack(0);loss();return fight;
  }
  fight.round++;
  if(s.mode==='hazard'){
    const attack=enemyAttack(0);
    if(loss())return fight;
    if(!attack.hit&&++state.misses>=s.missesToWin)route('win',s.winSection);
    return fight;
  }
  if(['shots','shots-with-guards'].includes(s.mode)){
    if(s.guardAttacksBeforeShot){for(let i=0;i<(s.guardCount??1);i++){enemyAttack(1);if(loss())return fight;}}
    const values=dice(3,roll),total=values.reduce((a,b)=>a+b,0),hit=total<=s.hitAtMost;
    fight.events.push({kind:'shot',name:fight.enemies[0].name,dice:values,total,hit});
    if(hit){route('win',s.hitSection);return fight;}
    if(s.shotLimit&&fight.round>=s.shotLimit){route('draw',s.missSection);return fight;}
    if(s.mode==='shots-with-guards'&&!s.guardAttacksBeforeShot){
      const count=s.guardCountByRound?fight.round:s.guardCount??1;
      for(let i=0;i<count;i++){enemyAttack(1);if(loss())return fight;}
    }
    return fight;
  }
  const available=sequenceTargets(fight);
  if(!available.includes(target))throw new RangeError('Choose an available target');
  const allies=state.allies;
  if(allyTargets.length&&allyTargets.length!==allies.length)throw new RangeError('Choose each ally target');
  const chosen=allies.map((_,index)=>allyTargets[index]??target);
  if(chosen.some(index=>!available.includes(index)))throw new RangeError('Choose available ally targets');
  const simultaneous=['simultaneous','enemy-opening-then-simultaneous'].includes(s.order);
  const heroResult=heroAttack(target);
  if(fight.status!=='active')return fight;
  if(s.mode==='first-hit'&&heroResult.hit){route('win',s.heroHitSection);return fight;}
  if(s.mode==='hit-branch'&&heroResult.hit){
    if(s.heroHitCheck){
      if(check(s.heroHitCheck.ability).passed)route('win',s.heroHitCheck.successSection);
      else if(fight.enemies[target].hp===0)route('win',s.heroHitCheck.failureDefeatedSection);
    }else if(!won())fight.destination=s.heroHitSection;
    return fight;
  }
  for(let i=0;i<allies.length;i++){
    if(simultaneous||fight.enemies[chosen[i]].hp>0)heroAttack(chosen[i],allies[i]);
  }
  if(!simultaneous&&won())return fight;
  for(const index of simultaneous?available:sequenceTargets(fight)){
    let recipient=null;
    if(s.randomEnemyTargets){
      const value=dice(1,roll)[0],name=s.randomEnemyTargets.targets[value-1];
      recipient=allies.find(ally=>ally.name===name)??null;
      fight.events.push({kind:'targetRoll',name:fight.enemies[index].name,dice:[value],recipient:name});
    }
    const result=enemyAttack(index,recipient);
    if(s.mode==='first-hit'&&result.hit){route('loss',s.enemyHitSection);return fight;}
    if(!simultaneous&&loss())return fight;
    if(s.mode==='hit-branch'&&result.damage>0)fight.destination=s.enemyHitSection??null;
  }
  if(loss()||won())return fight;
  if(s.roundLimit&&fight.round>=s.roundLimit)route('draw',s.roundLimitSection);
  return fight;
}
