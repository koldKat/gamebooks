// Record visible companions and present the account's animated collection.
import {apiFetch,getToken} from '../core/state.js';
import {cursorDesigns} from './cursor-designs.js';
import {createDesignPreviews} from './cursor-previews.js';
import {updateRubiesDisplay} from '../progression/rubies.js';
import '../ui-helpers/dialog-escape.js';

let identity=getToken(),seen=new Set(),pending=new Set(),retryAt=new Map(),dialog,stopPreviews,request=0;
const designs=Object.values(cursorDesigns).flat();
const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('seasonal-collection'):null;
function reset(){
 identity=getToken();seen.clear();pending.clear();retryAt.clear();++request;
 dialog?.close();stopPreviews?.();stopPreviews=null;
}
function checkIdentity(){if(identity!==getToken())reset();return identity;}
function changed(){channel?.postMessage({changed:true});}

export async function recordSeenCompanion(id){
 const token=checkIdentity();
 if(!token||seen.has(id)||pending.has(id)||(retryAt.get(id)||0)>Date.now())return;
 pending.add(id);
 try{
  const response=await apiFetch(`/api/collectibles/${id}/seen`,{method:'POST'});
  if(!response.ok)throw Error();
  const data=await response.json();
  if(getToken()!==token)return;
  for(const item of data.items||[])seen.add(item);
  if(!seen.has(id))retryAt.set(id,Date.now()+5000);
  else changed();
 }catch{if(getToken()===token)retryAt.set(id,Date.now()+5000);}
 finally{if(getToken()===token)pending.delete(id);}
}

export async function openCollectibles(){
 const token=checkIdentity();if(!token)return;
 if(!dialog){
  dialog=document.createElement('dialog');dialog.id='collectibles-dialog';
  dialog.setAttribute('aria-labelledby','collectibles-title');
  dialog.innerHTML='<header><h2 id="collectibles-title">Collectibles</h2><button type="button" data-dialog-close aria-label="Close">×</button></header><div class="collectibles-body"></div>';
  dialog.querySelector('[data-dialog-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{if(dialog.open)return;++request;stopPreviews?.();stopPreviews=null;dialog.querySelector('.collectibles-body').replaceChildren();});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  document.body.append(dialog);
 }
 if(!dialog.open)dialog.showModal();
 const sequence=++request,body=dialog.querySelector('.collectibles-body');
 stopPreviews?.();stopPreviews=null;body.textContent='Loading…';
 try{
  const response=await apiFetch('/api/collectibles');if(!response.ok)throw Error();
  const data=await response.json();
  if(sequence!==request||token!==getToken()||!dialog.open)return;
  const collected=designs.filter(d=>data.items.includes(d.id));
  body.textContent=collected.length?'':'No collectibles yet.';
  stopPreviews=createDesignPreviews(body,collected,id=>claim(id,token));
 }catch{if(sequence===request&&token===getToken()&&dialog.open)body.textContent='Unable to load. Close and try again.';}
}

const claiming=new Set();
async function claim(id,token){
 if(token!==getToken()||claiming.has(token+id))return;
 claiming.add(token+id);
 try{
  const response=await apiFetch(`/api/collectibles/${id}/claim`,{method:'POST'});
  if(response.ok&&token===getToken()){
   const profile=await apiFetch('/api/profile');
   if(profile.ok){const data=await profile.json();if(token===getToken())updateRubiesDisplay(data.rubiesBalance,data);}
   changed();
  }
 }catch{}finally{claiming.delete(token+id);}
}

document.addEventListener('click',event=>{if(event.target.closest?.('[data-open-collectibles]'))openCollectibles();});
window.addEventListener('auth-token-change',reset);
window.addEventListener('auth-expired',reset);
window.addEventListener('storage',event=>{if(event.key===null||event.key==='gamebook_auth_token')reset();});
channel?.addEventListener('message',()=>{if(dialog?.open)openCollectibles();});
