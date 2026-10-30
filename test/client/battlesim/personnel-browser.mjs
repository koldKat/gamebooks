// Exercise personnel combat through the actual desktop and mobile lazy entry points.
export async function checkPersonnelPanel({app,module,overlay,requestedRosters,check}) {
  const {getRoster}=await import('../../../public/js/battlesim/books/1474/definition.js');
  const el=key=>document.getElementById('sim1474-'+key);
  let run,serial=147400;
  const data=()=>run.sim1474;
  const protectedValues={inventory:{keep:['item']},equipment:{keep:'equipment'},sim1472:{keep:'other fight'}};
  const reset=()=>{
    run={startedAt:serial++,path:[1],...structuredClone(protectedValues)};
    app.state.playthroughs=[run];app.state.activePtIndex=0;module.render();
  };
  const rows=side=>[...el('setup').querySelectorAll('details')].find(d=>d.querySelector('summary').textContent===(side==='player'?'Your current force':'Enemy force'))
    ??[...el('setup').querySelectorAll('details')].find(d=>d.querySelector('summary').textContent==='Current surviving waves');
  const field=(side,key,index=0)=>rows(side).querySelectorAll('fieldset')[index].querySelector('[data-stat="'+key+'"]');
  const choose=key=>{el('encounter').value=key;el('encounter').dispatchEvent(new Event('change'));};
  const cancel=()=>{if(data().fight?.status==='fighting'){el('cancel').click();document.getElementById('confirm-ok').click();}};
  const resolve=total=>{el('roll-total').value=String(total);el('resolve-roll').click();};
  check(getRoster().length===43&&requestedRosters.has(1474),'Personnel database catalog');
  let setups=0;
  for(const entry of getRoster())for(const variant of entry.variants??[{}]){
    reset();choose(entry.section);
    if(variant.key){el('variant').value=variant.key;el('variant').dispatchEvent(new Event('change'));}
    field('player','count').value='100';field('player','ordnance').value='1';field('player','melee').value='2';
    el('start').click();
    check(data().fight?.config.section===entry.section,'Personnel source setup starts '+entry.section+' '+variant.key);
    check(el('encounter').disabled&&el('start').disabled&&field('player','count').disabled,'Personnel setup locked');
    const before=JSON.stringify(data());module.render();check(JSON.stringify(data())===before,'Render preserves active personnel combat');
    if(data().fight.phase==='roll')resolve(data().fight.pending.dice);
    if(data().fight.openingRemaining>0){
      const target=el('controls').querySelector('select');target.value='wave-1';
    }
    el('begin-round').click();
    check(data().fight.round===1,'Personnel round begins '+entry.section);
    if(data().fight.phase==='roll'){
      el('roll-total').value='2';el('resolve-round').click();
      check(data().fight.phase!=='roll','Personnel remaining rolls resolve '+entry.section);
    }
    check(JSON.stringify([run.inventory,run.equipment,run.sim1472])===JSON.stringify(Object.values(protectedValues)),'Unrelated state preserved');
    check(JSON.stringify(run.path)==='[1]','Personnel combat does not navigate the reader');
    check(!overlay.querySelector('.bsim-col-right input,.bsim-col-right select,.bsim-col-right button'),'Report column has no controls');
    cancel();setups++;
  }
  check(setups===45,'All forty-five personnel source approaches');

  reset();choose('208');field('player','count').value='100';field('player','ordnance').value='10';
  el('start').click();el('begin-round').click();resolve(2);resolve(8);
  check(data().fight.pending.kind==='hit-save','Follow-up hit check is explicit');
  const pending=JSON.stringify(data()),oldButton=el('resolve-roll');
  el('roll-total').value='13';oldButton.click();check(JSON.stringify(data())===pending,'Invalid dice cannot change saved attacks');
  document.getElementById('confirm-ok').click();
  run.sim1474=JSON.parse(pending);module.render();oldButton.click();
  check(JSON.stringify(data())===pending,'Stale pending-roll button cannot mutate restored fight');
  resolve(7);check(data().fight.phase==='ready','Restored hit check resumes same round');
  check(data().fight.history.at(-1).attacks.length===2,'Restored check does not repeat either attack');cancel();

  reset();choose('198');
  const count=[...el('setup').querySelectorAll('label')].find(label=>label.textContent.includes('Friendly units engaged')).querySelector('select');
  count.value='2';count.dispatchEvent(new Event('change'));
  check(rows('player').querySelectorAll('fieldset').length===2,'Camp permits two separately editable units');
  el('start').click();el('begin-round').click();check(data().fight.pending.kind==='pre-morale','Camp morale checks start before attacks');cancel();

  reset();const name=rows('enemy').querySelector('[role="combobox"]');
  name.value='police';name.dispatchEvent(new FocusEvent('focus'));name.dispatchEvent(new Event('input'));
  check(rows('enemy').querySelectorAll('[role="option"]').length>0,'Custom opponent autocomplete uses database profiles');
  rows('enemy').querySelector(':scope > button').click();
  const added=rows('enemy').querySelectorAll('fieldset')[1];
  added.querySelector('[role="combobox"]').value='Another opponent';
  for(const [key,value]of Object.entries({count:1,ordnance:1,melee:1,stealth:1,morale:1,chart:'D'}))added.querySelector('[data-stat="'+key+'"]').value=value;
  el('start').click();check(data().fight.enemies.length===2,'Custom fight needs no preset and accepts opponent groups');cancel();

  reset();el('start').click();const saved=JSON.stringify(data());
  el('cancel').click();app.setCurrentBookId(9999);document.getElementById('confirm-ok').click();
  check(JSON.stringify(run.sim1474)===saved,'Stale confirmation after book switch preserves combat');
  app.setCurrentBookId(1474);module.render();cancel();
  app.state.playthroughs=[{startedAt:serial++,path:[1]}];app.state.activePtIndex=0;
  el('start').click();check(app.currentPlaythrough().sim1474===undefined,'Stale start cannot mutate another run');
  app.state.playthroughs=[run];app.state.activePtIndex=0;module.render();
}
