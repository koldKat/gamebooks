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

test('an early completion event cannot release feedback while the view is still moving',()=>{
  const frames=[],listeners=new Map();let called=0,x=0,scale=1;
  const oldRaf=globalThis.requestAnimationFrame,base=performance.now();
  globalThis.requestAnimationFrame=fn=>frames.push(fn);
  const network={focus(){},getViewPosition:()=>({x,y:0}),getScale:()=>scale,
    on:(event,fn)=>listeners.set(event,fn),off:event=>listeners.delete(event)};
  const tick=(time,position,zoom=scale)=>{x=position;scale=zoom;frames.shift()(base+time);};
  try {
    trackCameraMotion(network);network.focus(1,{animation:{duration:1000}});
    waitForCameraIdle(()=>called++);tick(100,10);listeners.get('animationFinished')();
    tick(500,20);tick(1200,30);tick(1300,40);tick(1400,50);
    assert.equal(called,0,'moving after the completion event still blocks feedback');
    tick(1500,50,1.1);tick(1600,50,1.2);tick(1700,50);tick(1800,50);assert.equal(called,0);
    tick(1900,50);assert.equal(called,1,'feedback waits for stable position and zoom');
  } finally {stopTrackingCameraMotion();globalThis.requestAnimationFrame=oldRaf;}
});
