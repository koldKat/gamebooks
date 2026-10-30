// Render live seasonal reward notices and clearly labelled private previews.
import {seasonalEndTime,formatSeasonalRemaining} from './remaining-time.js';
export function renderSeasonalNotice(events, preview = null, date = new Date()) {
  const notice = document.getElementById('seasonal-event-notice');
  if (!notice) return;
  notice.hidden = !events.length && !preview;
  const updateRemaining=()=>{for(const node of notice.querySelectorAll('[data-season-end]'))node.textContent=formatSeasonalRemaining(Number(node.dataset.seasonEnd),date.getTime());};
  const signature = JSON.stringify([events.map(event => [event.id,event.title,event.description,event.window?.end]), preview]);
  if (notice.dataset.seasonalContent === signature) { updateRemaining(); return; }
  notice.dataset.seasonalContent = signature;
  notice.dataset.season = events[0]?.id || '';
  notice.replaceChildren();
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
    line.append(title, ' ');
    for (const part of event.description.split(/(sim battle losses|sim battle wins|battle deaths|losses|wins)/)) {
      const classes = { 'battle deaths':'battle-death', losses:'loss', 'sim battle losses':'sim-loss',
        wins:'win', 'sim battle wins':'sim-win' };
      if (classes[part]) {
        const span = document.createElement('span');
        span.className = 'seasonal-event-' + classes[part]; span.textContent = part; line.append(span);
      } else line.append(part);
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
