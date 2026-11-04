// Hold incidental UI work until the current graph camera animation finishes.
let moving=false;
let release=null;
const waiting=new Set();

export function waitForCameraIdle(callback) {
  if (!moving) return false;
  waiting.add(callback);
  return true;
}

function flush() {
  if (moving) return;
  const callbacks=[...waiting];waiting.clear();
  for (const callback of callbacks) callback();
}

export function trackCameraMotion(network) {
  release?.();
  const original=new Map();
  const finished=()=>{moving=false;if(waiting.size)requestAnimationFrame(flush);};
  for (const method of ['focus','moveTo','fit']) {
    const fn=network[method];
    if (typeof fn!=='function') continue;
    original.set(method,fn);
    network[method]=function(...args) {
      const animation=(method==='focus'?args[1]:args[0])?.animation;
      const animated=!!animation && (typeof animation!=='object' || animation.duration!==0);
      const value=fn.apply(this,args);
      if (animated) moving=true;
      else if (moving) finished();
      return value;
    };
  }
  network.on('animationFinished',finished);
  network.on('dragStart',finished);
  release=()=>{
    network.off('animationFinished',finished);
    network.off('dragStart',finished);
    for (const [method,fn] of original) network[method]=fn;
    moving=false;release=null;if(waiting.size)requestAnimationFrame(flush);
  };
}

export function stopTrackingCameraMotion() {release?.();}
