// Bind first-hit setup and attack controls to the initiating application run.
import {createQuestState} from '../super-endless-quest/state.js';
import {createD20Forms} from '../d20/forms.js';
import {createOpponentEditor} from '../../opponents.js';
import {startFirstHitFight,firstHitAction,validateFirstHitFight} from './core.js';
import {renderFirstHitReport} from './report.js';

export function createFirstHitPanel({document,definition,t,getRoster,getRules,getRun,getBookId,saveState,
  getButtonRow,showAlert,showConfirm,registerShortcut=()=>{}}){
  const id=definition.stateKey,ui=createD20Forms(document,id,key=>t(definition.i18nPrefix+'.'+key));
  const store=createQuestState(()=>({run:getRun(),bookId:getBookId(),definition,saveState}),{validateFight:validateFirstHitFight});
  let overlay,launch,skill,editor,controls,right,start,cancel,token,mountedRun,mountedOriginal,controlsRun,controlsOriginal;
  const close=()=>overlay?.classList.remove('active');
  const busy=state=>state.fight?.status==='fighting';
  function change(callback,expected=token){
    try{if(store.update(state=>{state.history=state.history.slice(-199);return callback(state);},expected))render();}
    catch{showAlert(ui.tr('invalid'));}
  }
  function render(){
    if(!overlay)return;const snapshot=store.snapshot();
    if(!snapshot){token=null;mountedRun=mountedOriginal=controlsRun=controlsOriginal=null;controls.replaceChildren();right.replaceChildren();close();return;}
    if(mountedRun!==snapshot.run||mountedOriginal!==snapshot.original){
      skill.value=snapshot.state.player?.skill??getRules().initialSkill;
      const opponent=snapshot.state.opponent;editor.set([opponent?{...opponent,displayName:opponent.name}:{displayName:'',skill:null}]);
      mountedRun=snapshot.run;mountedOriginal=snapshot.original;
    }
    token=snapshot;const locked=busy(snapshot.state);skill.disabled=locked;editor.lock(locked);start.disabled=locked;cancel.disabled=!locked;
    if(controlsRun!==snapshot.run||controlsOriginal!==snapshot.original){
      controlsRun=snapshot.run;controlsOriginal=snapshot.original;controls.replaceChildren();
      if(locked){
        const dice=ui.group(controls,'manualDice'),first=ui.field(dice,'die1',{type:'number',min:1,max:6,optional:true}),
          second=ui.field(dice,'die2',{type:'number',min:1,max:6,optional:true});
        ui.button(controls,'attack',()=>{
          let values;
          try{if(first.value.trim()||second.value.trim())values=[ui.number(first),ui.number(second)];}
          catch{showAlert(ui.tr('invalid'));return;}
          change(state=>{state.fight=firstHitAction(state.fight,{kind:'attack',expectedRevision:snapshot.state.fight.revision,dice:values});return state;},snapshot);
        });
      }
    }
    renderFirstHitReport(right,ui,snapshot.state);
  }
  function init(){
    if(overlay)return;overlay=document.createElement('div');overlay.id=id+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML='<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
    overlay.querySelector('.inv-modal-title').textContent=ui.tr('title');const closer=overlay.querySelector('.inv-close-btn');
    closer.setAttribute('aria-label',t('btn.close'));closer.addEventListener('click',close);
    const left=overlay.querySelector('.bsim-col-left');right=overlay.querySelector('.bsim-col-right');ui.text(left,ui.tr('rules'));
    skill=ui.field(left,'playerSkill',{type:'number',min:1,max:1000,value:getRules().initialSkill});
    editor=createOpponentEditor({document,id,t,presets:getRoster().map(row=>({...row,displayName:row.name})),
      fields:[{key:'skill',label:ui.tr('skill'),min:1,max:1000}]});editor.fixCount(true);left.append(editor.element);
    start=ui.button(left,'start',()=>change(state=>{
      if(busy(state))return null;const opponent=editor.read()[0];
      state.fight=startFirstHitFight({name:ui.tr('player'),skill:ui.number(skill)},{...opponent,name:opponent.displayName});return state;
    }));
    controls=document.createElement('div');controls.id=id+'-controls';left.append(controls);
    cancel=ui.button(left,'cancel',()=>{
      const expected=token;if(!expected||!busy(expected.state))return;
      showConfirm(ui.tr('cancelConfirm'),()=>change(state=>{state.fight=firstHitAction(state.fight,{kind:'cancel',expectedRevision:state.fight.revision});return state;},expected));
    });
    document.body.append(overlay);launch=document.createElement('button');launch.id=id+'-btn';launch.style.display='none';getButtonRow().append(launch);
    launch.addEventListener('click',()=>{if(!store.snapshot()){showAlert(t('battlesim.no_active_playthrough'));return;}render();overlay.classList.add('active');});
    registerShortcut({button:launch,overlay,open:()=>launch.click(),close});
    let backdrop=false;overlay.addEventListener('mousedown',event=>{backdrop=event.target===overlay;});
    overlay.addEventListener('click',event=>{if(backdrop&&event.target===overlay)close();});
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();}});
  }
  return {init,render,setVisible(value){if(launch)launch.style.display=value?'':'none';if(!value)close();}};
}
