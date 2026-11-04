// Apply the shared preference for reward floaties on every app screen.
let fallbackDisabled = false;

export function floatiesEnabled() {
  try { return localStorage.getItem('disable-floaties') !== '1'; }
  catch { return !fallbackDisabled; }
}

function syncSetting() {
  const disabled = !floatiesEnabled();
  document.body?.classList.toggle('disable-floaties', disabled);
  const checkbox = document.getElementById('disable-floaties-cb');
  if (checkbox) checkbox.checked = disabled;
  if (disabled) document.querySelectorAll('.reward-float, .app-reward-float').forEach(chip => chip.remove());
  window.dispatchEvent(new Event('floaties-change'));
}

export function applyFloatiesPreference(value) {
  fallbackDisabled = value === '1';
  try { localStorage.setItem('disable-floaties', fallbackDisabled ? '1' : '0'); } catch {}
  syncSetting();
}

export function initFloatiesSettings(savePrefs) {
  syncSetting();
  document.getElementById('disable-floaties-cb')?.addEventListener('change', event => {
    const value = event.target.checked ? '1' : '0';
    applyFloatiesPreference(value);
    savePrefs({ disableFloaties: value });
  });
}

window.addEventListener('storage', event => {
  if (event.key === 'disable-floaties' || event.key === null) syncSetting();
});
syncSetting();
