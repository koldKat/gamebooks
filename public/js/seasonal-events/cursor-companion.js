// Manage decorative mouse companion motion, timed actions and complete lifecycle cleanup.
export function createCursorCompanion({name,svg,actions,face=false,random=Math.random,preview=false,host=null}) {
  const node=document.createElement('div');node.className='seasonal-companion seasonal-'+name;node.hidden=!host;
  node.setAttribute('aria-hidden','true');node.innerHTML='<svg viewBox="0 0 48 48" focusable="false">'+svg+'</svg>';(host||document.body).append(node);
  const motion=matchMedia('(prefers-reduced-motion: reduce)'),timers=new Set(),pending=new Set(preview?actions.map(a=>a.name):[]);
  let frame,point,currentAction;
  const animate=()=>!motion.matches;
  function after(callback,ms){const id=setTimeout(()=>{timers.delete(id);callback();},ms);timers.add(id);return id;}
  function clear(){for(const id of timers)clearTimeout(id);timers.clear();node.classList.remove('is-blinking',...actions.map(a=>a.name));currentAction=null;node.style.setProperty('--companion-look-x','0px');node.style.setProperty('--companion-look-y','0px');}
  function action(effect){after(()=>{
    if(node.hidden||!animate())return;
    if(!currentAction){pending.delete(effect.name);currentAction=effect.name;node.classList.add(effect.name);after(()=>{node.classList.remove(effect.name);currentAction=null;},effect.duration);}
    action(effect);
  },pending.has(effect.name)?effect.previewDelay+random()*1500:host?20000+random()*5000:effect.delay+random()*effect.spread);}
  function blink(){after(()=>{if(node.hidden||!animate())return;node.classList.add('is-blinking');after(()=>node.classList.remove('is-blinking'),150);blink();},3200+random()*4200);}
  function look(){after(()=>{if(node.hidden||!animate())return;node.style.setProperty('--companion-look-x',(random()*4-2).toFixed(1)+'px');node.style.setProperty('--companion-look-y',(random()*2-1).toFixed(1)+'px');look();},1700+random()*2600);}
  function start(){clear();if(!node.hidden&&animate()){actions.forEach(action);if(face){blink();look();}}}
  function hide(){node.hidden=true;cancelAnimationFrame(frame);frame=null;clear();}
  function move(event){
    if(event.pointerType!=='mouse'||document.hidden||document.pointerLockElement)return hide();
    point={x:event.clientX,y:event.clientY};if(frame!=null)return;
    frame=requestAnimationFrame(()=>{frame=null;
      const size=parseFloat(getComputedStyle(node).width)||36,reserve=size+42;
      const x=point.x+size+14>innerWidth?point.x-size-14:point.x+14,y=point.y+reserve+20>innerHeight?point.y-reserve:point.y+20;
      node.style.transform='translate3d('+Math.max(0,x)+'px,'+Math.max(44,y)+'px,0)';
      if(node.hidden){node.hidden=false;start();}
    });
  }
  function down(event){if(event.pointerType!=='mouse')hide();}
  let previousMotion=animate();
  function changed(){const next=animate();if(next!==previousMotion){previousMotion=next;start();}}
  const observer=new MutationObserver(changed);observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  motion.addEventListener('change',changed);
  if(!host){
  document.addEventListener('pointermove',move,{passive:true});document.addEventListener('pointerdown',down,{passive:true});
  document.documentElement.addEventListener('pointerleave',hide);
  for(const type of ['blur','resize'])window.addEventListener(type,hide);
  for(const type of ['visibilitychange','pointerlockchange'])document.addEventListener(type,hide);
  }else start();
  const dispose=()=>{hide();observer.disconnect();motion.removeEventListener('change',changed);
    document.removeEventListener('pointermove',move);document.removeEventListener('pointerdown',down);
    document.documentElement.removeEventListener('pointerleave',hide);
    for(const type of ['blur','resize'])window.removeEventListener(type,hide);
    for(const type of ['visibilitychange','pointerlockchange'])document.removeEventListener(type,hide);
    node.remove();};
  return Object.assign(dispose,{node,move,hide});
}
