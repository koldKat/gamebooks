// Coordinate an optional personnel combat sheet with the currently active playthrough.
import { startPersonnelFight,cancelPersonnelFight } from './personnel-battle.js';
import { createPersonnelSetupPanel } from './personnel-setup-panel.js';
import { createPersonnelControlsPanel } from './personnel-controls-panel.js';
import { renderPersonnelReport } from './personnel-report-panel.js';
import { personnelButton,personnelSelect } from './personnel-form.js';

export function createPersonnelPanel({document,definition,getRoster,getPlayerDefaults,getCharts,t,
  getRun,getBookId,saveState,getButtonRow,showAlert,showConfirm,registerShortcut=()=>{}}) {
  const id=definition.stateKey;
  let overlay,launch,encounter,variants,setup,controls,report,start,cancel,note,shownRun,shownSelection,wasActive=false;
  const current=()=>Number(getBookId())===definition.id?getRun()?.[id]:null;
  const active=state=>['fighting','paused'].includes(state?.fight?.status);
  const close=()=>overlay?.classList.remove('active');
  function selected(state) {
    const entry=getRoster().find(e=>e.section===state.encounter);
    const variant=entry?.variants?.find(v=>v.key===state.variant)??entry?.variants?.[0];
    return variant?{...entry,...variant}:entry;
  }
  function action(update) {
    const run=getRun(),original=current();
    if(!original||run!==shownRun)return;
    try{
      const next=update(structuredClone(original));
      if(!next||getRun()!==run||current()!==original)return;
      const fight=next.fight;
      if(fight){
        next.playerForce=structuredClone(fight.player);
        if(fight.config.rules.waves){
          next.waveSurvivors=structuredClone(fight.enemies);
          next.waveSupplyDestroyed=Boolean(fight.setup.suppliesDestroyed);
        }
        if(fight.round>0&&!fight.recorded&&!['fighting','paused','cancelled'].includes(fight.status)){
          fight.recorded=true;
          const outcome=['win','survived'].includes(fight.status)?'win':['loss','surrendered'].includes(fight.status)?'loss':fight.status;
          next.history.push({enemy:fight.config.label,outcome,section:fight.section,ts:Math.max(Date.now(),(next.history.at(-1)?.ts??0)+1)});
        }
      }
      run[id]=next;saveState();render();
    }catch(error){showAlert(error.message||'Check the combat values.');}
  }
  function begin(state) {
    if(active(state))return;
    const values=setup.read();
    state.fight=startPersonnelFight(values.player,values.config,getCharts(),values.setup);
    if(!state.encounter)state.custom=values.custom;
    return state;
  }
  function end() {
    const run=getRun(),original=current(),fight=original?.fight;
    if(run!==shownRun||!active(original))return;
    showConfirm('End this encounter? Its current casualties and combat log will be kept.',()=>{
      if(getRun()!==run||current()!==original||current()?.fight!==fight)return;
      action(state=>{state.fight=cancelPersonnelFight(state.fight);return state;});
    });
  }
  function render() {
    if(!overlay)return;
    const run=getRun();
    if(!run||Number(getBookId())!==definition.id){shownRun=undefined;close();return;}
    const state=run[id]??={encounter:'',variant:'',custom:{},history:[],fight:null};
    const preset=selected(state),locked=active(state),key=state.encounter+'|'+(state.variant??'');
    if(shownRun!==run||shownSelection!==key||wasActive&&!locked){
      if(locked)setup.mount(state,{...state.fight.config,playerUnits:state.fight.player,enemies:state.fight.enemies});
      else setup.mount(state,preset);
      const entry=getRoster().find(e=>e.section===state.encounter);
      variants.replaceChildren();
      for(const variant of entry?.variants??[]){const option=document.createElement('option');option.value=variant.key;option.textContent=variant.label;variants.appendChild(option);}
      variants.value=state.variant||entry?.variants?.[0]?.key||'';
      variants.closest('label').hidden=!entry?.variants?.length;
      shownSelection=key;
    }
    shownRun=run;wasActive=locked;
    encounter.value=state.encounter;encounter.disabled=variants.disabled=locked;
    setup.lock(locked);start.disabled=locked;cancel.disabled=!locked;
    note.textContent=preset?.note??'Enter the current forces and charts. Choose an encounter to use its printed combat rules. Leave a dice total blank to roll automatically.';
    controls.render(state.fight);renderPersonnelReport(report,state);
  }
  function open() {
    if(!getRun()||Number(getBookId())!==definition.id){showAlert(t('battlesim.no_active_playthrough'));return;}
    render();overlay.classList.add('active');
  }
  function init() {
    if(overlay)return;
    overlay=document.createElement('div');overlay.id=id+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML='<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
    overlay.querySelector('.inv-modal-title').textContent=t(definition.i18nPrefix+'.title');
    const closeButton=overlay.querySelector('.inv-close-btn');closeButton.setAttribute('aria-label',t('btn.close'));closeButton.addEventListener('click',close);
    const left=overlay.querySelector('.bsim-col-left');report=overlay.querySelector('.bsim-col-right');
    encounter=personnelSelect(document,left,'Encounter',[{value:'',label:'Custom fight'},...getRoster().map(e=>({value:e.section,label:e.label}))]);encounter.id=id+'-encounter';
    variants=personnelSelect(document,left,'Combat setup',[]);variants.id=id+'-variant';
    note=document.createElement('p');left.appendChild(note);
    const setupHolder=document.createElement('div');setupHolder.id=id+'-setup';left.appendChild(setupHolder);
    setup=createPersonnelSetupPanel({document,holder:setupHolder,id,t,getRoster,getPlayerDefaults});
    start=personnelButton(document,left,'Start encounter',()=>action(begin));start.id=id+'-start';
    const controlsHolder=document.createElement('div');controlsHolder.id=id+'-controls';left.appendChild(controlsHolder);
    controls=createPersonnelControlsPanel({document,holder:controlsHolder,id,dispatch(update,fight){
      if(current()?.fight!==fight)return;
      action(state=>{state.fight=update(state.fight);return state;});
    }});
    cancel=personnelButton(document,left,'End encounter',end);cancel.id=id+'-cancel';
    document.body.appendChild(overlay);
    launch=document.createElement('button');launch.id=id+'-btn';launch.style.display='none';
    getButtonRow().appendChild(launch);launch.addEventListener('click',open);
    registerShortcut({button:launch,overlay,open,close});
    let backdrop=false;overlay.addEventListener('mousedown',e=>{backdrop=e.target===overlay;});
    overlay.addEventListener('click',e=>{if(backdrop&&e.target===overlay)close();});
    overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}});
    encounter.addEventListener('change',()=>action(state=>active(state)?undefined:{...state,encounter:encounter.value,variant:''}));
    variants.addEventListener('change',()=>action(state=>active(state)?undefined:{...state,variant:variants.value}));
  }
  return {init,render,setVisible(value){if(launch)launch.style.display=value?'':'none';if(!value)close();}};
}
