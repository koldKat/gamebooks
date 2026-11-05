// Present confirmed collection rewards within the open dialog's top layer.
import {RUBY_SVG} from '../progression/rubies.js';
import {floatiesEnabled} from '../progression/floaties.js';
export function createCollectibleFeedback(dialog){
 let layer=null;
 const timers=new Map();
 let disposed=false;
 const clear=()=>{for(const timer of timers.values())clearTimeout(timer);timers.clear();layer?.remove();layer=null;};
 const changed=()=>{if(!floatiesEnabled())clear();};
 window.addEventListener('floaties-change',changed);
 return{
  show(){
   if(disposed||!floatiesEnabled())return;
   if(!layer){layer=document.createElement('div');layer.className='collectibles-reward-layer';layer.setAttribute('aria-live','polite');dialog.append(layer);}
   const chip=document.createElement('div');chip.className='reward-float reward-float--rubies';chip.setAttribute('aria-label','+1 diamond');chip.innerHTML=RUBY_SVG+'<span>+1</span>';layer.append(chip);
   timers.set(chip,setTimeout(()=>{chip.remove();timers.delete(chip);},5000));
  },
  dispose(){disposed=true;window.removeEventListener('floaties-change',changed);clear();},
 };
}
