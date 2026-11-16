// Preserve the library panel position while the play screen hides and rebuilds it.
import { afterLazyGroupsSettled } from '../books/lazy.js';
import { getToken } from '../core/state.js';

let saved = null;
let cancelRestore = () => {};

export function captureLibraryScroll() {
  const panel = document.getElementById('landing-right');
  if (!panel?.getClientRects().length) return;
  cancelRestore();
  saved = { token: getToken(), top: panel.scrollTop };
}

export function beginLibraryScrollRestore() {
  cancelRestore();
  if (!saved || saved.token !== getToken()) return () => {};
  const snapshot = saved, panel = document.getElementById('landing-right');
  if (!panel) return () => {};
  const controller = new AbortController();
  let canceled = false;
  cancelRestore = () => { canceled = true; controller.abort(); };
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    panel.addEventListener(type, cancelRestore, { passive: true, signal: controller.signal });
  }
  return (finished = false) => {
    const restore = () => {
      if (!canceled && snapshot.token === getToken()) panel.scrollTop = snapshot.top;
    };
    restore();
    requestAnimationFrame(() => afterLazyGroupsSettled(() => {
      restore();
      if (finished) controller.abort();
    }));
  };
}
