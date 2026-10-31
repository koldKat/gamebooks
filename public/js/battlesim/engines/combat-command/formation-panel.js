// Coordinate one optional formation combat sheet with the currently active playthrough.
import { createFormationState } from './formation-state.js';
import { startFormationFight,cancelFormationFight } from './formation-battle.js';
import { createFormationSetupPanel } from './formation-setup-panel.js';
import { createFormationControlsPanel } from './formation-controls-panel.js';
import { renderFormationReport } from './formation-report-panel.js';
import { personnelButton,personnelSelect } from './personnel-form.js';

export function createFormationPanel({document,definition,getRoster,getPlayerDefaults,getUnitProfiles,getCharts,t,
  getRun,getBookId,saveState,getButtonRow,showAlert,showConfirm,registerShortcut=()=>{}}) {
  const id=definition.stateKey;
  const saved=createFormationState(()=>({run:getRun(),bookId:getBookId(),definition,saveState}));
  let overlay,launch,encounter,note,setup,controls,report,start,cancel,shownRun,shownSelection,wasLocked=false;
  const active=state=>['fighting','paused'].includes(state?.fight?.status);
  const close=()=>overlay?.classList.remove('active');
  function action(change,expectedFight) {
    if (getRun()!==shownRun)return;
    try {if(saved.update(change,expectedFight))render();}
    catch(error){showAlert(error.message||'Check the combat values.');}
  }
  function begin(state) {
    if(active(state))return;
    const values=setup.read();state.fight=startFormationFight(values.player,values.config,getCharts());
    if (!state.encounter)state.custom=values.custom;
    return state;
  }
  function end() {
    const run=getRun(),original=saved.read(),fight=original?.fight;
    if(run!==shownRun||!active(original))return;
    showConfirm('End this encounter? Current casualties and its combat log will be kept.',()=>{
      if(getRun()!==run||saved.read()!==original)return;
      action(state=>({...state,fight:cancelFormationFight(state.fight)}),fight);
    });
  }
  function render() {
    if(!overlay)return;
    const run=getRun(),state=saved.read();
    if(!state){shownRun=undefined;close();return;}
    const selected=getRoster().find(entry=>entry.section===state.encounter),locked=active(state);
    if(shownRun!==run||shownSelection!==state.encounter||wasLocked&&!locked){
      setup.mount(state,selected);shownSelection=state.encounter;
    }
    shownRun=run;wasLocked=locked;
    encounter.value=state.encounter;encounter.disabled=locked;
    setup.lock(locked);start.disabled=locked;cancel.disabled=!locked;
    note.textContent=selected?.note??'Enter current forces and choose the attack values and charts. Each side makes one combined attack; choose how to allocate casualties.';
    controls.render(state.fight);renderFormationReport(report,state);
  }
  function open() {
    if(!saved.read()){showAlert(t('battlesim.no_active_playthrough'));return;}
    render();overlay.classList.add('active');
  }
  function init() {
    if(overlay)return;
    overlay=document.createElement('div');overlay.id=id+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML='<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
    overlay.querySelector('.inv-modal-title').textContent=t(definition.i18nPrefix+'.title');
    const closeButton=overlay.querySelector('.inv-close-btn');closeButton.setAttribute('aria-label',t('btn.close'));closeButton.addEventListener('click',close);
    const left=overlay.querySelector('.bsim-col-left');report=overlay.querySelector('.bsim-col-right');
    encounter=personnelSelect(document,left,'Encounter',[{value:'',label:'Custom fight'},...getRoster().map(entry=>({value:entry.section,label:entry.label}))]);
    encounter.id=id+'-encounter';
    note=document.createElement('p');left.appendChild(note);
    const setupHolder=document.createElement('div');setupHolder.id=id+'-setup';left.appendChild(setupHolder);
    setup=createFormationSetupPanel({document,holder:setupHolder,id,t,getUnitProfiles,getPlayerDefaults});
    start=personnelButton(document,left,'Start encounter',()=>action(begin));start.id=id+'-start';
    const controlsHolder=document.createElement('div');controlsHolder.id=id+'-controls';left.appendChild(controlsHolder);
    controls=createFormationControlsPanel({document,holder:controlsHolder,id,dispatch(change,fight){
      action(state=>({...state,fight:change(state.fight)}),fight);
    }});
    cancel=personnelButton(document,left,'End encounter',end);cancel.id=id+'-cancel';
    document.body.appendChild(overlay);
    launch=document.createElement('button');launch.id=id+'-btn';launch.style.display='none';getButtonRow().appendChild(launch);
    launch.addEventListener('click',open);registerShortcut({button:launch,overlay,open,close});
    let backdrop=false;overlay.addEventListener('mousedown',event=>{backdrop=event.target===overlay;});
    overlay.addEventListener('click',event=>{if(backdrop&&event.target===overlay)close();});
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();}});
    encounter.addEventListener('change',()=>action(state=>active(state)?undefined:{...state,encounter:encounter.value}));
  }
  return {init,render,setVisible(value){if(launch)launch.style.display=value?'':'none';if(!value)close();}};
}
