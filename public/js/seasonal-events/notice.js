// Render live seasonal reward notices and clearly labelled private previews.
export function renderSeasonalNotice(events, preview = null) {
  const notice = document.getElementById('seasonal-event-notice');
  if (!notice) return;
  notice.hidden = !events.length && !preview;
  const signature = JSON.stringify([events.map(event => [event.id,event.title,event.description]), preview]);
  if (notice.dataset.seasonalContent === signature) return;
  notice.dataset.seasonalContent = signature;
  notice.dataset.season = events[0]?.id || '';
  notice.replaceChildren();
  for (const event of events) {
    const line = document.createElement('div'), title = document.createElement('strong');
    line.dataset.season = event.id;
    title.textContent = preview ? `${event.title.replace(/ event active$/, '')} preview (only you):` : event.title + ':';
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
}
