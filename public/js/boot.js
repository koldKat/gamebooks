// Application entry point. Feature initialization lives in boot/.
import { bootState } from './boot/state.js';
import { initApp } from './boot/init.js';

window._isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);

// Prevent drag-selection from accidentally closing a modal on its backdrop.
document.addEventListener('mousedown', e => {
  bootState._mousedownOnOverlay = (e.target.classList.contains('modal-overlay') || e.target.classList.contains('pub-overlay') || e.target.classList.contains('inv-overlay')) ? e.target : null;
});

document.addEventListener('DOMContentLoaded', () => {
  return initApp().then(() => window.appStartup?.ready()).catch(error => {
    console.error('Application startup failed', error);
    window.appStartup?.fail();
  });
});
