// Exercise Firelord source variants and saved combat choices through the actual lazy-loaded panel.
export async function checkFirelordPanel({app,module,overlay,requestedRosters,check}) {
  const {getRoster}=await import('../../../../public/js/battlesim/books/1477/definition.js');
  const el=key=>document.getElementById('sim1477-'+key),data=()=>run.sim1477;
  let run,serial=147700;
  const protectedState={inventory:{keep:['silver key']},equipment:{keep:'original'},sim1476:{keep:'existing fight'}};
  const choose=(key,value)=>{el(key).value=String(value);el(key).dispatchEvent(new Event('change'));};
  function reset(section,variant) {
    run={startedAt:serial++,path:[1,96],...structuredClone(protectedState)};
    app.state.playthroughs=[run];app.state.activePtIndex=0;module.render();
    if(section)choose('encounter',section);
    if(variant)choose('variant',variant);
    for(const [key,value]of Object.entries({strength:12,agility:12,maxStrength:12,maxAgility:12,power:12,maxPower:12,damage:4}))el('player-'+key).value=String(value);
  }
  const accept=()=>document.getElementById('confirm-ok').click();
  const cancel=()=>{if(['fighting','paused'].includes(data()?.fight?.status)){el('cancel').click();accept();}};
  const resolve=total=>{el('dice').value=String(total);el('resolve').click();};
  const attack=total=>{el('dice').value=String(total);el('attack').click();};
  const restore=()=>{run.sim1477=JSON.parse(JSON.stringify(data()));module.render();};
  const interpretations=()=>{
    if(!el('disarm-interpretation').closest('label').hidden)el('disarm-interpretation').value='raw-hit';
    if(!el('fury-mode').closest('label').hidden)el('fury-mode').value='once';
  };
  const start=()=>{interpretations();el('start').click();check(data()?.fight,'encounter started');};
  function cast(spell,power=1) {
    el('spell').value=spell;el('spell-power').value=String(power);el('cast').click();
    let count=0;
    while(data().fight.pending?.kind==='enemy'&&count++<3)resolve(2);
    check(data().fight.pending?.kind==='spell-resolve','spell effect waits after opponent responses');
    el('resolve').click();
  }
  function preserved() {
    check(JSON.stringify([run.inventory,run.equipment,run.sim1476])===JSON.stringify(Object.values(protectedState)),'unrelated state preserved');
    check(JSON.stringify(run.path)==='[1,96]','reader path remains manual');
    check(!overlay.querySelector('.bsim-col-right input,.bsim-col-right select,.bsim-col-right button'),'controls remain in left column');
    check(!/battlesim(?:1477|\.fatemaster)\.[\w.]+/.test(overlay.textContent),'source and pending-action translations loaded');
  }
  check(getRoster().length===16&&requestedRosters.has(1477),'full database-owned Firelord catalog loaded');
  let starts=0;
  for(const preset of getRoster())for(const variant of preset.variants??[{key:''}]) {
    reset(preset.section,variant.key);start();
    check(data().fight.section===preset.section,'correct source encounter '+preset.section+'/'+variant.key);
    check(el('encounter').disabled&&el('start').disabled&&el('player-strength').disabled,'active setup locked');
    const before=JSON.stringify(data());module.render();check(JSON.stringify(data())===before,'render preserves fight');
    preserved();cancel();check(data().history.length===0,'cancelled setup awards no outcome');starts++;
  }
  check(starts===28,'every source encounter and variant starts');

  for(const section of [403,54,285]) {
    reset(section);el('start').click();check(!data().fight,'ambiguous rule needs an explicit choice '+section);accept();
    start();cancel();
  }

  reset(254,'sleeping');start();
  check(data().fight.pending.kind==='opening-hit'&&!el('dice'),'automatic opening has no dice control');
  const oldOpening=el('opening-hit'),beforeOpening=JSON.stringify(data());restore();oldOpening.click();
  check(JSON.stringify(data())===beforeOpening,'detached opening action cannot change restored fight');
  el('opening-hit').click();
  check(data().fight.opponents[0].strength===2&&data().fight.opponents[1].strength===6,'automatic opening hits only one wolf');
  preserved();cancel();
  reset(254,'sleeping');el('opening-applied').checked=true;start();
  check(data().fight.pending===null,'already applied opening is not charged again');cancel();

  reset(403);start();attack(10);
  check(data().fight.player.damage===5&&data().fight.player.weaponAttack===1,'Champion sword received');
  check(el('player-damage').value==='5'&&el('player-weaponAttack').value==='1','locked setup displays current swapped weapon');
  check(data().fight.opponents[0].damage===4,'Champion uses actual former player sword damage');
  check(data().fight.phase==='player'&&data().fight.round===1,'sword swap resumes player step');
  restore();attack(12);check(data().fight.events.filter(e=>e.type==='weapon-swap').length===1,'saved sword swap never repeats');
  preserved();cancel();

  reset(148);el('player-damage').value='20';start();attack(12);
  check(data().fight.status==='paused'&&data().fight.pauseReason==='remaining-opponents','one conscious guard pauses for reader');
  check(!el('resume')&&data().history.length===0,'remaining guard is not a victory and cannot be resumed');preserved();cancel();

  reset(380);el('player-agility').value='8';start();cast('healing');
  check(data().fight.pending.kind==='spell-check'&&data().fight.player.power===11,'arena concealment is a paid saved check');
  restore();resolve(8);el('resolve').click();
  check(data().fight.status==='fighting'&&data().fight.pending===null,'successful concealment completes Healing');
  el('spell').value='healing';el('cast').click();resolve(12);el('damage-agility').click();el('resolve').click();
  check(data().fight.player.agility===5,'concealment uses Agility after opponent damage');
  resolve(6);check(data().fight.status==='paused'&&!el('resume')&&data().history.length===0,'detected casting pauses without a battle loss');cancel();

  reset(482);start();resolve(2);cast('bolt',3);
  check(data().fight.player.power===9&&data().fight.pending===null,'chest grip fails paid Bolt without damage dice');
  check(data().fight.opponents[0].strength===6,'failed Bolt cannot damage chest');preserved();cancel();

  reset(419);el('player-damage').value='1';el('player-power').value='4';start();attack(12);
  check(data().fight.phase==='player'&&data().fight.round===1,'repeat attack has no premature flame');
  attack(8);check(data().fight.pending.source==='flame'&&data().fight.pending.amount===1,'one flame damage per completed physical round');
  el('damage-agility').click();attack(2);el('damage-agility').click();
  check(data().fight.pending.kind==='hostile-save','miss invokes separate hypnosis save');restore();resolve(3);
  check(data().fight.player.power===3&&data().fight.status==='fighting','equality resists hypnosis and loses one Power');
  check(data().fight.events.filter(e=>e.type==='enemy-attack').length===0,'Firesnake never makes ordinary attacks');preserved();cancel();
  for(const apply of [true,false]) {
    reset(419);el('player-damage').value='20';start();attack(12);
    check(data().fight.pending.kind==='flame-round'&&data().history.length===0,'final flame decision defers victory');restore();
    el(apply?'apply-flame':'skip-flame').click();
    if(apply)el('damage-agility').click();
    check(data().fight.status==='win'&&data().history.length===1,'final flame choice finishes once');
    check(data().fight.player.agility===(apply?11:12),'selected flame timing preserved');
    module.render();check(data().history.length===1,'render never repeats victory reward');preserved();
  }
  reset(419);el('player-power').value='4';start();el('flee').click();restore();resolve(3);
  check(data().fight.status==='withdrawn'&&data().history[0].outcome==='withdrawn'&&data().fight.player.power===3,'magic defence controls withdrawal without a victory');preserved();

  reset(254);start();cast('sesame');
  check(data().fight.rules.roofOpen&&data().fight.player.power===10,'Sesame opens cage roof and costs two Power');
  cast('flyfeet');check(data().fight.pending.amount===3,'wolves climbing damage is three');restore();el('damage-agility').click();
  check(data().fight.status==='withdrawn'&&data().fight.player.agility===9,'open roof allows paid climbing withdrawal');preserved();

  reset(407);start();attack(2);resolve(12);el('damage-strength').click();
  check(data().fight.pending.check==='poison'&&data().fight.player.strength===10,'sting checks current Strength after damage');restore();resolve(10);
  check(data().fight.status==='fighting','poison equality succeeds');cancel();

  reset(54);start();cast('bolt');resolve(1);resolve(2);
  check(data().fight.opponents[0].damage===2,'Gladiator gains printed fury damage');
  restore();cast('bolt');resolve(1);resolve(2);
  check(data().fight.opponents[0].damage===2,'explicit once-only fury does not silently stack');preserved();cancel();

  reset();check(run.sim1477===undefined,'render does not initialize saved state');
  const combobox=el('setup').querySelector('[role="combobox"]');combobox.value='orc';combobox.dispatchEvent(new FocusEvent('focus'));combobox.dispatchEvent(new Event('input'));
  check(el('setup').querySelectorAll('[role="option"]').length>0,'custom opponent autocomplete');
  const field=key=>el('setup').querySelector('[data-stat="'+key+'"]');
  for(const [key,value]of Object.entries({strength:20,agility:20,attackBonus:0,defenceBonus:0,damage:2,power:0}))field(key).value=String(value);
  start();const beforeInvalid=JSON.stringify(data());attack(13);
  check(JSON.stringify(data())===beforeInvalid,'invalid dice preserve custom fight');accept();attack(2);
  const oldRoll=el('resolve'),saved=JSON.stringify(data());restore();oldRoll.click();check(JSON.stringify(data())===saved,'stale roll cannot mutate restored fight');
  resolve(12);el('damage-strength').click();check(data().fight.player.strength===10,'custom damage allocation works');preserved();
  check(el('player-strength').value==='10'&&el('player-strength').disabled,'locked setup displays current wounded pool');
  el('cancel').click();const beforeWrongBook=JSON.stringify(run);app.setCurrentBookId(9999);accept();
  check(JSON.stringify(run)===beforeWrongBook,'delayed cancellation cannot alter a different book');app.setCurrentBookId(1477);module.render();
  el('cancel').click();const nextRun={startedAt:serial++,path:[1]};app.state.playthroughs=[nextRun];app.state.activePtIndex=0;accept();
  check(nextRun.sim1477===undefined,'delayed cancellation cannot initialize a different run');app.state.playthroughs=[run];module.render();cancel();
  document.getElementById('inv-overlay').classList.add('active');overlay.classList.remove('active');module.setVisible(true);
  document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyS',bubbles:true}));
  check(overlay.classList.contains('active')&&!document.getElementById('inv-overlay').classList.contains('active'),'shortcut closes the other panel');preserved();
}
