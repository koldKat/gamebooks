// Hold incidental UI work until the current graph camera animation finishes.
let moving=false;
let release=null;
let observedNetwork=null;
let animationEnded=true;
let minimumStopAt=0;
let lastView=null;
let lastChangedAt=0;
let stableFrames=0;
let watching=false;
let generation=0;
const waiting=new Set();
const SETTLE_MS=150;

export function waitForCameraIdle(callback) {
  if (!moving) return false;
  waiting.add(callback);
  watch();
  return true;
}

function flush() {
  if (moving) return;
  const callbacks=[...waiting];waiting.clear();
  for (const callback of callbacks) callback();
}

function watch() {
  if (watching || !moving || !waiting.size || !observedNetwork?.getViewPosition) return;
  watching=true;
  const currentGeneration=generation;
  requestAnimationFrame(function check(now) {
    if (currentGeneration!==generation) return;
    watching=false;
    if (!moving || !waiting.size) return;
    const position=observedNetwork.getViewPosition(),scale=observedNetwork.getScale();
    const view={x:position.x,y:position.y,scale};
    if (!lastView || Math.abs(view.x-lastView.x)>0.001 || Math.abs(view.y-lastView.y)>0.001
        || Math.abs(view.scale-lastView.scale)>0.000001) {
      stableFrames=0;lastChangedAt=now;
    } else stableFrames++;
    lastView=view;
    if (animationEnded && now>=minimumStopAt && stableFrames>=3 && now-lastChangedAt>=SETTLE_MS) {
      moving=false;flush();
    } else watch();
  });
}

export function trackCameraMotion(network) {
  release?.();
  generation++;watching=false;observedNetwork=network;
  const original=new Map();
  const finished=()=>{
    animationEnded=true;
    if (!network.getViewPosition) {moving=false;if(waiting.size)requestAnimationFrame(flush);}
    else watch();
  };
  for (const method of ['focus','moveTo','fit']) {
    const fn=network[method];
    if (typeof fn!=='function') continue;
    original.set(method,fn);
    network[method]=function(...args) {
      const animation=(method==='focus'?args[1]:args[0])?.animation;
      const animated=!!animation && (typeof animation!=='object' || animation.duration!==0);
      if (animated) {
        moving=true;animationEnded=false;lastView=null;stableFrames=0;
        const duration=typeof animation==='object' && Number.isFinite(animation.duration) ? Math.max(0,animation.duration) : 1000;
        minimumStopAt=performance.now()+duration;
      }
      let value;
      try { value=fn.apply(this,args); }
      catch(error) {minimumStopAt=0;finished();throw error;}
      if (!animated && moving) {minimumStopAt=0;finished();}
      if(animated)watch();
      return value;
    };
  }
  network.on('animationFinished',finished);
  const interrupted=()=>{minimumStopAt=0;finished();};
  network.on('dragStart',interrupted);
  release=()=>{
    network.off('animationFinished',finished);
    network.off('dragStart',interrupted);
    for (const [method,fn] of original) network[method]=fn;
    generation++;watching=false;observedNetwork=null;
    moving=false;release=null;if(waiting.size)requestAnimationFrame(flush);
  };
}

export function stopTrackingCameraMotion() {release?.();}
