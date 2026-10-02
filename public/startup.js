// Independent of the module graph so stalled imports still offer recovery.
(() => {
  const panel = document.getElementById('app-startup');
  if (!panel) return;
  const message = document.getElementById('app-startup-message');
  const retry = document.getElementById('app-startup-retry');
  let finished = false;
  retry.hidden = true;
  retry.addEventListener('click', () => location.reload());
  const timer = setTimeout(() => {
    message.textContent = navigator.onLine === false
      ? 'You are offline. Reconnect, then try again.'
      : 'Loading is taking longer than usual. You can wait or try again.';
    retry.hidden = false;
  }, 12000);
  function fail() {
    if (finished) return;
    clearTimeout(timer);
    message.textContent = 'The app could not start. Please try again.';
    retry.hidden = false;
  }
  function onError(event) {
    if (event.target?.tagName === 'SCRIPT' || event.error) fail();
  }
  window.addEventListener('error', onError, true);
  window.appStartup = {
    fail,
    ready() {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      window.removeEventListener('error', onError, true);
      panel.remove();
    },
  };
})();
