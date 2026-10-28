// Tolkien Quest rules. Encounter identities and statistics are loaded from the database.
export const COMBAT_TABLE = Object.freeze([
  [0,0,0,0,0,0,0,0,0,0], [2,1,1,1,0,0,0,0,0,0],
  [4,3,2,2,1,0,0,0,0,0], [6,5,4,3,2,1,0,0,0,0],
  [7,6,5,4,3,2,1,0,0,0], [8,7,6,5,4,3,2,1,1,0],
  [9,8,7,6,5,4,3,2,2,1], ['U',9,8,7,6,5,4,3,2,2],
  ['U','U','U',8,7,7,6,5,4,3], ['K','K','U','U','U','U',8,7,6,5],
  ['K','K','K','K','K','K','U','U','U','U'],
].map(Object.freeze));
export const WEAPONS = Object.freeze({none:{ob:0,damage:0},sword:{ob:0,damage:1},mace:{ob:0,damage:0},spear:{ob:0,damage:0},dagger:{ob:0,damage:-1},warhammer:{ob:-1,damage:2},axe:{ob:0,damage:2},staff:{ob:0,damage:1},greatsword:{ob:-1,damage:3},unarmed:{ob:-2,damage:-3}});
export const ARMOUR = Object.freeze({none:{db:0,running:0,trickery:0,magic:0},leather:{db:1,running:-1,trickery:-1,magic:0},chain:{db:2,running:-2,trickery:-2,magic:-2},plate:{db:3,running:-3,trickery:-3,magic:-3}});
export const MISSILES = Object.freeze({none:null,bow:0,axe:-4,warhammer:-2,dagger:-1,spear:-1,sword:-3,mace:-3});
export const SPELLS = Object.freeze({firebolt:6,shield:4,strength:6,speed:3,calm:5,charm:6,luck:5});
const twoHanded = new Set(['axe','staff','greatsword','bow']);
function integer(value, min=-1000, max=1000000) {
  if (!Number.isSafeInteger(value) || value<min || value>max) throw new RangeError('Invalid Tolkien Quest value');
  return value;
}
export function pick(roll, role='check',context) {
  const result=roll ? roll(role,context) : 2+Math.floor(Math.random()*6)+Math.floor(Math.random()*6);
  return integer(result,2,12);
}
export function bonusPick(raw,bonus,unmodifiedTwo=false) {
  integer(raw,2,12);integer(bonus);return raw===2&&unmodifiedTwo ? 2 : raw+bonus;
}
export function attackResult({ob,db,raw,formula=false,unmodifiedTwo=false,damageBonus=0,doubleDamage=false}) {
  integer(ob);integer(db);integer(raw,2,12);integer(damageBonus);
  if(raw===2&&(formula||unmodifiedTwo))return {raw,damage:0,result:0};
  let result,damage=0;
  if(formula){
    damage=Math.max(0,raw-4+ob-db);
    result=damage>=11?'K':damage>=9||raw===12?'U':damage;
  }else{
    const difference=ob-db;
    const row=Math.min(12,raw+Math.max(0,difference-5));
    result=COMBAT_TABLE[row-2][5-Math.max(-4,Math.min(5,difference))];
    damage=typeof result==='number'?result:0;
  }
  if(damage>0)damage=Math.max(0,damage+damageBonus)*(doubleDamage?2:1);
  return {raw,damage,result};
}
export function character(input={}) {
  const h={...input};
  for(const key of ['ob','db','missileOb','running','trickery','magic'])h[key]=integer(h[key]??0);
  h.endurance=integer(h.endurance??30,1);h.damage=integer(h.damage??0,0);
  h.weapon=h.weapon??'none';h.armour=h.armour??'none';h.missile=h.missile??'none';
  if(!Object.hasOwn(WEAPONS,h.weapon)||!Object.hasOwn(ARMOUR,h.armour)||!Object.hasOwn(MISSILES,h.missile))throw new RangeError('Invalid equipment modifier');
  h.shield=Boolean(h.shield);h.spells=[...new Set(h.spells??[])];
  if(h.spells.some(s=>!Object.hasOwn(SPELLS,s)))throw new RangeError('Invalid spell');
  h.itemBonuses=Object.fromEntries(['ob','db','missileOb','meleeOb','meleeDamage','running','trickery','magic'].map(key=>[key,integer(h.itemBonuses?.[key]??0)]));
  h.deviceCharges=integer(h.deviceCharges??0,0,2);return h;
}
function opponent(e) {
  const result={...e,name:String(e.displayName||e.name||'').slice(0,200),ob:integer(e.ob),db:integer(e.db),endurance:integer(e.endurance,1),damage:integer(e.damage??0,0),armour:e.armour??'none'};
  if(!Object.hasOwn(ARMOUR,result.armour))throw new RangeError('Invalid opponent armour');
  if(e.missileOb!=null)result.missileOb=integer(e.missileOb);
  return result;
}
export function modifiers(f, missile=false) {
  if(f.allyActive)return {ob:f.ally.ob,db:f.ally.db,running:0,trickery:0,magic:0};
  const h=f.hero,advanced=(f.mode==='advanced'||f.equipmentModifiers)&&!f.rules?.withoutEquipment,a=advanced?ARMOUR[h.armour]:ARMOUR.none;
  const shield=advanced&&h.shield&&!twoHanded.has(missile?h.missile:h.weapon);
  const b=f.rules?.withoutEquipment?{}:h.itemBonuses??{},r=f.rules??{};
  const weapon=r.sourceWeapon??h.weapon;
  const values={ob:h.ob+((f.mode==='advanced'||f.equipmentModifiers)?WEAPONS[weapon].ob:0)+(b.ob??0)+(b.meleeOb??0)+(r.heroObBonus??0)+(r.meleeObBonus??0),missileOb:h.missileOb+MISSILES[h.missile]+(b.ob??0)+(b.missileOb??0)+(r.heroObBonus??0),db:h.db+a.db+(shield?1:0)+(f.effects.shield?2:0)+(b.db??0)+(r.heroDbBonus??0),running:h.running+a.running+(b.running??0)+(r.runningBonus??0),trickery:h.trickery+(h.armour==='chain'&&h.elvenChain?0:a.trickery)+(b.trickery??0),magic:h.magic+a.magic-(shield?1:0)+(b.magic??0)};
  return h.nightPenalty?Object.fromEntries(Object.entries(values).map(([key,value])=>[key,Math.floor(value/2)])):values;
}
export function beginFight(hero,enemies,options={},roll) {
  if(!Array.isArray(enemies)||!enemies.length||enemies.length>100)throw new RangeError('Invalid opponents');
  const f={version:1,hero:character(hero),enemies:enemies.map(opponent),index:0,status:'active',mode:options.mode??'basic',equipmentModifiers:Boolean(options.equipmentModifiers),formula:Boolean(options.formula),unmodifiedTwo:Boolean(options.unmodifiedTwo),rules:structuredClone(options.rules??{}),effects:{},round:0,playerAttacks:0,heroAttacks:0,meleeAttacks:0,events:[],missileAvailable:true,supportEnabled:Boolean(options.useSupport),surprised:Boolean(options.surprised||options.rules?.surprised),enemyUnaware:Boolean(options.enemyUnaware||options.rules?.enemyUnaware)};
  if(!['basic','advanced'].includes(f.mode))throw new RangeError('Invalid rule system');
  if(f.hero.damage>f.hero.endurance)throw new RangeError('Character is unconscious');
  if(f.rules.foeAware===true)f.enemyUnaware=false;
  if(f.rules.sourceWeapon&&!Object.hasOwn(WEAPONS,f.rules.sourceWeapon))throw new RangeError('Invalid source weapon');
  if(f.rules.withoutEquipment)f.missileAvailable=false;
  if(options.sourceExit){
    if(!['leaveBeforeFight','preFightSurrender'].includes(options.sourceExit)||!f.rules[options.sourceExit])throw new RangeError('No source exit');
    f.status='avoided';f.destination=f.rules[options.sourceExit];return f;
  }
  if(options.immediateEscape){
    const r=f.rules.immediateEscape;if(!r)throw new RangeError('No immediate escape');
    const raw=pick(roll,'check'),total=Math.max(2,Math.min(12,bonusPick(raw,modifiers(f).running,f.unmodifiedTwo)));
    const success=total>=r.successRange[0]&&total<=r.successRange[1];
    f.status='avoided';f.destination=success?r.success:r.failure;f.events.push({type:'sourceCheck',raw,total,destination:f.destination});return f;
  }
  if(f.rules.initialCheck){
    const raw=pick(roll,'check'),destination=f.rules.initialCheck.ranges.find(([low,high])=>raw>=low&&raw<=high)?.[2];
    f.events.push({type:'sourceCheck',raw,total:raw,destination});
    if(destination){f.status='avoided';f.destination=destination;return f;}
  }
  if(f.rules.groupMode==='random-variant'){
    const raw=pick(roll,'selection');f.events.push({type:'selection',raw});
    if(raw===f.rules.noFightRoll){f.status='avoided';return f;}
    const i=f.rules.selectionRanges?.findIndex(([low,high])=>raw>=low&&raw<=high);
    if(i==null||i<0||!f.enemies[i])throw new RangeError('Unmapped encounter result');
    f.enemies=[f.enemies[i]];
  }
  if(options.sourceAction){
    const action=f.rules.sourceActions?.find(a=>a.key===options.sourceAction);
    if(!action||f.hero.usedSourceItems?.includes(action.consumes))throw new RangeError('Source item unavailable');
    if(action.consumes)f.hero.usedSourceItems=[...(f.hero.usedSourceItems??[]),action.consumes];
    if(action.destination){f.status='avoided';f.destination=action.destination;return f;}
    const raw=pick(roll,'check'),total=Math.max(2,Math.min(12,bonusPick(raw,modifiers(f).magic,f.unmodifiedTwo)));
    const removed=action.fleeRanges?.find(([low,high])=>total>=low&&total<=high)?.[2];
    if(removed==null)throw new RangeError('Unmapped source action');
    f.events.push({type:'sourceCheck',raw,total});
    f.enemies=f.enemies.slice(removed);
    if(!f.enemies.length){f.status='avoided';f.destination=action.allFlee;return f;}
  }
  for(const enemy of f.enemies){
    if(!enemy.enduranceFormula)continue;
    const formula=enemy.enduranceFormula,count=integer(formula.pickCount,1,2),add=integer(formula.add,0);
    const numbers=Array.from({length:count},()=>pick(roll,'endurance',f));
    enemy.endurance=add+numbers.reduce((sum,n)=>sum+n,0);
    delete enemy.enduranceFormula;f.events.push({type:'endurance',name:enemy.name,value:enemy.endurance});
  }
  if(options.useAlly){
    if(f.rules.singleStrikeTrial)throw new RangeError('Trial requires your own attacks');
    if(!f.hero.charmedAnimal)throw new RangeError('No charmed animal');
    f.ally=opponent(f.hero.charmedAnimal);f.allyActive=true;delete f.hero.charmedAnimal;
    if(f.ally.damage>f.ally.endurance)throw new RangeError('Animal is unconscious');
  }
  f.stage=!f.rules.singleStrikeTrial&&!f.allyActive&&f.mode==='advanced'&&!f.surprised?'missile':'melee';return f;
}
const current=f=>f.enemies[f.index];
const active=f=>f.status==='active';
function hurt(f,target,result,who) {
  target.damage+=result.damage;f.events.push({type:'attack',who,...result});
  if(result.result==='K'||result.result==='U'||target.damage>target.endurance){
    target.condition=result.result==='K'&&!f.rules.nonlethal?'killed':'unconscious';
    if(target===f.hero)f.status='loss';
    else if(target===f.ally){f.allyActive=false;f.stage='melee';f.events.push({type:'allyDefeated'});}
    else{
      f.index++;
      if(f.index===f.enemies.length){
        f.status=f.noncombatResolution?'calmed':'win';
        if(f.thrownWeapon){f.hero.missile=f.thrownWeapon;if(f.thrownMelee)f.hero.weapon=f.thrownWeapon;}
      }
      else {f.stage=!f.rules.singleStrikeTrial&&!f.allyActive&&f.mode==='advanced'&&!f.surprised?'missile':'melee';f.events.push({type:'next',name:current(f).name});}
    }
  }
}
function enemyAttack(f,roll,missile=false) {
  const enemy=current(f);
  if(missile&&enemy.missileOb==null)return;
  const raw=pick(roll,'enemy',f);if(!active(f))return;
  const owlBonus=f.hero.sourceItems?.includes('owl')?f.rules.owlEnemyObBonus??0:0;
  const result=attackResult({ob:missile?enemy.missileOb:enemy.ob+(f.rules.enemyMeleeObBonus??0)+owlBonus,db:modifiers(f,missile).db,raw,formula:f.formula,unmodifiedTwo:f.unmodifiedTwo});
  hurt(f,f.allyActive?f.ally:f.hero,result,'enemy');
}
function playerAttack(f,roll,missile=false) {
  const h=f.hero,enemy=current(f),m=modifiers(f,missile);let damageBonus=0;
  const weapon=missile?h.missile:f.rules.sourceWeapon??h.weapon,orcSword=weapon==='sword'&&h.orcSlayer&&!f.rules.withoutEquipment&&!f.rules.sourceWeapon;
  if((f.mode==='advanced'||f.equipmentModifiers)&&(!f.rules.withoutEquipment||f.rules.sourceWeapon)&&!f.allyActive)damageBonus=weapon==='bow'?0:weapon==='mace'?(['chain','plate'].includes(enemy.armour)?2:0):WEAPONS[weapon].damage;
  if(!missile&&!f.allyActive&&!f.rules.withoutEquipment)damageBonus+=h.itemBonuses?.meleeDamage??0;
  const bonus=!f.allyActive?((f.meleeAttacks===0?(f.rules.firstPlayerAttackObBonus??0)+(f.effects.sneakAttack??0)+(f.rules.firstAttackAddTrickery?m.trickery:0):0)+(f.rules.singleStrikeTrial?m.trickery:0)):0;
  const raw=pick(roll,'player',f);if(!active(f))return;
  const result=attackResult({ob:missile?m.missileOb:m.ob+bonus,db:enemy.db,raw,formula:f.formula,unmodifiedTwo:f.unmodifiedTwo,damageBonus,doubleDamage:!missile&&!f.allyActive&&f.effects.strength});
  f.playerAttacks++;
  if(!f.allyActive)f.heroAttacks=(f.heroAttacks??f.playerAttacks-1)+1;
  if(!missile&&!f.allyActive)f.meleeAttacks++;
  if(missile&&h.missile!=='bow'){f.thrownWeapon=h.missile;f.thrownMelee=h.weapon===h.missile;f.missileAvailable=false;if(f.thrownMelee)f.hero.weapon='unarmed';f.hero.missile='none';}
  if(!f.allyActive&&orcSword&&enemy.kind==='orc'&&result.damage>0)result.result='K';
  const heroActed=!f.allyActive;
  if(f.rules.singleStrikeTrial&&!['U','K'].includes(result.result)){
    enemy.damage+=result.damage;f.events.push({type:'attack',who:'player',...result});
    f.status='avoided';f.destination=f.rules.trialFailure;f.events.push({type:'trialFailed',defeated:f.index});return;
  }
  hurt(f,enemy,result,heroActed?'player':'ally');
  if(heroActed)afterHeroAttack(f,enemy,roll);
}
function afterHeroAttack(f,enemy,roll){
  const supports=f.rules.supportAttacks??(f.rules.supportAttack?[f.rules.supportAttack]:[]);
  for(const support of supports){
    const first=f.heroAttacks===1&&support.firstAttackOb!=null;
    if(active(f)&&current(f)===enemy&&f.supportEnabled&&(first||f.heroAttacks%support.everyHeroAttacks===0)){
      const raw=pick(roll,'support',f);
      if(active(f))hurt(f,enemy,{...attackResult({ob:first?support.firstAttackOb:support.ob,db:enemy.db,raw,formula:f.formula,unmodifiedTwo:f.unmodifiedTwo}),supportName:support.name},'support');
    }
  }
  if(active(f)&&f.rules.heroAttackLimit&&f.heroAttacks>=f.rules.heroAttackLimit){
    f.status=f.rules.limitStatus??'loss';f.destination=f.rules.limitFailure;f.events.push({type:'attackLimit',limit:f.rules.heroAttackLimit});
  }
}
function strain(f,cost) {
  if(f.hero.deviceCharges>0)f.hero.deviceCharges--;else f.hero.damage+=cost;
  if(f.hero.damage>f.hero.endurance)f.status='loss';
}
function cast(f,name,roll) {
  if(f.allyActive||f.mode!=='advanced'||!f.hero.spells.includes(name))throw new RangeError('Spell not learned');
  const raw=pick(roll,'spell'),success=bonusPick(raw,modifiers(f,true).magic,f.unmodifiedTwo)>6;
  f.events.push({type:'spell',spell:name,raw,success});if(success)strain(f,SPELLS[name]);return success&&active(f);
}
export function round(source,action='attack',roll,options={}) {
  const f=structuredClone(source);f.events=[];
  if(!active(f)||f.stage!=='melee'||f.manualEffect)throw new RangeError('Not a melee round');
  if(!['attack','escape','runPast'].includes(action))throw new RangeError('Invalid melee action');
  if(action!=='attack'){
    if(f.rules.cannotEscape)throw new RangeError('Cannot escape this fight');
    if(f.index<(f.rules.escapeBlockedUntilEnemiesDefeated??0))throw new RangeError('Must defeat the first opponent');
    if(action==='runPast'&&f.mode!=='advanced')throw new RangeError('Advanced action');
    enemyAttack(f,roll);f.round++;
    if(active(f)){
      let speed=0;if(options.speed&&cast(f,'speed',roll))speed=2;
      if(active(f)){
        const raw=pick(roll,'check'),total=bonusPick(raw,modifiers(f).running+(f.rules.escapeBonus??0)+(f.rules.escapePickedAdjustment??0)+speed-(action==='runPast'?2:0),f.unmodifiedTwo);
        const success=total>7;f.events.push({type:'escape',raw,total,success});if(success)f.status='escaped';
      }
    }
    return f;
  }
  const index=f.index;
  if(f.surprised){const animal=f.allyActive;enemyAttack(f,roll);if(active(f)&&(!animal||f.allyActive))playerAttack(f,roll);}
  else{playerAttack(f,roll);if(active(f)&&f.index===index)enemyAttack(f,roll);}
  f.round++;return f;
}
export function missileRound(source,action='shoot',roll) {
  const f=structuredClone(source);f.events=[];
  if(!active(f)||f.mode!=='advanced'||f.stage!=='missile')throw new RangeError('Not a missile opportunity');
  const index=f.index;
  if(action==='shoot'){
    if(f.hero.missile==='none'||!f.missileAvailable)throw new RangeError('No missile weapon');
    playerAttack(f,roll,true);
  }else if(action==='skip'){
    // The player may decline the opening shot.
  }else if(['firebolt','shield','strength','calm','charm'].includes(action)){
    if(['shield','strength'].includes(action)&&f.round!==0)throw new RangeError('Beginning-of-fight spell');
    if(action==='shield'&&f.hero.shield&&!twoHanded.has(f.hero.weapon))throw new RangeError('Normal shield in use');
    if(action==='calm'&&(['undead','monster'].includes(current(f).kind)||(current(f).combinedCount??1)>1))throw new RangeError('Not one normal being');
    if(action==='charm'&&(current(f).kind!=='animal'||(current(f).combinedCount??1)>1))throw new RangeError('Not one normal animal');
    if(cast(f,action,roll)){
      if(action==='firebolt'){
        const damage=Math.max(0,pick(roll,'damage1')+pick(roll,'damage2')+2*modifiers(f,true).magic),enemy=current(f);
        f.playerAttacks++;f.heroAttacks=(f.heroAttacks??f.playerAttacks-1)+1;hurt(f,enemy,{raw:null,result:damage,damage},'player');afterHeroAttack(f,enemy,roll);
      }else if(action==='calm'){
        const raw=pick(roll,'check'),success=bonusPick(raw,modifiers(f,true).magic,f.unmodifiedTwo)>7;
        f.events.push({type:'calm',raw,success});if(success){
          if(f.rules.calmUnambiguous){
            current(f).condition='calmed';f.noncombatResolution=true;f.index++;
            if(f.index===f.enemies.length)f.status='calmed';
            else f.stage='missile';
          }else f.manualEffect='calm';
        }
      }else if(action==='charm'){
        f.hero.charmedAnimal=structuredClone(current(f));f.status='charmed';
      }else f.effects[action]=true;
    }
  }else throw new RangeError('Invalid missile action');
  if(active(f)&&!f.manualEffect&&f.index===index&&!f.enemyUnaware)enemyAttack(f,roll,true);
  if(active(f)&&f.index===index)f.stage='approach';
  f.enemyUnaware=false;f.round++;return f;
}
export function approach(source,runPast=false,roll,options={}) {
  const f=structuredClone(source);f.events=[];
  if(!active(f)||f.stage!=='approach'||f.manualEffect)throw new RangeError('Not closing range');
  if(runPast&&f.rules.cannotEscape)throw new RangeError('Cannot escape this fight');
  if(runPast&&f.index<(f.rules.escapeBlockedUntilEnemiesDefeated??0))throw new RangeError('Must defeat the first opponent');
  let success=false;
  if(runPast){
    let speed=0;if(options.speed&&cast(f,'speed',roll))speed=2;
    if(active(f)){
      const raw=pick(roll,'check'),total=bonusPick(raw,modifiers(f).running+speed-2+(f.rules.escapeBonus??0)+(f.rules.escapePickedAdjustment??0),f.unmodifiedTwo);success=total>7;f.events.push({type:'runPast',raw,total,success});
    }
  }
  if(active(f))f.stage=success?'missile':'melee';return f;
}
export function openingAction(hero,action,{unmodifiedTwo=false,mode='basic',equipmentModifiers=false,rules={},enemyUnaware}={},roll) {
  if(action==='escape'&&rules.cannotEscape)throw new RangeError('Cannot escape this fight');
  if(action==='steal'&&rules.prohibitedActions?.includes('steal-and-take'))throw new RangeError('Cannot steal in this encounter');
  if(action!=='escape'&&enemyUnaware===false)throw new RangeError('Foe must be unaware');
  const h=character(hero),fake={hero:h,mode,equipmentModifiers,effects:{}},m=modifiers(fake);
  const bonus=action==='escape'?m.running: m.trickery;
  if(!['escape','sneakAway','sneakAttack','steal'].includes(action))throw new RangeError('Invalid action');
  const raw=pick(roll,'check'),total=bonusPick(raw,bonus,unmodifiedTwo),success=total>(action==='steal'?8:7);
  return {raw,total,success,surprised:!success&&['escape','steal'].includes(action),firstAttackObBonus:success&&action==='sneakAttack'?m.trickery:0};
}
export function resolveCalm(source,withdraw,roll) {
  const f=structuredClone(source);f.events=[];if(!active(f)||f.manualEffect!=='calm')throw new RangeError('No manual effect');delete f.manualEffect;if(withdraw)f.status='calmed';else enemyAttack(f,roll,true);return f;
}

