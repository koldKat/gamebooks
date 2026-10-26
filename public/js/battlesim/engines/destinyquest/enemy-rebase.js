const clone=value=>structuredClone(value);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fields=['abilities','used','equipment','character','abilityQuota','abilityGrantSources','portableShieldHealth','phantomHealth','crystalArmour','clearedCurses','sweetSpot','opponentFaceCounts'];
const numeric=['health','maxHealth','speed','brawn','magic','armour'];

export function mirrorDestinyEnemyEffect(effect,origin,index){
  const copy={...clone(effect),enemyOrigin:origin};
  if(effect.target===index)copy.target='hero';
  else if(effect.target==='hero'&&effect.kind!=='stat')copy.target=0;
  else if(effect.hero===false)copy.hero=true;
  else return null;
  if(copy.dispelOnDoubles)copy.dispelBy=effect.dispelBy==='opponent'?'hero':'opponent';
  return copy;
}

export function captureDestinyEnemyBaseline(fight){
  const baseline={hero:clone(fight.hero),enemy:clone(fight.opponents[fight.encounter.enemyAbsorption.target]),effects:clone(fight.effects),encounter:clone(fight.encounter)};
  for(const field of fields)if(fight[field]!==undefined)baseline[field]=clone(fight[field]);
  return baseline;
}

function mergeChanges(target,previous,current){
  for(const key of new Set([...Object.keys(previous||{}),...Object.keys(current||{})])){
    if(equal(previous?.[key],current?.[key]))continue;
    if(current?.[key]===undefined)delete target[key];else target[key]=clone(current[key]);
  }
}

// Retain native costs, raw-roll reactions and table results, while merging
// changes made by the real player since this opponent action paused.
export function rebaseDestinyEnemyPending(fight,pending,heroStats){
  const base=pending.baseline;if(!base)return pending;
  const view=pending.view,proxy=view.opponentProxies[0],enemy=fight.opponents[fight.encounter.enemyAbsorption.target];
  for(const key of numeric){
    proxy.hero[key]=Math.max(0,(proxy.hero[key]??0)+(fight.hero[key]??0)-(base.hero[key]??0));
    view.hero[key]=Math.max(0,(view.hero[key]??0)+(enemy[key]??0)-(base.enemy[key]??0));
  }
  proxy.hero.health=Math.min(proxy.hero.health,proxy.hero.maxHealth);view.hero.health=Math.min(view.hero.health,view.hero.maxHealth);
  proxy.hero.normal=clone(fight.hero.normal);
  for(const key of ['speed','brawn','magic','armour'])view.opponents[0][key]=heroStats[key];
  view.opponents[0].health=proxy.hero.health;view.opponents[0].maxHealth=proxy.hero.maxHealth;
  for(const field of fields){
    if(equal(base[field],fight[field]))continue;
    if(field==='used'||field==='opponentFaceCounts'){
      proxy[field]??={};mergeChanges(proxy[field],base[field],fight[field]);
    }else if(fight[field]===undefined)delete proxy[field];else proxy[field]=clone(fight[field]);
  }
  mergeChanges(proxy.encounter,base.encounter,fight.encounter);delete proxy.encounter.enemyAbsorption;
  // Reindex origins with each baseline. Removing an earlier effect must not
  // change the identity of later effects during a second pending stage.
  const available=new Map();fight.effects.forEach((effect,index)=>{
    const key=JSON.stringify(effect);if(!available.has(key))available.set(key,[]);available.get(key).push(index);
  });
  const origins=new Map(),matched=new Set();base.effects.forEach((effect,index)=>{
    const current=available.get(JSON.stringify(effect))?.shift();
    if(current!==undefined){origins.set(index,current);matched.add(current);}
  });
  const reconcile=effects=>effects.filter(effect=>effect.enemyOrigin===undefined||origins.has(effect.enemyOrigin)).map(effect=>{
    if(effect.enemyOrigin!==undefined)effect.enemyOrigin=origins.get(effect.enemyOrigin);return effect;
  });
  proxy.effects=reconcile(proxy.effects);view.effects=reconcile(view.effects);
  fight.effects.forEach((effect,index)=>{
    if(matched.has(index))return;
    proxy.effects.push({...clone(effect),enemyOrigin:index});
    const mirrored=mirrorDestinyEnemyEffect(effect,index,fight.encounter.enemyAbsorption.target);
    if(mirrored)view.effects.push(mirrored);
  });
  pending.baseline=captureDestinyEnemyBaseline(fight);
  return pending;
}
