// Exercise the real optional encounter panel through either application loader.
export async function checkBlackRoadPanel({app,module,overlay,requestedRosters,check}) {
  const {getRoster}=await import('../../../public/js/battlesim/books/1472/definition.js');
  const el=key=>document.getElementById('sim1472-'+key);
  let run=app.currentPlaythrough(),serial=147200;
  const data=()=>run.sim1472;
  const protectedValues={inventory:{keep:['shared item']},equipment:{keep:'shared gear'},sim1471:{keep:'other saved fight'}};
  const reset=()=>{
    run={startedAt:serial++,path:[1],...structuredClone(protectedValues)};
    app.state.playthroughs=[run];app.state.activePtIndex=0;module.render();
    el('playerRoll').value='2';el('enemyRoll').value='2';
  };
  const choose=section=>{el('encounter').value=String(section);el('encounter').dispatchEvent(new Event('change',{bubbles:true}));};
  const rows=side=>[...el(side+'Editor').querySelectorAll('.bsim-opponent-row')];
  const set=(side,key,value,index=0)=>{rows(side)[index].querySelector('[data-stat="'+key+'"]').value=String(value);};
  const closeNotice=()=>document.getElementById('confirm-ok').click();
  const cancel=()=>{if(['fighting','awaiting-chart-value','awaiting-losses'].includes(data().fight?.status)){el('cancel').click();closeNotice();}};
  check(getRoster().length===18&&requestedRosters.has(1472),'Black Road database roster');
  const report=overlay.querySelector('.bsim-col-right');
  for(const key of ['result','forces','log','history'])check(report.contains(el(key)),'Report stays in right column '+key);
  check([...overlay.querySelectorAll('.bsim-side-title')].every(heading=>report.contains(heading)),'Report headings stay in right column');
  let setups=0;
  for(const entry of getRoster())for(const variant of entry.variants??[{}]){
    reset();choose(entry.section);
    if(variant.key){el('variant').value=variant.key;el('variant').dispatchEvent(new Event('change',{bubbles:true}));}
    if(entry.playerChart===null){
      check(el('playerChart').value===''&&!el('playerChart').disabled,'Omitted chart has no invented default');
      el('start').click();check(!data().fight,'Omitted chart requires a player choice');closeNotice();
      el('playerChart').value='B';
    }
    check(!el('enemyChart').disabled,'Gift chart choice is editable');
    el('start').click();
    check(data().fight?.config.section===entry.section,'Source preset starts '+entry.section);
    const frozen=JSON.stringify(data());module.render();check(JSON.stringify(data())===frozen,'Active render is inert');
    check(el('encounter').disabled&&el('start').disabled&&el('enemyChart').disabled,'Source setup is locked');
    check(rows('player').every(row=>row.querySelector('[data-stat="count"]').disabled),'Current force locked');
    if(entry.firearms){
      const control=el('firearms'),style=getComputedStyle(control);
      check(overlay.querySelector('.bsim-col-left').contains(control),'Gun control stays in left column');
      check(style.appearance==='none'&&style.backgroundColor!=='rgb(255,255,255)','Guns use shared checkbox theme');
      control.checked=true;
    }else check(!el('firearms'),'No gun control for prohibited encounters');
    el('attack').click();check(data().fight.round===1,'One source round '+entry.section);
    if(entry.firearms)check(data().fight.firearmsUsed,'Source guns enabled '+entry.section);
    check(JSON.stringify([run.inventory,run.equipment,run.sim1471])===JSON.stringify(Object.values(protectedValues)),'Other saved state preserved');
    check(JSON.stringify(run.path)==='[1]','Combat never navigates the reader');
    cancel();setups++;
  }
  check(setups===20,'All twenty source approaches exercised');

  reset();choose(11);el('start').click();el('attack').click();
  check(!data().fight.firearmsUsed,'Guns remain optional');
  el('firearms').checked=true;el('attack').click();
  check(data().fight.firearmsRound===2&&data().fight.history[1].attacks[0].strength===90,'Guns switch at start of later round');
  check(el('firearms').disabled&&el('firearms').checked,'Gun activation cannot be reversed mid-fight');
  cancel();choose(62);
  check(Number(rows('player')[0].querySelector('[data-stat="ordnance"]').value)===6,'Melee setup keeps base value rather than gun strength');
  check(el('enemyChart').value==='E','Gift is not applied automatically');el('enemyChart').value='C';el('start').click();
  check(data().fight.config.enemyChart==='C','Player-selected gift interpretation retained');cancel();

  reset();choose(47);el('playerRoll').value='8';el('enemyRoll').value='8';el('start').click();
  for(let i=0;i<3;i++)el('attack').click();
  check(data().fight.status==='win'&&data().fight.enemyFled===2,'Wolves flee at two survivors');
  check(data().fight.history.at(-1).attacks.length===1,'No wolf return fire after retreat');
  const results=data().history.length;module.render();check(data().history.length===results&&results===1,'Retreat records one victory');
  reset();choose(47);el('start').click();el('firearms').checked=true;el('attack').click();
  check(data().fight.config.playerChart==='B'&&el('playerChart').value==='B','Wolf gunfire changes displayed chart');cancel();

  reset();choose(82);el('playerChart').value='B';set('player','count',6);set('enemy','count',7);
  el('enemyRoll').value='8';el('start').click();el('attack').click();
  check(data().fight.status==='awaiting-chart-value','Original blank cell pauses the rolled enemy attack');
  check(el('attack').disabled&&el('start').disabled&&el('encounter').disabled,'Pending chart result locks combat');
  check(el('log').textContent.includes('blank printed cell')&&!el('log').textContent.includes('null hits'),'Blank result has a readable log');
  check(data().history.length===0,'Pending chart result awards no victory');
  const pending=JSON.stringify(data()),oldApply=el('apply-chart-result');
  oldApply.click();check(JSON.stringify(data())===pending,'Empty manual result is rejected');closeNotice();
  run.sim1472=JSON.parse(pending);module.render();oldApply.click();
  check(JSON.stringify(data())===pending,'Stale blank-result control cannot mutate a replacement fight');
  el('chart-result').value='-1';el('apply-chart-result').click();
  check(JSON.stringify(data())===pending,'Negative manual result is rejected');closeNotice();
  el('chart-result').value='0';el('apply-chart-result').click();
  check(data().fight.status==='fighting'&&data().fight.round===1&&data().fight.enemyExchanges===1,'Manual result resumes same round once');
  check(data().fight.history.length===1&&data().fight.history[0].attacks.length===2,'Manual result preserves already-rolled attack');
  check(data().fight.history[0].attacks[1].manualChartResult,'Manual result remains explicit in saved log');
  const resolved=JSON.stringify(data());oldApply.click();check(JSON.stringify(data())===resolved,'Resolved stale control remains inert');cancel();

  reset();rows('enemy')[0].querySelector('[role="combobox"]').value='Custom opponent';
  el('enemyEditor').firstElementChild.querySelector(':scope > button').click();
  check(rows('enemy').length===2,'Custom encounters allow multiple opponent groups');
  for(let i=0;i<2;i++){set('enemy','count',1,i);set('enemy','ordnance',1,i);}
  el('playerChart').value='B';el('enemyChart').value='D';el('playerRoll').value='12';el('start').click();el('attack').click();
  check(data().fight.config.section==='custom'&&data().fight.status==='win','Custom fight works without a preset');
  check(data().fight.enemies.length===2&&data().history.length===1,'Custom result records once');

  reset();el('start').click();const frozen=JSON.stringify(data());el('cancel').click();app.setCurrentBookId(9999);closeNotice();
  check(JSON.stringify(run.sim1472)===frozen,'Stale cancellation after book switch is inert');
  app.setCurrentBookId(1472);module.render();cancel();
  app.state.playthroughs=[{startedAt:serial++,path:[1]}];app.state.activePtIndex=0;
  el('start').click();check(app.currentPlaythrough().sim1472===undefined,'Stale start cannot mutate a different run');
  app.state.playthroughs=[run];app.state.activePtIndex=0;module.render();
}
