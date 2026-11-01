// Bind printed instructions that explicitly return to the previous entry in the run.
export function bindReadingPreviousEntry(container, { canNavigate, getPath = () => [], onNavigate = () => {} }) {
  function destination() {
    const path = getPath();
    if (!Array.isArray(path) || path.length < 2) return null;
    const value = path.at(-2);
    if (Number.isSafeInteger(value) && value > 0 && value <= 999999) return value;
    if (typeof value === 'string' && /^(?:[1-9]\d{0,5}[a-zA-Z]?|[a-zA-Z][a-zA-Z0-9_-]{0,63})$/.test(value)) return value;
    return null;
  }
  for (const link of container.querySelectorAll('a[href="#reading-previous-entry"]')) {
    link.setAttribute('aria-disabled', String(!canNavigate() || destination() === null));
    link.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!canNavigate()) return;
      const previous = destination();
      if (previous !== null) onNavigate(previous);
    });
  }
}
