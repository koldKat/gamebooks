// Persist and apply the player's seasonal-decoration setting.
let fallbackEnabled = true;
export function seasonalEventsEnabled() {
  try { return localStorage.getItem('seasonal-events') !== '0'; }
  catch { return fallbackEnabled; }
}

export function syncSeasonalEventSetting() {
  const checkbox = document.getElementById('seasonal-events-cb');
  if (checkbox) checkbox.checked = !seasonalEventsEnabled();
}

export function applySeasonalEventsPreference(value) {
  fallbackEnabled = value !== '0';
  try { localStorage.setItem('seasonal-events', value === '0' ? '0' : '1'); } catch {}
  syncSeasonalEventSetting();
  window.dispatchEvent(new Event('seasonal-events-change'));
}

export function initSeasonalEventSettings(savePrefs) {
  syncSeasonalEventSetting();
  document.getElementById('seasonal-events-cb')?.addEventListener('change', event => {
    const value = event.target.checked ? '0' : '1';
    applySeasonalEventsPreference(value);
    savePrefs({ seasonalEvents: value });
  });
}
