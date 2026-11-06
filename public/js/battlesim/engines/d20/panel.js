// Bind the d20 setup, controls, and report to one live application run.
import {createQuestState} from '../super-endless-quest/state.js';
import {d20Action,validateD20Fight} from './core.js';
import {createD20Forms} from './forms.js';
import {createD20Setup} from './setup-panel.js';
import {renderD20Actions} from './actions-panel.js';
import {renderD20Report} from './report.js';

export function createD20Panel({document,definition,t,getRoster,getOpponents,getRules,getRun,getBookId,
  saveState,getButtonRow,showAlert,showConfirm,registerShortcut=()=>{}}){
  const id=definition.stateKey,tr=key=>t(definition.i18nPrefix+'.'+key),ui=createD20Forms(document,id,tr);
  const store=createQuestState(()=>({run:getRun(),bookId:getBookId(),definition,saveState}),{validateFight:validateD20Fight});
  let overlay,launch,setup,controls,right,start,cancel,token,mountedRun,mountedOriginal,controlsRun,controlsOriginal;
  let memory={};const close=()=>overlay?.classList.remove('active');
  const busy=state=>state.fight?.status==='fighting';
  function change(callback,expected=token){
    try{if(store.update(state=>{state.history=state.history.slice(-199);return callback(state);},expected))render();}
    catch{showAlert(tr('invalid'));}
  }
  function render(){
    if(!overlay)return;const snapshot=store.snapshot();
    if(!snapshot){token=null;mountedRun=mountedOriginal=controlsRun=controlsOriginal=null;controls.replaceChildren();right.replaceChildren();close();return;}
    if(mountedRun!==snapshot.run||mountedOriginal!==snapshot.original){setup.fill(snapshot.state);mountedRun=snapshot.run;mountedOriginal=snapshot.original;}
    token=snapshot;const locked=busy(snapshot.state);setup.lock(locked);start.disabled=locked;cancel.disabled=!locked;
    if(controlsRun!==snapshot.run||controlsOriginal!==snapshot.original){
      if(controlsRun!==snapshot.run)memory={};
      controlsRun=snapshot.run;controlsOriginal=snapshot.original;
      controls.replaceChildren();
      if(locked)renderD20Actions(controls,ui,snapshot.state.fight,{memory,onError:()=>showAlert(tr('invalid')),
        send:action=>change(state=>{state.fight=d20Action(state.fight,{...action,expectedRevision:snapshot.state.fight.revision});return state;},snapshot)});
    }
    renderD20Report(right,ui,snapshot.state);
  }
  function init(){
    if(overlay)return;
    overlay=document.createElement('div');overlay.id=id+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML='<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
    overlay.querySelector('.inv-modal-title').textContent=tr('title');
    const closer=overlay.querySelector('.inv-close-btn');closer.setAttribute('aria-label',t('btn.close'));closer.addEventListener('click',close);
    const left=overlay.querySelector('.bsim-col-left');right=overlay.querySelector('.bsim-col-right');ui.text(left,tr('rules'));
    setup=createD20Setup(left,ui,{id,t,getEncounters:getRoster,getOpponents,getRules});
    start=ui.button(left,'start',()=>change(state=>{if(busy(state))return null;state.fight=setup.read();return state;}));
    controls=document.createElement('div');controls.id=id+'-controls';left.append(controls);
    cancel=ui.button(left,'cancel',()=>{
      const expected=token;if(!expected||!busy(expected.state))return;
      showConfirm(tr('cancelConfirm'),()=>change(state=>{
        const pending=[['player',state.fight.player],...state.fight.companions.map((actor,i)=>['ally'+i,actor]),...state.fight.groups.map((actor,i)=>['enemy'+i,actor])].find(([,actor])=>actor.pendingCast);
        if(pending)state.fight=d20Action(state.fight,{kind:'cancelCast',actor:pending[0],note:tr('cancelSpell'),results:[],expectedRevision:state.fight.revision});
        state.fight=d20Action(state.fight,{kind:'cancel',expectedRevision:state.fight.revision});return state;
      },expected));
    });
    document.body.append(overlay);launch=document.createElement('button');launch.id=id+'-btn';launch.style.display='none';getButtonRow().append(launch);
    launch.addEventListener('click',()=>{if(!store.snapshot()){showAlert(t('battlesim.no_active_playthrough'));return;}render();overlay.classList.add('active');});
    registerShortcut({button:launch,overlay,open:()=>launch.click(),close});
    let backdrop=false;overlay.addEventListener('mousedown',event=>{backdrop=event.target===overlay;});
    overlay.addEventListener('click',event=>{if(backdrop&&event.target===overlay)close();});
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();}});
  }
  return{init,render,setVisible(value){if(launch)launch.style.display=value?'':'none';if(!value)close();}};
}
