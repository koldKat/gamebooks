// Check the actual Cold Cash Warrior panel through both application lazy loaders.
export async function checkColdCashPanel({app,module,overlay,requestedRosters,check}) {
  const {getRoster}=await import('../../../public/js/battlesim/books/1475/definition.js');
  const el=key=>document.getElementById('sim1475-'+key);
  let run,serial=147500;
  const protectedState={inventory:{keep:['map']},equipment:{keep:'rifle'},sim1474:{keep:'other fight'}};
  const data=()=>run.sim1475;
  const reset=()=>{run={startedAt:serial++,path:[1],...structuredClone(protectedState)};app.state.playthroughs=[run];app.state.activePtIndex=0;module.render();};
  const rows=side=>[...el('setup').querySelectorAll('details')].find(node=>node.querySelector('summary').textContent===(side==='player'?'Your current force':'Enemy force'));
  const field=(side,key)=>rows(side).querySelector('[data-stat="'+key+'"]');
  const choose=key=>{el('encounter').value=String(key);el('encounter').dispatchEvent(new Event('change'));};
  const resolve=total=>{el('roll-total').value=String(total);el('resolve-roll').click();};
  const round=(total=2)=>{el('begin-round').click();for(let n=0;data().fight.phase==='roll'&&n<100;n++)resolve(data().fight.pending.dice===1?Math.min(total,6):total);};
  const cancel=()=>{if(['fighting','paused'].includes(data().fight?.status)){el('cancel').click();document.getElementById('confirm-ok').click();}};
  const setup=(count=100)=>{field('player','count').value=String(count);field('player','ordnance').value='3';field('player','melee').value='8';};
  check(getRoster().length===36&&requestedRosters.has(1475),'Cold Cash database-owned catalog');
  let started=0;
  for(const preset of getRoster()){
    reset();choose(preset.section);setup(preset.section==='7'?4:100);
    if(preset.manualCurrentEnemyCountRequired){field('enemy','count').value='8';el('completed-rounds').value='5';}
    el('start').click();check(data().fight?.config.section===preset.section,'Cold Cash source setup '+preset.section);
    check(el('encounter').disabled&&el('start').disabled&&field('player','count').disabled,'Setup locked during combat');
    const original=JSON.stringify(data());module.render();check(JSON.stringify(data())===original,'Rendering preserves the fight');
    round(12);check(data().fight.round===(preset.manualCurrentEnemyCountRequired?6:1),'Correct initial combat round '+preset.section);
    check(JSON.stringify([run.inventory,run.equipment,run.sim1474])===JSON.stringify(Object.values(protectedState)),'Other state preserved');
    check(JSON.stringify(run.path)==='[1]','Combat does not navigate the reader');
    check(!overlay.querySelector('.bsim-col-right input,.bsim-col-right select,.bsim-col-right button'),'Report has no setup controls');
    cancel();started++;
  }
  check(started===36,'Every source encounter and standalone continuation starts');

  reset();choose('48');setup(24);el('start').click();for(let n=0;n<3;n++)round(2);
  check(data().fight.status==='paused'&&data().fight.round===3,'Cliff combat pauses after three rounds');
  check(data().history.length===0&&!data().fight.recorded,'Checkpoint awards no result or XP');
  check(el('start').disabled&&el('encounter').disabled,'Paused setup remains protected');
  check(el('continue-52')&&el('continue-71'),'Explicit continuation controls');
  const oldContinue=el('continue-71'),snapshot=JSON.stringify(data());run.sim1475=JSON.parse(snapshot);module.render();oldContinue.click();
  check(JSON.stringify(data())===snapshot,'Stale continuation cannot alter a restored fight');
  const enemies=data().fight.enemies[0].count,player=data().fight.player[0].count;el('continue-71').click();
  check(data().fight.enemies[0].count===enemies+5&&data().fight.player[0].count===player&&data().fight.round===3,'Continuation preserves survivors and prior rounds');
  round(2);check(data().fight.history.at(-1).attacks[0].side==='enemy'&&data().fight.history.at(-1).attacks[0].chart==='A','Continuation remains enemy first');
  check(data().fight.history.at(-1).attacks[1].chart==='C','Continuation changes the player chart');cancel();

  reset();choose('76');setup(16);el('start').click();round(2);el('begin-round').click();
  check(data().fight.pending.kind==='flank'&&data().fight.pending.dice===1,'Second-round flank check is explicit');resolve(5);
  check(el('withdraw')&&!el('withdraw').disabled,'Withdrawal can replace firing after the flank check');el('withdraw').click();
  check(data().fight.status==='escaped'&&data().fight.history.at(-1).attacks.length===0,'Withdrawal does not sneak in a shot');
  check(data().history.at(-1).outcome==='escaped','Withdrawal is not recorded as a win');

  reset();choose('79');setup(16);el('start').click();el('begin-round').click();check(data().fight.pending.kind==='flank','Ridgeline checks flank on first round');resolve(6);resolve(2);
  check(data().fight.history.at(-1).attacks[0].chart==='A'&&data().fight.history.at(-1).attacks[0].strength===48,'Flank uses all current men without duplicating them');cancel();

  reset();choose('125');setup(100);field('player','ordnance').value='100';el('start').click();round(12);
  check(data().fight.status==='fighting'&&data().fight.enemies[0].count===0&&data().history.length===0,'Early elimination does not award survival victory');
  round(2);check(data().fight.history.at(-1).attacks.length===0,'Waiting round invents no enemy attack');round(2);
  check(data().fight.status==='survived'&&data().history.length===1,'Three complete rounds produce exactly one result');const finished=JSON.stringify(data());module.render();check(JSON.stringify(data())===finished,'Completed render never re-awards');

  reset();choose('52');setup(9);el('start').click();check(!data().fight,'Missing survivor count does not start an invented enemy force');document.getElementById('confirm-ok').click();
  field('enemy','count').value='3';el('completed-rounds').value='5';el('start').click();round(2);check(data().fight.round===6,'Standalone continuation does not replay previous rounds');cancel();

  reset();choose('28');setup(100);const initiative=[...el('setup').querySelectorAll('label')].find(row=>row.querySelector('span')?.textContent==='Initiative').querySelector('select');initiative.value='enemy';
  el('start').click();el('begin-round').click();check(data().fight.pending.side==='enemy','Ambiguous carrier initiative is an explicit setup choice');cancel();

  reset();setup(8);field('player','chart').value='C';el('start').click();check(data().fight?.config.section==='custom','Custom battle needs no preset');cancel();
  const before=JSON.stringify(run);const staleStart=el('start');app.state.playthroughs=[{startedAt:serial++,path:[1]}];app.state.activePtIndex=0;staleStart.click();check(!app.currentPlaythrough().sim1475,'Stale start preserves switched run');check(JSON.stringify(run)===before,'Old run remains unchanged');
  app.state.playthroughs=[run];app.state.activePtIndex=0;module.render();
}
