// Exercise the Fatemaster sheet through actual desktop and mobile lazy loaders.
export async function checkFatemasterPanel({app,module,overlay,requestedRosters,check}){
 const {getRoster}=await import('../../../../public/js/battlesim/books/1476/definition.js');
 const el=key=>document.getElementById('sim1476-'+key),data=()=>run.sim1476;
 let run,serial=147600;
 const protectedState={inventory:{keep:['silver key']},equipment:{keep:'original weapon'},sim1475:{keep:'existing fight'}};
 const reset=()=>{run={startedAt:serial++,path:[1,9],...structuredClone(protectedState)};app.state.playthroughs=[run];app.state.activePtIndex=0;module.render();};
 const choose=section=>{el('encounter').value=String(section);el('encounter').dispatchEvent(new Event('change'));};
 const closeNotice=()=>document.getElementById('confirm-ok').click();
 const cancel=()=>{if(['fighting','paused'].includes(data()?.fight?.status)){el('cancel').click();closeNotice();}};
 const field=(key,index=0)=>el('setup').querySelectorAll('[data-stat="'+key+'"]')[index];
 const resolve=total=>{el('dice').value=String(total);el('resolve').click();};
 const hero=()=>{for(const [key,value]of Object.entries({strength:12,agility:12,maxStrength:12,maxAgility:12,power:12,maxPower:12,damage:4}))el('player-'+key).value=String(value);};
 check(getRoster().length===27&&requestedRosters.has(1476),'database-owned Fatemaster roster');
 let starts=0;
 for(const preset of getRoster())for(const variant of preset.variants??[{key:''}]){
  reset();choose(preset.section);
  if(variant.key){el('variant').value=variant.key;el('variant').dispatchEvent(new Event('change'));}
  if(preset.rules.response==='miss-bolt')el('counter-dice').value='2';
  el('start').click();check(data().fight?.section===preset.section,'source encounter starts '+preset.section+' '+variant.key);
  check(el('encounter').disabled&&el('start').disabled&&field('strength').disabled,'active setup locked');
  const before=JSON.stringify(data());module.render();check(JSON.stringify(data())===before,'render preserves fight');
  check(JSON.stringify([run.inventory,run.equipment,run.sim1475])===JSON.stringify(Object.values(protectedState)),'other state preserved');
  check(JSON.stringify(run.path)==='[1,9]','combat does not navigate reader');
  check(!overlay.querySelector('.bsim-col-right input,.bsim-col-right select,.bsim-col-right button'),'report has no combat controls');
  cancel();check(data().history.length===0,'cancelling has no outcome award');starts++;
 }
 check(starts===29,'all source encounters and variants start through the UI');
 reset();choose(420);el('start').click();check(!data().fight,'ambiguous counter bolt cannot start without explicit dice');closeNotice();el('counter-dice').value='3';el('start').click();check(data().fight.rules.counterBoltDice===3,'explicit bolt dice retained');cancel();

 reset();check(run.sim1476===undefined,'render does not initialize saved state');
 const name=el('setup').querySelector('[role="combobox"]');name.value='goblin';name.dispatchEvent(new FocusEvent('focus'));name.dispatchEvent(new Event('input'));
 check(el('setup').querySelectorAll('[role="option"]').length>0,'custom opponent autocomplete');
 for(const [key,value]of Object.entries({strength:20,agility:20,attackBonus:0,defenceBonus:0,damage:2,power:0}))field(key).value=String(value);
 hero();el('start').click();check(data().fight.opponents[0].strength===20,'custom stats can exceed suggestion starting values');
 const saved=JSON.stringify(data());el('dice').value='13';el('attack').click();check(JSON.stringify(data())===saved,'invalid manual dice leave fight unchanged');closeNotice();
 el('dice').value='2';el('attack').click();check(data().fight.pending?.kind==='enemy','miss leaves explicit enemy roll: '+JSON.stringify({status:data().fight.status,pending:data().fight.pending,phase:data().fight.phase,events:data().fight.events,alert:document.getElementById('confirm-message')?.textContent}));
 const stale=el('resolve'),pending=JSON.stringify(data());run.sim1476=JSON.parse(pending);module.render();stale.click();check(JSON.stringify(data())===pending,'stale roll button cannot mutate restored fight');
 resolve(12);check(data().fight.pending.kind==='damage','damage allocation stays explicit');
 const beforeStrength=data().fight.player.strength;el('damage-strength').click();check(data().fight.player.strength===beforeStrength-2,'selected current pool takes damage');
 cancel();

 reset();hero();for(const [key,value]of Object.entries({strength:20,agility:4,attackBonus:-100,defenceBonus:0,damage:1,power:0}))field(key).value=String(value);
 el('start').click();el('spell').value='slumber';el('cast').click();
 check(data().fight.player.power===10,'spell cost paid before opponent turn');resolve(2);el('resolve').click();
 check(data().fight.pending.kind==='spell-dice','spell dice are a separate pending action');resolve(12);
 check(data().fight.pending.kind==='spell-allocation','whole-target budget selection');
 const target=el('controls').querySelector('input[type="checkbox"]');target.checked=true;target.dispatchEvent(new Event('change'));
 const selection=JSON.stringify(data());run.sim1476=JSON.parse(selection);module.render();check(el('controls').querySelector('input[type="checkbox"]').checked,'spell selection survives save/load');
 el('allocate').click();check(data().fight.pending?.kind==='spell-save','selected target retains its explicit Power defence roll');resolve(6);
 check(data().fight.status==='win'&&data().history.length===1,'successful Slumber records one victory');
 const count=data().history.length;module.render();check(data().history.length===count,'render does not duplicate result');

 reset();el('start').click();el('cancel').click();const original=JSON.stringify(run);app.setCurrentBookId(9999);closeNotice();check(JSON.stringify(run)===original,'delayed cancellation cannot write another book');app.setCurrentBookId(1476);module.render();
 el('cancel').click();const nextRun={startedAt:serial++,path:[1],inventory:{keep:'new run'}};app.state.playthroughs=[nextRun];app.state.activePtIndex=0;closeNotice();check(nextRun.sim1476===undefined,'delayed cancellation cannot initialize a different run');
 app.state.playthroughs=[run];app.state.activePtIndex=0;module.render();cancel();
 document.getElementById('inv-overlay').classList.add('active');overlay.classList.remove('active');
 if(el('btn').style.display==='none'){
  document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyS',bubbles:true}));check(!overlay.classList.contains('active'),'hidden mobile launcher blocks keyboard shortcut');module.setVisible(true);
 }
 document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyS',bubbles:true}));
 check(overlay.classList.contains('active')&&!document.getElementById('inv-overlay').classList.contains('active'),'shortcut closes the other panel');
 check(!/battlesim(?:1476|\.fatemaster)\.[\w.]+/.test(overlay.textContent),'visible simulator translations loaded');
}
