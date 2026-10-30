// Present confirmed collection rewards within the open dialog's top layer.
import {RUBY_SVG} from '../progression/rubies.js';
export function createCollectibleFeedback(dialog){
 const layer=document.createElement('div');layer.className='collectibles-reward-layer';layer.setAttribute('aria-live','polite');dialog.append(layer);
 const timers=new Map();
 return{
  show(){
   const chip=document.createElement('div');chip.className='reward-float reward-float--rubies';chip.setAttribute('aria-label','+1 diamond');chip.innerHTML=RUBY_SVG+'<span>+1</span>';layer.append(chip);
   timers.set(chip,setTimeout(()=>{chip.remove();timers.delete(chip);},5000));
  },
  dispose(){for(const timer of timers.values())clearTimeout(timer);timers.clear();layer.remove();},
 };
}