export function resolveOutcome(source,roll){
  if(active(source)||luckAvailable(source)||source.outcomeResolved)return source;
  const f=structuredClone(source);f.outcomeResolved=true;
  const key=({win:'victory',loss:'defeat',escaped:'escape'})[f.status];
  if(key&&!f.destination){
    const ranges=f.rules[key+'PickRanges'];
    if(ranges){const raw=pick(roll,'check');f.destination=ranges.find(([low,high])=>raw>=low&&raw<=high)?.[2];f.events.push({type:'sourceCheck',raw,total:raw,destination:f.destination});}
    else f.destination=f.rules[key];
  }
  return f;
}

// A number can be changed only at a legal missile opportunity, before its
// consequences are accepted. Replay preserves every other number already picked.
export function luckAvailable(f){return Boolean(f?.lastAction&&!f.lastAction.used&&f.lastAction.rolls.length);}
export function step(source,action,roll,options={}){
  const before=structuredClone(source);delete before.lastAction;
  const numbers=[];
  const capture=(role,context)=>{const raw=pick(roll,role,context);numbers.push({role,raw});return raw;};
  const f=before.stage==='missile'?missileRound(before,action,capture):before.stage==='approach'?approach(before,Boolean(action),capture,options):round(before,action,capture,options);
  if(before.stage==='missile'&&['shoot','skip'].includes(action)&&before.hero.spells.includes('luck')&&numbers.length){
    f.lastAction={before,action,rolls:numbers,used:false};
  }
  return f;
}
export function applyLuck(source,index,roll){
  if(!luckAvailable(source))throw new RangeError('No pending picked number');
  const previous=source.lastAction;integer(index,0,previous.rolls.length-1);
  let cursor=0;
  const replay=(role,context)=>{
    const position=cursor++,old=previous.rolls[position];
    if(position===index){
      if(!context||!active(context))throw new RangeError('Invalid Luck timing');
      const success=cast(context,'luck',roll);
      const raw=success?pick(roll,'replacement'):old.raw;
      context.events.push({type:'luck',old:old.raw,raw,success});return raw;
    }
    if(old){if(old.role!==role)throw new RangeError('Changed roll order');return old.raw;}
    return pick(roll,role,context);
  };
  const f=missileRound(previous.before,previous.action,replay);
  // Do not keep nested snapshots or offer another cast for the same opportunity.
  f.lastAction={used:true,rolls:[]};return f;
}
export function acceptNumbers(source){
  const f=structuredClone(source);f.events=[];
  if(!luckAvailable(f))throw new RangeError('No pending picked number');
  f.lastAction={used:true,rolls:[]};return f;
}
