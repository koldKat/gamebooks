// Bind editable graded-duel setup and combat controls to the current playthrough.
import {createOpponentEditor} from '../../opponents.js';
import {LIFE_FORCE,startKnightmareFight,knightmareRound,cancelKnightmareFight} from './core.js';
import {createKnightmareState} from './state.js';
import {renderKnightmareReport} from './report.js';

export function createKnightmarePanel({document,definition,t,getRoster,getPlayerDefaults,getRun,getBookId,
  saveState,getButtonRow,showAlert,showConfirm,registerShortcut=()=>{}}) {
  const id=definition.stateKey,tr=(key,params)=>t('battlesim.knightmare.'+key,params);
  const store=createKnightmareState(()=>({run:getRun(),bookId:getBookId(),definition,saveState}));
  let overlay,launch,left,right,player,luck,editor,start,cancel,controls,shownToken,mountedState,mountedRun;
  const active=state=>state.fight?.status==='fighting';
  const close=()=>overlay?.classList.remove('active');
  const gradeOptions=()=>LIFE_FORCE.map(value=>({value,label:tr('grade.'+value)}));
  function field(holder,label,input){
    const row=document.createElement('label'),span=document.createElement('span');
    row.className='inv-edit-row';span.textContent=label;input.className='inv-edit-input';row.append(span,input);holder.append(row);return input;
  }
  function select(holder,label,options){
    const input=document.createElement('select');
    for(const item of options){const option=document.createElement('option');option.value=item.value;option.textContent=item.label;input.append(option);}
    return field(holder,label,input);
  }
  function number(holder,label,min,max,value=''){
    const input=document.createElement('input');input.type='number';input.min=min;input.max=max;input.step=1;input.value=value;
    return field(holder,label,input);
  }
  function button(holder,label,action,key){
    const node=document.createElement('button');node.type='button';node.className='bsim-action-btn';node.textContent=label;node.id=id+'-'+key;
    node.addEventListener('click',action);holder.append(node);return node;
  }
  function numeric(input){
    const value=Number(input.value);
    if(!input.value.trim()||!Number.isSafeInteger(value)||value<Number(input.min)||value>Number(input.max))throw Error('Invalid field');
    return value;
  }
  function change(update,token=shownToken){
    try{if(store.update(update,token))render();}catch{showAlert(tr('check_values'));}
  }
  function begin(state){
    if(active(state))return;
    const opponents=editor.read();
    if(opponents.length!==1)throw Error('A duel has one opponent');
    state.fight=startKnightmareFight({lifeForce:player.value},opponents[0],getPlayerDefaults().rules,{luckCharges:numeric(luck)});
    return state;
  }
  function end(){
    const token=shownToken;if(!token||!active(token.state))return;
    showConfirm(tr('end_confirm'),()=>change(state=>{state.fight=cancelKnightmareFight(state.fight);return state;},token));
  }
  function renderControls(state,token){
    controls.replaceChildren();
    if(!active(state))return;
    const row=document.createElement('label'),useLuck=document.createElement('input'),label=document.createElement('span');
    row.className='bsim-checkbox';useLuck.type='checkbox';useLuck.id=id+'-use-luck';label.textContent=tr('use_luck');row.append(useLuck,label);controls.append(row);
    useLuck.disabled=!state.fight.luckCharges;
    const die=number(controls,tr('manual_die'),1,6);die.id=id+'-die';die.placeholder=tr('automatic');
    useLuck.addEventListener('change',()=>{die.disabled=useLuck.checked;});
    button(controls,tr('next_round'),()=>change(next=>{
      next.fight=knightmareRound(next.fight,{expectedRound:state.fight.round,useLuck:useLuck.checked,
        ...(!useLuck.checked&&die.value.trim()?{die:numeric(die)}:{})});return next;
    },token),'round');
  }
  function render(){
    if(!overlay)return;
    const token=store.snapshot();
    if(!token){shownToken=null;mountedState=null;mountedRun=null;close();return;}
    const state=token.state,locked=active(state);
    if(mountedRun!==token.run||mountedState!==token.original){
      player.value=state.playerLifeForce??getPlayerDefaults().player.lifeForce;luck.value=state.luckCharges;
      editor.set([state.opponent??{displayName:tr('custom_opponent'),lifeForce:getPlayerDefaults().player.lifeForce}]);
      mountedRun=token.run;mountedState=token.original;
    }
    shownToken=token;player.disabled=luck.disabled=start.disabled=locked;editor.lock(locked);cancel.disabled=!locked;
    renderControls(state,token);renderKnightmareReport(document,right,state,t);
  }
  function open(){if(!store.snapshot()){showAlert(t('battlesim.no_active_playthrough'));return;}render();overlay.classList.add('active');}
  function init(){
    if(overlay)return;
    overlay=document.createElement('div');overlay.id=id+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML='<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
    overlay.querySelector('.inv-modal-title').textContent=t(definition.i18nPrefix+'.title');
    const closer=overlay.querySelector('.inv-close-btn');closer.setAttribute('aria-label',t('btn.close'));closer.addEventListener('click',close);
    left=overlay.querySelector('.bsim-col-left');right=overlay.querySelector('.bsim-col-right');
    const note=document.createElement('p');note.textContent=tr('rules');left.append(note);
    player=select(left,tr('player_life_force'),gradeOptions());player.id=id+'-player-grade';
    luck=number(left,tr('luck_charges'),0,2,0);luck.id=id+'-luck';
    const hint=document.createElement('p');hint.textContent=tr('luck_hint');left.append(hint);
    editor=createOpponentEditor({document,id,t,fields:[{key:'lifeForce',label:tr('life_force'),options:gradeOptions()}],
      presets:getRoster().map(entry=>({...entry.opponent,displayName:entry.opponent.name}))});
    editor.fixCount(true);left.append(editor.element);
    start=button(left,tr('start'),()=>change(begin),'start');
    controls=document.createElement('div');controls.id=id+'-controls';left.append(controls);
    cancel=button(left,tr('end'),end,'cancel');
    document.body.append(overlay);launch=document.createElement('button');launch.id=id+'-btn';launch.style.display='none';
    getButtonRow().append(launch);launch.addEventListener('click',open);registerShortcut({button:launch,overlay,open,close});
    let backdrop=false;overlay.addEventListener('mousedown',e=>{backdrop=e.target===overlay;});
    overlay.addEventListener('click',e=>{if(backdrop&&e.target===overlay)close();});
    overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}});
  }
  return {init,render,setVisible(value){if(launch)launch.style.display=value?'':'none';if(!value)close();}};
}
