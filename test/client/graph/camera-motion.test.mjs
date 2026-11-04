import test from 'node:test';
import assert from 'node:assert/strict';
import {trackCameraMotion,stopTrackingCameraMotion,waitForCameraIdle} from '../../../public/js/graph/camera-motion.js';

test('camera work waits for the latest animation and coalesces repeated callbacks',()=>{
  const frames=[],listeners=new Map();let called=0;
  const oldRaf=globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame=fn=>frames.push(fn);
  const network={on:(event,fn)=>listeners.set(event,fn),off:event=>listeners.delete(event),
    focus(){return this;},moveTo(){return this;},fit(){return this;}};
  try {
    trackCameraMotion(network);network.focus(1,{animation:true});
    const callback=()=>called++;
    assert.equal(waitForCameraIdle(callback),true);waitForCameraIdle(callback);
    listeners.get('animationFinished')();network.focus(2,{animation:true});
    frames.shift()();assert.equal(called,0,'a replacement animation retains the pending work');
    listeners.get('animationFinished')();frames.shift()();assert.equal(called,1);
    assert.equal(waitForCameraIdle(callback),false);
    network.fit({animation:true});waitForCameraIdle(callback);
    network.moveTo({position:{x:0,y:0},animation:false});frames.shift()();assert.equal(called,2);
    network.focus(3,{animation:{duration:0}});assert.equal(waitForCameraIdle(callback),false);
  } finally {stopTrackingCameraMotion();globalThis.requestAnimationFrame=oldRaf;}
});

test('destroying a camera releases pending feedback and restores its methods',()=>{
  const frames=[],listeners=new Map();let called=0;
  const oldRaf=globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame=fn=>frames.push(fn);
  const focus=()=>42,network={focus,on:(event,fn)=>listeners.set(event,fn),off:event=>listeners.delete(event)};
  try {
    trackCameraMotion(network);assert.equal(network.focus(1,{animation:true}),42);
    waitForCameraIdle(()=>called++);stopTrackingCameraMotion();frames.shift()();
    assert.equal(called,1);assert.equal(network.focus,focus);assert.equal(listeners.size,0);
  } finally {stopTrackingCameraMotion();globalThis.requestAnimationFrame=oldRaf;}
});
