// Exercise formation controls through the real desktop and dedicated mobile loaders.
export async function checkFormationPanel({app,module,overlay,requestedRosters,check}) {
  const {getRoster}=await import('../../../public/js/battlesim/books/1473/definition.js');
  const {formationEngagedCount}=await import('../../../public/js/battlesim/engines/combat-command/formation-rules.js');
  const el=key=>document.getElementById('sim1473-'+key);
  let run,serial=147300;
  const protectedState={inventory:{keep:['item']},equipment:{keep:'gear'},sim1472:{keep:'existing fight'}};
  const data=()=>run.sim1473;
  const reset=()=>{
    run={startedAt:serial++,path:[1],...structuredClone(protectedState)};
    app.state.playthroughs=[run];app.state.activePtIndex=0;module.render();
    check(run.sim1473===undefined,'Opening formation setup does not write state');
  };
  const editor=side=>[...el('setup').querySelectorAll('details')].find(node=>node.querySelector('summary')?.textContent===(side==='player'?'Your current force':'Enemy force'));
  const field=(side,key,index=0)=>editor(side).querySelectorAll('fieldset')[index].querySelector('[data-stat="'+key+'"]');
  const choose=value=>{el('encounter').value=String(value);el('encounter').dispatchEvent(new Event('change'));};
  const resolve=total=>{el('roll-total').value=String(total);el('resolve-roll').click();};
  function allocate(){
    const fight=data().fight,pending=fight.pending,units=pending.side==='player'?fight.player:fight.enemies;
    const caps=Object.fromEntries(pending.targets.map(key=>[key,formationEngagedCount(units.find(unit=>unit.key===key),Math.max(1,fight.round),fight.config.engagements?.[pending.side]?.[key])]));
    const values=Object.fromEntries(pending.targets.map(key=>[key,0]));let remaining=Math.min(pending.hits,Object.values(caps).reduce((sum,n)=>sum+n,0));
    while(remaining)for(const key of pending.targets)if(remaining&&values[key]<caps[key]){values[key]++;remaining--;}
    for(const [key,value]of Object.entries(values))el('controls').querySelector('[data-unit-key="'+key+'"]').value=value;
    el('apply-casualties').click();
  }
  function drain(total=2){
    for(let i=0;i<100;i++){
      if(data().fight.phase==='roll')resolve(total);
      else if(data().fight.phase==='allocation')allocate();
      else return;
    }
    throw Error('Formation controls did not reach a boundary');
  }
  function cancel(){
    if(!['fighting','paused'].includes(data()?.fight?.status))return;
    el('cancel').click();document.getElementById('confirm-ok').click();
  }
  check(getRoster().length===27&&requestedRosters.has(1473),'Formation catalog came from API');
  let setups=0;
  for(const entry of getRoster()){
    reset();choose(entry.section);
    if(entry.section==='11')field('enemy','count').value='5';
    if(entry.section==='75'){
      field('enemy','count',1).value='2';field('enemy','melee',1).value='5';
      el('chart-friendly-cavalry').value='C';el('chart-enemy-cavalry').value='E';
    }
    if(entry.section==='80')field('enemy','morale').value='8';
    el('start').click();check(data().fight?.config.section===entry.section,'Formation preset starts '+entry.section);
    check(el('encounter').disabled&&el('start').disabled&&field('player','count').disabled,'Formation setup is locked');
    const saved=JSON.stringify(data());module.render();check(JSON.stringify(data())===saved,'Formation render preserves fight');
    drain();
    if(data().fight.status==='fighting'&&data().fight.phase==='ready'){el('begin-round').click();drain();}
    check(data().fight.history.some(event=>event.attacks.length),'Formation preset resolves a real attack '+entry.section);
    check(JSON.stringify([run.inventory,run.equipment,run.sim1472])===JSON.stringify(Object.values(protectedState)),'Formation unrelated state preserved');
    check(JSON.stringify(run.path)==='[1]','Formation never navigates reader');
    check(!overlay.querySelector('.bsim-col-right input,.bsim-col-right select,.bsim-col-right button'),'Formation results contain no controls');
    cancel();setups++;
  }
  check(setups===27,'All 27 formation presets');

  reset();choose('75');el('start').click();
  check(!data().fight,'Missing enemy values do not start a guessed fight');document.getElementById('confirm-ok').click();
  field('enemy','count',1).value='2';field('enemy','melee',1).value='5';el('start').click();
  check(!data().fight,'Missing cavalry charts are not guessed');document.getElementById('confirm-ok').click();

  reset();el('player-chart').value='C';el('enemy-chart').value='D';
  const name=editor('enemy').querySelector('[role="combobox"]');name.value='pikes';name.dispatchEvent(new FocusEvent('focus'));name.dispatchEvent(new Event('input'));
  check(editor('enemy').querySelectorAll('[role="option"]').length>0,'Formation custom autocomplete uses database profiles');
  editor('player').querySelector(':scope > button').click();
  const row=editor('player').querySelectorAll('fieldset')[1];row.querySelector('[role="combobox"]').value='Second unit';
  row.querySelector('[data-stat="count"]').value='2';row.querySelector('[data-stat="melee"]').value='3';
  field('enemy','count').value='5';field('enemy','melee').value='3';
  el('start').click();check(data().fight?.player.length===2,'Custom formation needs no preset');
  el('begin-round').click();resolve(2);resolve(12);check(data().fight.phase==='allocation','Incoming losses ask for explicit allocation');
  const oldApply=el('apply-casualties'),pending=JSON.stringify(data());
  run.sim1473=JSON.parse(pending);module.render();oldApply.click();
  check(JSON.stringify(data())===pending,'Stale casualty button cannot change a reloaded fight');
  allocate();check(data().fight.phase==='ready','Reloaded casualties resume without rerolling');
  check(data().fight.history.at(-1).attacks.length===2,'Reloaded allocation keeps both original rolls');cancel();

  reset();choose('50');el('start').click();const saved=JSON.stringify(data());
  el('cancel').click();app.setCurrentBookId(9999);document.getElementById('confirm-ok').click();
  check(JSON.stringify(run.sim1473)===saved,'Formation confirmation cannot modify another active book');
  app.setCurrentBookId(1473);module.render();cancel();
  const oldStart=el('start');app.state.playthroughs=[{startedAt:serial++,path:[1]}];app.state.activePtIndex=0;
  oldStart.click();check(app.currentPlaythrough().sim1473===undefined,'Formation stale start cannot write another run');
  app.state.playthroughs=[run];app.state.activePtIndex=0;module.render();
}
