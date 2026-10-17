const MAP_FORM = 'form[data-reading-map-entry]';

export function isReadingMapSection(data) {
  return /<form\b[^>]*\bdata-reading-map-entry(?:\s|=|>)/i.test(data.html || '');
}

export function readingChoices(data, existing = [], manualNavigation = false) {
  const choices = data.choices || [];
  if (!manualNavigation && !isReadingMapSection(data)) return choices;
  return [...new Set([...existing, ...choices])];
}

// Map edges are recorded only after the player chooses a printed marker.
export function bindReadingMapEntry(container, { canNavigate, onNavigate }) {
  for (const form of container.querySelectorAll(MAP_FORM)) {
    const input = form.querySelector('input[name="marker"]');
    const button = form.querySelector('button[type="submit"]');
    if (!input || !button) continue;
    input.disabled = button.disabled = !canNavigate();
    if (form.dataset?.readingMarkerTargets !== undefined) {
      input.addEventListener('input', () => input.setCustomValidity(''));
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!canNavigate() || !form.reportValidity()) return;
      const raw = input.value.trim();
      const marker = Number(raw);
      const max = Number(input.max);
      const prefix = form.dataset?.readingMarkerPrefix ?? '';
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(marker) || marker < 1
          || !Number.isSafeInteger(max) || max < 1 || marker > max
          || (prefix !== '' && !/^[a-z\u0400-\u04ff]{1,8}$/i.test(prefix))) return;
      let target = marker;
      const encodedTargets = form.dataset?.readingMarkerTargets;
      if (encodedTargets !== undefined) {
        try {
          const targets = JSON.parse(encodedTargets);
          if (!targets || Array.isArray(targets) || !Object.hasOwn(targets, String(marker))) {
            input.setCustomValidity(form.dataset.readingMarkerError || '');
            form.reportValidity();
            return;
          }
          target = targets[String(marker)];
          if (!Number.isSafeInteger(target) || target < 1) return;
        } catch {
          return;
        }
      }
      onNavigate(prefix ? `${prefix}${target}` : target);
    });
  }
}
