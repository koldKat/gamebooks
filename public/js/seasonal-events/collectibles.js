// Record visible companions and present the account's animated collection.
import {apiFetch,getToken} from '../core/state.js';
import {cursorDesigns} from './cursor-designs.js';
import {createDesignPreviews} from './cursor-previews.js';
import {seasonalEvents} from './calendar.js';
import {updateRubiesDisplay} from '../progression/rubies.js';
import {initTooltip} from '../ui-helpers/tooltip.js';
import {createCollectibleFeedback} from './collectible-feedback.js';
import '../ui-helpers/dialog-escape.js';

let identity=getToken(),seen=new Set(),pending=new Set(),retryAt=new Map(),dialog,stopPreviews,feedback,request=0;
let collectionKey=null;
const fresh=new Set(),displayedNew=new Set();
function updatePulse(){
 for(const button of document.querySelectorAll('[data-open-collectibles]'))button.classList.toggle('collectibles-btn--new',fresh.size>0&&!dialog?.open);
}
function readFresh(){
 fresh.clear();
 try{for(const id of JSON.parse(localStorage.getItem(collectionKey)||'[]'))if(designs.some(d=>d.id===id))fresh.add(id);}catch{}
}
function saveFresh(){
 if(collectionKey)try{localStorage.setItem(collectionKey,JSON.stringify([...fresh]));}catch{}
 updatePulse();
}
function acceptCollection(data,newId){
 if(data.userId!=null){collectionKey='gamebook_collectibles_new_'+data.userId;readFresh();}
 if(newId&&data.newlyCollected)fresh.add(newId);
 if(dialog?.open){for(const id of fresh)displayedNew.add(id);fresh.clear();}
 saveFresh();
}
const designs=Object.values(cursorDesigns).flat();
const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('seasonal-collection'):null;
function unloadItems(){
 ++request;stopPreviews?.();stopPreviews=null;
 feedback?.dispose();feedback=null;
 dialog?.querySelector('.collectibles-body').replaceChildren();
}
function closeCollectibles(){unloadItems();displayedNew.clear();dialog?.close();updatePulse();}
function reset(){
 identity=getToken();seen.clear();pending.clear();retryAt.clear();++request;
 collectionKey=null;fresh.clear();displayedNew.clear();
 closeCollectibles();
 if(identity)refreshCollection();
}
function checkIdentity(){if(identity!==getToken())reset();return identity;}
function changed(){channel?.postMessage({changed:true});}
async function refreshCollection(){
 const token=checkIdentity();if(!token)return;
 try{const response=await apiFetch('/api/collectibles');if(!response.ok)return;
 const data=await response.json();if(token!==getToken())return;
 acceptCollection(data);
 }catch{}
}

export async function recordSeenCompanion(id){
 const token=checkIdentity();
 if(!token||seen.has(id)||pending.has(id)||(retryAt.get(id)||0)>Date.now())return;
 pending.add(id);
 try{
  const response=await apiFetch(`/api/collectibles/${id}/seen`,{method:'POST'});
  if(!response.ok)throw Error();
  const data=await response.json();
  if(getToken()!==token)return;
  acceptCollection(data,id);
  for(const item of data.items||[])seen.add(item);
  if(!seen.has(id))retryAt.set(id,Date.now()+5000);
  else {changed();if(dialog?.open)openCollectibles();}
 }catch{if(getToken()===token)retryAt.set(id,Date.now()+5000);}
 finally{if(getToken()===token)pending.delete(id);}
}

export async function openCollectibles(){
 const token=checkIdentity();if(!token)return;
 initTooltip();
 if(!dialog){
  dialog=document.createElement('dialog');dialog.id='collectibles-dialog';
  dialog.setAttribute('aria-labelledby','collectibles-title');
  dialog.innerHTML='<header><h2 id="collectibles-title">Collectibles</h2><button type="button" data-dialog-close aria-label="Close">×</button></header><div class="collectibles-body"></div>';
  dialog.querySelector('[data-dialog-close]').addEventListener('click',closeCollectibles);
  dialog.addEventListener('cancel',unloadItems);
  dialog.addEventListener('close',()=>{if(!dialog.open){unloadItems();displayedNew.clear();updatePulse();}});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeCollectibles();}});
  document.body.append(dialog);
 }
 if(!dialog.open)dialog.showModal();
 for(const id of fresh)displayedNew.add(id);
 fresh.clear();saveFresh();
 const sequence=++request,body=dialog.querySelector('.collectibles-body');
 stopPreviews?.();stopPreviews=null;body.textContent='Loading…';
 try{
  const response=await apiFetch('/api/collectibles');if(!response.ok)throw Error();
  const data=await response.json();
  if(sequence!==request||token!==getToken()||!dialog.open)return;
  acceptCollection(data);
  const collected=designs.filter(d=>data.items.includes(d.id))
   .sort((a,b)=>(data.collectedAt?.[b.id]||0)-(data.collectedAt?.[a.id]||0));
  body.replaceChildren();
  if(!collected.length){
   const empty=document.createElement('p');empty.className='collectibles-empty';
   empty.textContent='You have no collectibles yet.';empty.setAttribute('role','status');
   body.append(empty);return;
  }
  const dateFormat=new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeZone:'Europe/Sofia'});
  stopPreviews=createDesignPreviews(body,collected,id=>claim(id,token),id=>{
   const season=Object.entries(cursorDesigns).find(([,entries])=>entries.some(d=>d.id===id))?.[0];
   const event=seasonalEvents.find(e=>e.id===season)?.title.replace(/ event active$/,'')||season;
   const timestamp=data.collectedAt?.[id];
   return event+(Number.isFinite(timestamp)?'\nClaimed: '+dateFormat.format(new Date(timestamp)):'');
  });
  for(const host of body.querySelectorAll('[data-cursor-preview]'))if(displayedNew.has(host.dataset.cursorPreview)){
   host.parentElement.classList.add('collectible-item--new');
  }
 }catch{if(sequence===request&&token===getToken()&&dialog.open)body.textContent='Unable to load. Close and try again.';}
}

const claiming=new Set();
async function claim(id,token){
 if(token!==getToken()||claiming.has(token+id))return;
 claiming.add(token+id);
 try{
  const response=await apiFetch(`/api/collectibles/${id}/claim`,{method:'POST'});
  if(response.ok&&token===getToken()){
   const result=await response.json();
   if(token!==getToken())return;
   if(result.awarded&&dialog?.open){feedback??=createCollectibleFeedback(dialog);feedback.show();}
   const profile=await apiFetch('/api/profile');
   if(profile.ok){const data=await profile.json();if(token===getToken())updateRubiesDisplay(data.rubiesBalance,data);}
   changed();
  }
 }catch{}finally{claiming.delete(token+id);}
}

document.addEventListener('click',event=>{if(event.target.closest?.('[data-open-collectibles]'))openCollectibles();});
window.addEventListener('auth-token-change',reset);
window.addEventListener('auth-expired',reset);
window.addEventListener('storage',event=>{if(event.key===null||event.key==='gamebook_auth_token')reset();else if(event.key===collectionKey){readFresh();if(dialog?.open)openCollectibles();else updatePulse();}});
channel?.addEventListener('message',()=>{if(dialog?.open)openCollectibles();else refreshCollection();});
if(identity)refreshCollection();
