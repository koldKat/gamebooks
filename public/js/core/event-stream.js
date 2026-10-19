export function connectEventStream(url, { onMessage, onOpen, onReconnect, enabled = () => true } = {}) {
  let source = null;
  let timer = null;
  let stopped = false;
  let missedEvents = false;
  let failures = 0;
  let connectingSince = 0;

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function closeSource() {
    if (!source) return;
    source.onopen = source.onmessage = source.onerror = null;
    source.close();
    source = null;
  }

  function retry() {
    clearTimer();
    closeSource();
    if (stopped || !enabled()) return;
    missedEvents = true;
    const delay = Math.min(1000 * 2 ** Math.min(failures++, 5), 30000);
    timer = setTimeout(open, delay);
  }

  function open() {
    clearTimer();
    if (stopped || !enabled() || typeof EventSource === 'undefined') return;
    closeSource();
    connectingSince = Date.now();
    try {
      const current = new EventSource(typeof url === 'function' ? url() : url);
      source = current;
      timer = setTimeout(retry, 30000);
      current.onopen = () => {
        if (source !== current || stopped) return;
        clearTimer();
        failures = 0;
        const catchUp = missedEvents;
        missedEvents = false;
        onOpen?.();
        if (catchUp) onReconnect?.();
      };
      current.onmessage = event => {
        if (source === current && !stopped) onMessage?.(event);
      };
      current.onerror = () => {
        if (source === current && !stopped) retry();
      };
    } catch (_) {
      retry();
    }
  }

  open();
  return {
    close() {
      stopped = true;
      clearTimer();
      closeSource();
    },
    resume(force = false) {
      if (stopped || !enabled()) return;
      if (force || source?.readyState === 2 ||
          (source?.readyState === 0 && Date.now() - connectingSince >= 30000)) {
        missedEvents = true;
        open();
      }
    },
  };
}
