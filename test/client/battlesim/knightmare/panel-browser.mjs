// Exercise complete graded duels and saved-state guards through the actual lazy-loaded panel.
export async function checkKnightmarePanel({app,module,overlay,requestedRosters,check}) {
  const {getRoster}=await import('../../../../public/js/battlesim/books/1483/definition.js');
  const {ALL_PANEL_OVERLAY_IDS}=await import('../../../../public/js/core/util.js');
  const el=key=>document.getElementById('sim1483-'+key);
  let run,serial=148300;
  const protectedState={inventory:{keep:'silver key'},equipment:{keep:'old sword'},sim1477:{keep:'another fight'}};
  const data=()=>run.sim1483;
  const accept=()=>document.getElementById('confirm-ok').click();
  function reset(player='GREEN',enemy='GREEN'){
    run={startedAt:serial++,path:[1,46,11],...structuredClone(protectedState)};
    app.state.playthroughs=[run];app.state.activePtIndex=0;module.render();
    check(run.sim1483===undefined,'render leaves saved state lazy');
    el('player-grade').value=player;
    const name=overlay.querySelector('[role="combobox"]');name.value='Custom duel';
    overlay.querySelector('[data-stat="lifeForce"]').value=enemy;
  }
  function preserve(){
    check(JSON.stringify([run.inventory,run.equipment,run.sim1477])===JSON.stringify(Object.values(protectedState)),'unrelated state preserved');
    check(JSON.stringify(run.path)==='[1,46,11]','story path unchanged');
    check(!overlay.querySelector('.bsim-col-right input,.bsim-col-right select,.bsim-col-right button'),'controls stay in left column');
    check(!/battlesim(?:1483|\.knightmare)\.[\w.]+/.test(overlay.textContent),'translations loaded');
  }
  const start=()=>{el('start').click();check(data()?.fight?.status==='fighting','duel starts');};
  const roll=die=>{el('die').value=String(die);el('round').click();};
  const restore=()=>{run.sim1483=JSON.parse(JSON.stringify(data()));module.render();};
  check(getRoster().length===1&&requestedRosters.has(1483),'database source preset loaded');
  check(ALL_PANEL_OVERLAY_IDS.includes(overlay.id),'panel mutual exclusion registered');
  let completed=0;
  for(const player of ['GREEN','AMBER','RED'])for(const enemy of ['GREEN','AMBER','RED']){
    reset(player,enemy);start();check(el('player-grade').disabled&&el('luck').disabled&&el('start').disabled,'active setup locked');
    check(overlay.querySelector('[role="combobox"]').disabled,'opponent locked');
    const before=JSON.stringify(data());restore();check(JSON.stringify(data())===before,'reload does not reroll');
    let guard=0;while(data().fight.status==='fighting'&&guard++<3)roll(1);
    check(data().fight.status==='win'&&data().fight.player.lifeForce===player,'all current-grade wins resolve');
    check(data().history.length===1&&data().history[0].outcome==='win','victory recorded once');
    const saved=JSON.stringify(data());module.render();check(JSON.stringify(data())===saved,'completed render awards no duplicate');preserve();completed++;
  }
  reset();const name=overlay.querySelector('[role="combobox"]');name.value='Aspen';
  name.dispatchEvent(new FocusEvent('focus'));name.dispatchEvent(new Event('input',{bubbles:true}));
  const option=overlay.querySelector('[role="option"]');check(option?.textContent.includes(getRoster()[0].opponent.name),'preset suggested');
  option.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));start();check(data().fight.opponent.name===getRoster()[0].opponent.name,'source preset selected');
  const stale=el('round'),before=JSON.stringify(data());restore();stale.click();check(JSON.stringify(data())===before,'detached stale round ignored');
  roll(6);check(data().fight.player.lifeForce==='AMBER','failed roll loses one grade');
  roll(3);check(data().fight.player.lifeForce==='RED','RED remains alive');roll(6);
  check(data().fight.status==='loss'&&data().history.length===1,'third wound ends and records defeat');preserve();

  reset('RED');el('luck').value='2';start();
  const originalRandom=Math.random;let randomCalls=0;Math.random=()=>{randomCalls++;return 0.99;};
  try{
    for(let i=0;i<2;i++){
      el('use-luck').checked=true;el('use-luck').dispatchEvent(new Event('change'));check(el('die').disabled,'luck disables unused die');el('round').click();
      check(data().fight.player.lifeForce==='RED'&&data().fight.luckCharges===1-i,'luck consumed without wounds');restore();
    }
    check(el('use-luck').disabled,'spent luck unavailable');check(randomCalls===0,'luck never rolls');
    roll(1);check(data().fight.status==='win'&&data().history.length===1,'luck duel finishes once');preserve();
    reset();start();while(data().fight.status==='fighting')el('round').click();
    check(randomCalls===3&&data().fight.status==='loss','automatic die runs a complete source duel');
  }finally{Math.random=originalRandom;}

  reset();start();el('die').value='7';const invalid=JSON.stringify(data());el('round').click();
  check(JSON.stringify(data())===invalid,'invalid manual roll changes nothing');accept();
  const state=JSON.stringify(data()),oldRun=run;el('cancel').click();
  const replacement={startedAt:serial++,path:[1]};app.state.playthroughs=[replacement];accept();
  check(replacement.sim1483===undefined&&JSON.stringify(oldRun.sim1483)===state,'delayed confirmation cannot affect another run');
  app.state.playthroughs=[run];module.render();el('cancel').click();app.setCurrentBookId(1484);accept();
  check(JSON.stringify(data())===state,'delayed confirmation cannot affect another book');app.setCurrentBookId(1483);module.render();
  const oldRound=el('round');app.state.playthroughs=[replacement];oldRound.click();check(replacement.sim1483===undefined,'round cannot cross runs');
  app.state.playthroughs=[run];module.render();el('cancel').click();accept();check(data().fight.status==='cancelled','duel can end without outcome XP');preserve();
  return {gradePairings:completed,sourcePresetSelected:true,manualAndAutomaticDice:true,luckChargesExplicit:true,
    jsonReloadStable:true,staleActionsAndConfirmationsRejected:true,unrelatedStateAndStoryPathPreserved:true};
}
