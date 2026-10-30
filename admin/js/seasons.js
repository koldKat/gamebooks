// Admin seasonal calendar and private account-scoped visual preview controls.
import { seasonalEvents, activeSeasonalEvents, seasonWindow, reloadSeasonalCalendar } from '/js/seasonal-events/calendar.js';
import { setSeasonPreviewUser, seasonPreview, setSeasonPreview, applySeasonPreviewPreference, isSeasonPreviewStorageKey } from '/js/seasonal-events/preview.js';
import { apiFetch, getToken } from '/js/core/state.js';
import {createCursorPreviews} from '/js/seasonal-events/cursor-previews.js';
let bound = false;
let stopPreviews=()=>{};
export async function loadSeasons() {
  const target = document.getElementById('seasons-list'), status = document.getElementById('seasons-status');
  try {
    const sessionToken = getToken();
    const response = await apiFetch('/api/profile');
    if (!response.ok) throw Error('Sign in to your administrator account in the main app first.');
    const profile = await response.json();
    if (getToken() !== sessionToken) return loadSeasons();
    setSeasonPreviewUser(profile);
    if (profile.isAdmin !== true) throw Error('Sign in to your administrator account in the main app first.');
    const prefsResponse = await apiFetch('/api/prefs');
    if (!prefsResponse.ok) throw Error('Could not load your seasonal preview.');
    const prefs = await prefsResponse.json();
    if (getToken() !== sessionToken) return loadSeasons();
    applySeasonPreviewPreference(prefs.seasonPreview ?? 'automatic');
    await reloadSeasonalCalendar();
    const preview = seasonPreview(), live = activeSeasonalEvents();
    status.textContent = `Live now: ${live.map(event => event.title.replace(/ event active$/, '')).join(', ') || 'none'}. Your preview: ${preview === 'off' ? 'no season' : preview || 'automatic'}.`;
    stopPreviews();target.replaceChildren();
    const previewStops=[];stopPreviews=()=>previewStops.forEach(stop=>stop());
    const year = Number(new Intl.DateTimeFormat('en', {timeZone:'Europe/Sofia',year:'numeric'}).format(new Date()));
    for (const event of seasonalEvents) {
      const card = document.createElement('section'); card.className = 'season-card';
      const name = event.title.replace(/ event active$/, '');
      const heading = document.createElement('h3'); heading.textContent = name;
      const dates = document.createElement('p'), window = seasonWindow(event,year);
      dates.textContent = window ? `${window.start} – ${window.end} · Europe/Sofia · automatic every year`
        : 'This year’s festival date needs adding to the calendar.';
      const detail = document.createElement('p'); detail.textContent = event.description;
      const test = document.createElement('button'); test.className = 'btn-warn'; test.textContent = 'Test season';
      test.disabled = preview === event.id; test.dataset.seasonTest = event.id;
      test.addEventListener('click', () => changePreview(event.id));
      card.append(heading, dates, detail);
      card.append(test); target.append(card);previewStops.push(createCursorPreviews(card,event.id));
    }
    document.getElementById('seasons-automatic').disabled = !preview;
    document.getElementById('seasons-off').disabled = preview === 'off';
    if (!bound) {
      bound = true;
      document.getElementById('seasons-automatic').addEventListener('click', () => changePreview(null));
      document.getElementById('seasons-off').addEventListener('click', () => changePreview('off'));
      window.addEventListener('storage', event => { if (isSeasonPreviewStorageKey(event.key)) loadSeasons(); });
    }
  } catch (error) {
    stopPreviews();
    status.textContent = error.message;
    target.replaceChildren();
    for (const id of ['seasons-automatic','seasons-off']) document.getElementById(id).disabled = true;
  }
}
async function changePreview(value) {
  const buttons = [...document.querySelectorAll('#tab-seasons button')].map(button=>[button,button.disabled]);
  try {
    const sessionToken = getToken();
    for (const [button] of buttons) button.disabled = true;
    const response = await apiFetch('/api/prefs', { method:'PATCH', body:JSON.stringify({seasonPreview:value ?? 'automatic'}) });
    if (!response.ok) throw Error('Could not save your seasonal preview.');
    if (getToken() !== sessionToken) return loadSeasons();
    setSeasonPreview(value); await loadSeasons();
  }
  catch (error) {
    for (const [button,disabled] of buttons) if (button.isConnected) button.disabled = disabled;
    document.getElementById('seasons-status').textContent = error.message;
  }
}
