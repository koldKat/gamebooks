// Shared on-demand vendor load for player and public run graphs.
let pending = null;

export function ensureGraphLibrary() {
  if (window.vis) return Promise.resolve();
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/vis-network/vis-network.min.js';
    script.onload = () => {
      if (window.vis) resolve();
      else fail();
    };
    const fail = () => {
      script.remove();
      pending = null;
      reject(new Error('Could not load graph library'));
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return pending;
}
