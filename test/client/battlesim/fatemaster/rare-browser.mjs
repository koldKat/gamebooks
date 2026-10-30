// Check source-specific pending actions without replaying the ordinary setup matrix.
export async function checkFatemasterRarePanel({app,module,check}){
 const el=key=>document.getElementById('sim1476-'+key);let run,serial=147650;
 const state=()=>run.sim1476;
 const reset=section=>{
  run={startedAt:serial++,path:[1,9],inventory:{keep:true}};app.state.playthroughs=[run];app.state.activePtIndex=0;module.render();
  el('encounter').value=String(section);el('encounter').dispatchEvent(new Event('change'));
  for(const[key,value]of Object.entries({strength:12,agility:12,maxStrength:12,maxAgility:12,power:12,maxPower:12,damage:10}))el('player-'+key).value=String(value);
 };
 const resolve=n=>{el('dice').value=String(n);el('resolve').click();};
 const attack=n=>{el('dice').value=String(n);el('attack').click();};
 const cancel=()=>{el('cancel').click();document.getElementById('confirm-ok').click();};
 reset(418);el('start').click();attack(2);resolve(12);el('damage-strength').click();
 check(state().fight.pending?.check==='poison','spider hit retains poison check');
 const poison=JSON.stringify(state());run.sim1476=JSON.parse(poison);module.render();resolve(2);check(state().fight.status==='fighting'&&!state().fight.pending,'saved poison check resolves');cancel();
 reset(318);el('start').click();
 if(state().fight.pending?.kind==='enemy')resolve(2);
 attack(12);check(state().fight.pending?.check==='weapon-break','Guardian hit requires weapon check');resolve(2);
 check(state().fight.player.weaponBroken&&state().fight.player.damage===1,'broken weapon falls back to printed fist damage');cancel();
 reset(420);el('counter-dice').value='2';el('start').click();attack(12);attack(12);
 check(state().fight.status==='paused'&&state().fight.pauseReason==='opponent-threshold'&&state().history.length===0,'both-pool threshold pauses without victory XP');
 check(!el('resume')&&el('encounter').disabled,'threshold cannot resume or overwrite its combat state');cancel();
 reset(486);el('player-damage').value='2';el('start').click();el('flee-bank').click();
 let actions=0;while(state().fight.status==='fighting'&&actions++<12){check(state().fight.pending?.kind==='enemy','withdrawal contains only its printed enemy turns');resolve(2);}
 check(state().fight.status==='withdrawn'&&state().history.length===1&&state().history[0].outcome==='withdrawn','bank withdrawal records a non-victory outcome');
 check(state().fight.round===2,'bank withdrawal takes exactly one enemy turn');
 check(JSON.stringify(run.path)==='[1,9]'&&run.inventory.keep===true,'rare encounter actions preserve reader and inventory');
 check(!/battlesim(?:1476|\.fatemaster)\.[\w.]+/.test(document.getElementById('sim1476-overlay').textContent),'rare-action translations loaded');
}
