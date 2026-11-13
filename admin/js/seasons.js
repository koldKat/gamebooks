// Admin seasonal calendar and private account-scoped visual preview controls.
import { seasonalEvents, activeSeasonalEvents, reloadSeasonalCalendar } from '/js/seasonal-events/calendar.js';
import { orderedSeasonOccurrences, seasonalDay } from '/js/seasonal-events/schedule.js';
import { setSeasonPreviewUser, seasonPreview, setSeasonPreview, applySeasonPreviewPreference, isSeasonPreviewStorageKey } from '/js/seasonal-events/preview.js';
import { apiFetch, getToken } from '/js/core/state.js';
import {createCursorPreviews} from '/js/seasonal-events/cursor-previews.js';
import { loadSeasonReports } from './season-reports.js';
let bound = false;
let stopPreviews=()=>{};
let renderedDay = null;
function renderSeasonCards(preview = null, canTest = false) {
  const target = document.getElementById('seasons-list');
  stopPreviews(); target.replaceChildren();
  const previewStops=[]; stopPreviews=()=>previewStops.forEach(stop=>stop());
  const now = new Date();
  renderedDay = seasonalDay(now);
  for (const { event, window } of orderedSeasonOccurrences(seasonalEvents, now)) {
    const card = document.createElement('section'); card.className = 'season-card';
    const heading = document.createElement('h3'); heading.textContent = event.title.replace(/ event active$/, '');
    const dates = document.createElement('p');
    dates.textContent = window ? `${window.start} – ${window.end} · Europe/Sofia · automatic every year`
      : 'The next festival date needs adding to the calendar.';
    if (event.skipOverlaps) dates.textContent = `${window ? window.start+' – '+window.end+' · ' : ''}Every Friday the 13th, ±1 day; overlapping occurrences skipped.`;
    const detail = document.createElement('p'); detail.textContent = event.description;
    const test = document.createElement('button'); test.className = 'btn-warn'; test.textContent = 'Test season';
    test.disabled = !canTest || preview === event.id; test.dataset.seasonTest = event.id;
    test.addEventListener('click', () => changePreview(event.id));
    card.append(heading, dates, detail, test); target.append(card);
    previewStops.push(createCursorPreviews(card,event.id));
  }
  document.getElementById('seasons-automatic').disabled = !canTest || !preview;
  document.getElementById('seasons-off').disabled = !canTest || preview === 'off';
}
export async function loadSeasons() {
  void loadSeasonReports();
  const refresh = document.getElementById('season-payout-refresh');
  refresh.onclick = loadSeasonReports;
  const target = document.getElementById('seasons-list'), status = document.getElementById('seasons-status');
  // Calendar cards remain available even if the main-app preview session expired.
  if (!target.children.length || renderedDay !== seasonalDay()) renderSeasonCards();
  for (const button of document.querySelectorAll('[data-season-test],#seasons-automatic,#seasons-off')) button.disabled = true;
  if (!bound) {
    bound = true;
    document.getElementById('seasons-automatic').addEventListener('click', () => changePreview(null));
    document.getElementById('seasons-off').addEventListener('click', () => changePreview('off'));
    window.addEventListener('storage', event => { if (isSeasonPreviewStorageKey(event.key)) loadSeasons(); });
    setInterval(() => {
      if (!document.hidden && document.getElementById('tab-seasons').classList.contains('active')) {
        if (renderedDay !== seasonalDay()) void loadSeasons();
        else void loadSeasonReports();
      }
    }, 60_000);
  }
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
    renderSeasonCards(preview, true);
  } catch (error) {
    status.textContent = error.message;
    for (const button of document.querySelectorAll('[data-season-test],#seasons-automatic,#seasons-off')) button.disabled = true;
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
