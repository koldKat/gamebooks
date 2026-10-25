import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createDestinySession,beginDestinySession,applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';
const source=readFileSync(new URL('../../../server/db/xp.js',import.meta.url),'utf8');
const registry=source.slice(source.indexOf('const SIM_HISTORY_KEYS ='),source.indexOf('function processStateXp('));
const start=source.indexOf('    for (const simKey of SIM_HISTORY_KEYS) {');
const end=source.indexOf('\n  }\n\n  // Award every increase',start);
const awards=(oldSession,newSession)=>{
  assert(start>0&&end>start);const result=[];
  runInNewContext(registry+'\n'+source.slice(start,end),{oldPt:{sim1285:oldSession},newPt:{sim1285:newSession},userId:123,awardXp:(...args)=>result.push(args)});
  return result;
};
const finish=(session=createDestinySession(),id='first',lose=false)=>{
  const hero={speed:lose?0:30,brawn:30,armour:0,health:lose?1:100};
  let s=beginDestinySession(session,{hero,opponents:[{speed:10,brawn:30,armour:0,health:1}]},{outcomeId:id});
  s=applyDestinySessionAction(s,'start-round',{target:0});
  s=applyDestinySessionAction(s,'roll-speed',{}, {roll:()=>1});
  s=applyDestinySessionAction(s,'resolve-speed');s=applyDestinySessionAction(s,'roll-damage',{}, {roll:()=>1});
  s=applyDestinySessionAction(s,'resolve-damage');
  return applyDestinySessionAction(s,'record-outcome',{}, {timestamp:1234});
};
test('recorded wins and losses reach the actual server XP loop',()=>{
  const win=finish(),loss=finish(createDestinySession(),'loss',true);
  assert.deepEqual(awards(null,win),[[123,'battlesim_win','sim1285:1234']]);
  assert.deepEqual(awards(null,loss),[[123,'battlesim_loss','sim1285:1234']]);
  assert.equal(win.history[0].timestamp,1234);assert.equal(win.history[0].ts,1234);
});
test('same-millisecond outcomes get distinct reward references and saves never repeat XP',()=>{
  const first=finish(),second=finish(first,'second');assert.equal(second.history[1].ts,1235);
  assert.deepEqual(awards(first,second),[[123,'battlesim_win','sim1285:1235']]);
  assert.deepEqual(awards(second,JSON.parse(JSON.stringify(second))),[]);
  const repeated=applyDestinySessionAction(second,'record-outcome',{}, {timestamp:9999});assert.deepEqual(repeated.history,second.history);
});
test('challenge results and an unfinished battle do not earn combat XP',()=>{
  assert.deepEqual(awards(null,{history:[{outcome:'success',timestamp:1234},{outcome:'failure',timestamp:1235}]}),[]);
  const active=beginDestinySession(createDestinySession(),{hero:{health:100},opponents:[{health:1}]},{outcomeId:'active'});
  assert.deepEqual(awards(null,active),[]);
});
