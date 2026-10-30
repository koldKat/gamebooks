// Run the actual companion animations only while their admin previews are visible.
import {cursorDesigns} from './cursor-designs.js';
export function createCursorPreviews(holder,season){
 const gallery=document.createElement('div');gallery.className='season-cursor-gallery';
 const previews=(cursorDesigns[season]||[]).map(design=>{
  const item=document.createElement('figure'),host=document.createElement('div'),label=document.createElement('figcaption');
  host.className='season-cursor-preview seasonal-inline-preview';host.dataset.cursorPreview=design.id;host.setAttribute('aria-hidden','true');label.textContent=design.label;
  item.append(host,label);gallery.append(item);return{host,design,visible:false,stop:null};
 });
 holder.append(gallery);let disposed=false;
 function sync(){for(const item of previews){
  if(!disposed&&item.visible&&!document.hidden&&item.host.isConnected){if(!item.stop)item.stop=item.design.create({host:item.host,preview:true});}
  else if(item.stop){item.stop();item.stop=null;}
 }}
 const observer=new IntersectionObserver(entries=>{for(const entry of entries){const item=previews.find(p=>p.host===entry.target);item.visible=entry.isIntersecting;}sync();},{threshold:.05});
 for(const item of previews)observer.observe(item.host);
 document.addEventListener('visibilitychange',sync);
 return()=>{disposed=true;observer.disconnect();document.removeEventListener('visibilitychange',sync);sync();gallery.remove();};
}
