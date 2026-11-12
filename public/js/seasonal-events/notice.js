// Render active events, the next calendar event, and clearly labelled private previews.
import {seasonalEndTime,seasonalStartTime,formatSeasonalRemaining} from './remaining-time.js';
export function renderSeasonalNotice(events, preview = null, date = new Date(), nextEvent = null) {
  const notice = document.getElementById('seasonal-event-notice');
  if (!notice) return;
  const upcoming = !events.length && !preview ? nextEvent : null;
  notice.hidden = !events.length && !preview && !upcoming;
  const updateRemaining=()=>{for(const node of notice.querySelectorAll('[data-season-end],[data-season-start]'))node.textContent=formatSeasonalRemaining(Number(node.dataset.seasonEnd ?? node.dataset.seasonStart),date.getTime());};
  const signature = JSON.stringify([events.map(event => [event.id,event.title,event.description,event.window?.end]), preview,
    upcoming && [upcoming.id,upcoming.name,upcoming.title,upcoming.window?.start]]);
  if (notice.dataset.seasonalContent === signature) { updateRemaining(); return; }
  notice.dataset.seasonalContent = signature;
  notice.dataset.season = events[0]?.id || upcoming?.id || '';
  notice.dataset.mode = upcoming ? 'upcoming' : 'active';
  notice.replaceChildren();
  if (upcoming) {
    const line = document.createElement('div'), title = document.createElement('strong');
    const name = document.createElement('span'); name.className = 'seasonal-event-name';
    name.textContent = upcoming.name || upcoming.title.replace(/ event active$/, '');
    title.append('Next event: ', name);
    const start = seasonalStartTime(upcoming);
    if (start !== null) {
      const countdown = document.createElement('span'), label = document.createElement('span'), remaining = document.createElement('span');
      countdown.className = 'seasonal-event-eta'; countdown.dataset.tooltip = 'Estimated time to start'; countdown.setAttribute('aria-live', 'off');
      label.className = 'seasonal-event-eta-label'; label.textContent = 'ETA:'; remaining.dataset.seasonStart = String(start);
      countdown.append(' (', label, ' ', remaining, ')'); title.append(countdown);
    }
    line.append(title); notice.append(line);
  }
  for (const event of events) {
    const line = document.createElement('div'), title = document.createElement('strong');
    line.dataset.season = event.id;
    title.textContent = preview ? `${event.title.replace(/ event active$/, '')} preview (only you)` : event.title;
    const end=preview?null:seasonalEndTime(event);
    if(end!==null){
      const countdown=document.createElement('span'),label=document.createElement('span'),remaining=document.createElement('span');
      countdown.className='seasonal-event-ete';countdown.dataset.tooltip='Estimated time to end';countdown.setAttribute('aria-live','off');
      label.className='seasonal-event-ete-label';label.textContent='ETE:';remaining.dataset.seasonEnd=String(end);
      countdown.append(' (',label,' ',remaining,')');title.append(countdown);
    }
    title.append(':');
    const details = document.createElement('span'); details.className = 'seasonal-event-details';
    line.append(title, ' ', details);
    for (const part of event.description.split(/(sim battle losses|sim battle wins|battle deaths|losses|wins|heartbeats)/)) {
      const classes = { 'battle deaths':'battle-death', losses:'loss', 'sim battle losses':'sim-loss',
        wins:'win', 'sim battle wins':'sim-win', heartbeats:'heartbeat' };
      if (classes[part]) {
        const span = document.createElement('span');
        span.className = 'seasonal-event-' + classes[part]; span.textContent = part; details.append(span);
      } else details.append(part);
    }
    notice.append(line);
  }
  if (preview) {
    const hint = document.createElement('div'); hint.className = 'seasonal-preview-hint';
    hint.textContent = preview === 'off' ? 'Season preview: no decorations. Rewards still follow live events.'
      : 'Preview only. Rewards still follow live events. Stop testing in Admin → Seasons.';
    notice.append(hint);
  }
  updateRemaining();
}
