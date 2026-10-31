// Coordinate the optional Fatemaster combat sheet with live playthrough bindings.
import {startFatemasterFight,cancelFatemasterFight} from './battle.js';
import {createFatemasterState} from './state.js';
import {createFatemasterSetup} from './setup-panel.js';
import {renderFatemasterControls} from './controls-panel.js';
import {renderFatemasterReport} from './report-panel.js';
import {button,select,text} from './form.js';

export function createFatemasterPanel({document,definition,t,getRoster,getPlayerDefaults,getRun,getBookId,saveState,getButtonRow,showAlert,showConfirm,registerShortcut=()=>{}}) {
  const id=definition.stateKey,tr=key=>t('battlesim.fatemaster.'+key);
  const stateStore=createFatemasterState(()=>({run:getRun(),bookId:getBookId(),definition,saveState}));
  let overlay,launch,encounter,variant,note,setup,controls,report,start,cancel,shownToken,setupRun,setupKey,wasLocked=false;
  const locked=state=>['fighting','paused'].includes(state.fight?.status);
  const close=()=>overlay?.classList.remove('active');
  function change(update,token=shownToken) {
    try{if(stateStore.update(update,token))render();}catch(error){showAlert(error.message||tr('check_values'));}
  }
  function begin(state) {
    if(locked(state))return;
    const values=setup.read();
    state.fight=startFatemasterFight(values.player,values.opponents,values.config.rules,values.options);
    state.fight.section=values.config.section;state.fight.label=values.config.label;
    if(!state.encounter)state.custom=values.opponents;
    return state;
  }
  function end() {
    const token=shownToken;if(!token||!locked(token.state))return;
    showConfirm(tr('end_confirm'),()=>change(state=>{state.fight=cancelFatemasterFight(state.fight);return state;},token));
  }
  function render() {
    if(!overlay)return;
    const token=stateStore.snapshot();
    if(!token){shownToken=null;setupRun=null;close();return;}
    const state=token.state,preset=getRoster().find(e=>e.section===state.encounter),active=locked(state),key=state.encounter+'|'+state.variant;
    if(setupRun!==token.run||setupKey!==key||active||wasLocked&&!active){
      setup.mount(state,preset);
      variant.replaceChildren();
      for(const item of preset?.variants??[]){const option=document.createElement('option');option.value=item.key;option.textContent=item.label;variant.appendChild(option);}
      variant.value=state.variant||preset?.variants?.[0]?.key||'';variant.closest('label').hidden=!preset?.variants?.length;
      setupRun=token.run;setupKey=key;
    }
    shownToken=token;wasLocked=active;
    encounter.value=state.encounter;encounter.disabled=variant.disabled=active;setup.lock(active);
    start.disabled=active;cancel.disabled=!active;note.textContent=preset?.note??tr('setup_note');
    renderFatemasterControls({document,holder:controls,id,t,fight:state.fight,dispatch:update=>change(state=>{state.fight=update(state.fight);return state;},token)});
    renderFatemasterReport(report,state,t);
  }
  function open(){if(!stateStore.snapshot()){showAlert(t('battlesim.no_active_playthrough'));return;}render();overlay.classList.add('active');}
  function init() {
    if(overlay)return;
    overlay=document.createElement('div');overlay.id=id+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML='<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
    overlay.querySelector('.inv-modal-title').textContent=t(definition.i18nPrefix+'.title');
    const closer=overlay.querySelector('.inv-close-btn');closer.setAttribute('aria-label',t('btn.close'));closer.addEventListener('click',close);
    const left=overlay.querySelector('.bsim-col-left');report=overlay.querySelector('.bsim-col-right');
    encounter=select(document,left,tr('encounter'),[{value:'',label:tr('custom')},...getRoster().map(e=>({value:e.section,label:e.label}))]);encounter.id=id+'-encounter';
    variant=select(document,left,tr('variant'),[]);variant.id=id+'-variant';note=text(document,left,'');
    const holder=document.createElement('div');holder.id=id+'-setup';left.appendChild(holder);
    setup=createFatemasterSetup({document,holder,id,t,getRoster,getPlayerDefaults});
    start=button(document,left,tr('start'),()=>change(begin),id+'-start');
    controls=document.createElement('div');controls.id=id+'-controls';left.appendChild(controls);
    cancel=button(document,left,tr('end'),end,id+'-cancel');
    document.body.appendChild(overlay);launch=document.createElement('button');launch.id=id+'-btn';launch.style.display='none';
    getButtonRow().appendChild(launch);launch.addEventListener('click',open);registerShortcut({button:launch,overlay,open,close});
    let backdrop=false;overlay.addEventListener('mousedown',e=>{backdrop=e.target===overlay;});overlay.addEventListener('click',e=>{if(backdrop&&e.target===overlay)close();});
    overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}});
    encounter.addEventListener('change',()=>change(state=>locked(state)?undefined:{...state,encounter:encounter.value,variant:''}));
    variant.addEventListener('change',()=>change(state=>locked(state)?undefined:{...state,variant:variant.value}));
  }
  return {init,render,setVisible(value){if(launch)launch.style.display=value?'':'none';if(!value)close();}};
}
