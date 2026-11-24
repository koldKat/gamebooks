// Render active events, the next calendar event, and clearly labelled private previews.
import {seasonalEndTime,seasonalStartTime,formatSeasonalRemaining} from './remaining-time.js';

const bonusAccents = {
  'sim battle losses': 'sim-loss',
  'sim battle wins': 'sim-win',
  'battle deaths': 'battle-death',
  losses: 'loss',
  wins: 'win',
  heartbeats: 'heartbeat',
};
const bonusTerms = new RegExp(`(\\b(?:${Object.keys(bonusAccents).join('|')})\\b)`, 'gi');

function appendBonusDetails(details, description) {
  const normalized = description
    .replace(/\bdouble\s+XP\b/gi, '2x XP')
    .replace(/\btriple\s+XP\b/gi, '3x XP')
    .replace(/\b(\d+)[×x]\s+XP\b/gi, '$1x XP');
  for (const [index, part] of normalized.split(/(\b\d+x XP\b[^.;\n]*)/).entries()) {
    if (index % 2 === 0) {
      details.append(part);
      continue;
    }
    const bonus = document.createElement('span');
    bonus.className = 'seasonal-event-bonus';
    const multiplierEnd = part.search(/\bXP\b/i) + 2;
    const label = document.createElement('span');
    label.className = 'seasonal-event-multiplier';
    label.textContent = part.slice(0, multiplierEnd);
    bonus.append(label);
    for (const [termIndex, term] of part.slice(multiplierEnd).split(bonusTerms).entries()) {
      if (termIndex % 2 === 0) {
        bonus.append(term);
        continue;
      }
      const span = document.createElement('span');
      span.className = 'seasonal-event-' + bonusAccents[term.toLowerCase()];
      span.textContent = term;
      bonus.append(span);
    }
    details.append(bonus);
  }
}

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
    appendBonusDetails(details, event.description);
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
