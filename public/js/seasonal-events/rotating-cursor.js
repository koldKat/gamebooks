// Rarely reform the active mouse companion with a brief, bounded particle animation.
export function createRotatingCursor(designs,{random=Math.random,preview=false,switchDelay=()=>720000+random()*480000}={}){
 let index=Math.floor(random()*designs.length),current=designs[index].create({random,preview}),remaining=switchDelay(),timer=null,lastTick=null,lastActivity=0,point,transition=null,disposed=false;
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 const allowed=()=>!disposed&&!document.hidden&&!document.pointerLockElement&&!motion.matches&&!document.body.classList.contains('reduce-motion');
 function account(){if(lastTick!==null){const end=Math.min(performance.now(),lastActivity+15000);remaining-=Math.max(0,end-lastTick);lastTick=null;}}
 function pause(){account();clearTimeout(timer);timer=null;if(transition)transition.finish(false);}
 function arm(){if(timer!==null||!allowed()||!point||transition)return;lastTick=performance.now();timer=setTimeout(tick,Math.min(15000,Math.max(1,remaining)));}
 function tick(){timer=null;account();if(!allowed())return;if(remaining<=0){reform();return;}if(performance.now()-lastActivity<15000)arm();}
 function move(event){
  if(event.pointerType!=='mouse'){pause();return;}
  point={pointerType:'mouse',clientX:event.clientX,clientY:event.clientY};lastActivity=performance.now();arm();
 }
 function reform(){
  if(!allowed()||!current.node||current.node.hidden){remaining=switchDelay();return;}
  const next=(index+1+Math.floor(random()*(designs.length-1)))%designs.length,old=current,rect=old.node.getBoundingClientRect();
  const canvas=document.createElement('canvas'),ratio=Math.min(2,devicePixelRatio||1),size=128;
  canvas.className='seasonal-cursor-particles';canvas.setAttribute('aria-hidden','true');canvas.width=canvas.height=size*ratio;
  canvas.style.left=Math.max(0,Math.min(innerWidth-size,rect.left+rect.width/2-size/2))+'px';canvas.style.top=Math.max(0,Math.min(innerHeight-size,rect.top+rect.height/2-size/2))+'px';document.body.append(canvas);
  const ctx=canvas.getContext('2d');
  if(!ctx){canvas.remove();old();index=next;current=designs[index].create({random,preview});current.move(point);remaining=switchDelay();return;}
  ctx.scale(ratio,ratio);
  const cx=rect.left+rect.width/2-parseFloat(canvas.style.left),cy=rect.top+rect.height/2-parseFloat(canvas.style.top);
  const pieces=Array.from({length:24},(_,i)=>{const angle=i/24*Math.PI*2,radius=24+random()*25;return{x:(i%6-2.5)*5,y:(Math.floor(i/6)-1.5)*6,dx:Math.cos(angle)*radius,dy:Math.sin(angle)*radius,color:designs[index].colors[i%designs[index].colors.length],target:designs[next].colors[i%designs[next].colors.length]};});
  let frame=null,start=null,mounted=false,oldDisposed=false,finished=false;
  function mount(){if(mounted)return;mounted=true;if(!oldDisposed){old();oldDisposed=true;}index=next;current=designs[index].create({random,preview});current.node.style.opacity='0';current.move(point);}
  function finish(resume=true){if(finished)return;finished=true;cancelAnimationFrame(frame);mount();current.node.style.removeProperty('opacity');if(!resume)current.hide();canvas.remove();transition=null;remaining=switchDelay();if(resume&&allowed()&&performance.now()-lastActivity<15000)arm();}
  function draw(now){
   if(finished)return;if(!allowed()){finish();return;}start??=now;const p=Math.min(1,(now-start)/1800);
   if(p>.12&&!oldDisposed){old();oldDisposed=true;}else if(!oldDisposed)old.node.style.opacity=String(Math.max(0,1-p/.12));
   if(p>=.5)mount();ctx.clearRect(0,0,size,size);
   let tx=cx,ty=cy;if(mounted&&!current.node.hidden){const box=current.node.getBoundingClientRect();tx=box.left+box.width/2-parseFloat(canvas.style.left);ty=box.top+box.height/2-parseFloat(canvas.style.top);}
   const progress=p<.5?Math.sin(p*Math.PI):Math.cos((p-.5)*Math.PI),blend=Math.max(0,(p-.5)*2);
   ctx.globalAlpha=p>.85?(1-p)/.15:1;
   for(const piece of pieces){ctx.fillStyle=p<.5?piece.color:piece.target;ctx.fillRect(cx+(tx-cx)*blend+piece.x+piece.dx*progress,cy+(ty-cy)*blend+piece.y+piece.dy*progress,3.5,3.5);}
   if(mounted)current.node.style.opacity=String(Math.max(0,(p-.8)/.2));
   if(p===1)finish();else frame=requestAnimationFrame(draw);
  }
  transition={finish};frame=requestAnimationFrame(draw);
 }
 const observer=new MutationObserver(()=>{if(!allowed())pause();});observer.observe(document.body,{attributes:true,attributeFilter:['class']});
 document.addEventListener('pointermove',move,{passive:true});document.addEventListener('pointerdown',eventDown,{passive:true});
 function eventDown(event){if(event.pointerType!=='mouse')pause();}
 document.addEventListener('visibilitychange',pause);document.addEventListener('pointerlockchange',pause);document.documentElement.addEventListener('pointerleave',pause);
 window.addEventListener('blur',pause);window.addEventListener('resize',pause);motion.addEventListener('change',pause);
 return()=>{disposed=true;pause();current();observer.disconnect();document.removeEventListener('pointermove',move);document.removeEventListener('pointerdown',eventDown);document.removeEventListener('visibilitychange',pause);document.removeEventListener('pointerlockchange',pause);document.documentElement.removeEventListener('pointerleave',pause);window.removeEventListener('blur',pause);window.removeEventListener('resize',pause);motion.removeEventListener('change',pause);};
}
