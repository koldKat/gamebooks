import { feedHooks as _hooks } from './state.js';
import { escapeHtml } from '../util.js';
import { t } from '../i18n.js';
import { renderEntry, _makeEntryHtml } from './entries.js';

export function createDayRenderer() {
  const COLLAPSE_THRESHOLD = 6;

  function entryUserKey(e) {
    if (e.usernames && e.usernames.length > 1) {
      return e.usernames.map(u => u.username).sort().join('\x00');
    }
    return e.username || '';
  }

  function renderGroupLabel(firstEntry, k) {
    if (firstEntry.usernames && firstEntry.usernames.length > 1) {
      const sorted = [...firstEntry.usernames].sort((a, b) => a.username.localeCompare(b.username));
      const parts = sorted.map((u, i) => {
          const dn     = escapeHtml(_hooks.displayFor?.(u.username) ?? u.username);
          const badges = (_hooks.adminBadge?.(u.username) ?? '') + (_hooks.authorBadge?.(u.username) ?? '') + (_hooks.contributorBadge?.(u.username) ?? '');
          const comma  = i < sorted.length - 1 ? ',' : '';
          const av     = u.avatarUrl ? ` data-avatar="${escapeHtml(u.avatarUrl)}"` : '';
          const level  = Number.isFinite(+u.userLevel) ? ` data-user-level="${+u.userLevel}"` : '';
          const userTitle = u.userTitle ? ` data-user-title="${escapeHtml(u.userTitle)}"` : '';
          const pub    = u.userPublicProfile ? ` data-username="${escapeHtml(u.username)}" class="feed-user feed-user-pub"` : ` class="feed-user"`;
          return `<span class="feed-group-name"><span${pub}${av}${level}${userTitle}>${dn}</span>${badges}${comma}</span>`;
        });
      return parts.join(' ');
    }
    const dn     = escapeHtml(_hooks.displayFor?.(k) ?? k);
    const badges = (_hooks.adminBadge?.(k) ?? '') + (_hooks.authorBadge?.(k) ?? '') + (_hooks.contributorBadge?.(k) ?? '');
    const av     = firstEntry.avatarUrl ? ` data-avatar="${escapeHtml(firstEntry.avatarUrl)}"` : '';
    const level  = Number.isFinite(+firstEntry.userLevel) ? ` data-user-level="${+firstEntry.userLevel}"` : '';
    const userTitle = firstEntry.userTitle ? ` data-user-title="${escapeHtml(firstEntry.userTitle)}"` : '';
    const pub    = firstEntry.userPublicProfile ? ` data-username="${escapeHtml(k)}" class="feed-user feed-user-pub"` : ` class="feed-user"`;
    return `<span class="feed-group-name"><span${pub}${av}${level}${userTitle}>${dn}</span>${badges}</span>`;
  }

  let collapseId = 0;
  let dayIndex   = 0;

  const JOIN_COLLAPSE_THRESHOLD = 5;

  function renderDayItems(items) {
    const thisDayIndex = dayIndex++;
    // all_visited/all_discovered/first_win/first_loss/first_battle_death are
    // major one-time achievements - never sweep them into a same-user
    // "N actions today" collapse group no matter how many other actions
    // (runs started/completed, etc.) that user racked up that day.
    // visit_all_series/discover_all_series/visit_all_anthology/
    // discover_all_anthology are the group-wide equivalent (every book in
    // a whole series/anthology, not just one) - an even bigger milestone
    // than the single-book ones above, so they get the same protection.
    const skipTypes = new Set(['level_up', 'user_joined', 'book_rated', 'series_rated', 'book_created', 'series_created', 'all_visited', 'all_discovered', 'first_win', 'first_loss', 'first_battle_death', 'visit_all_series', 'discover_all_series', 'visit_all_anthology', 'discover_all_anthology']);
    const userCounts = new Map();
    for (const e of items) {
      if (skipTypes.has(e.type)) continue;
      const k = entryUserKey(e);
      userCounts.set(k, (userCounts.get(k) || 0) + 1);
    }

    const joinItems = items.filter(e => e.type === 'user_joined');
    const collapseJoins = joinItems.length >= JOIN_COLLAPSE_THRESHOLD;
    let joinGroupRendered = false;

    // A series/anthology created together with its member books in the
    // same import produces 1 container event (series_created, or
    // book_created with isContainer) plus N book_created children from the
    // same user this same day - fold those N lines into the container's
    // own entry via an inline expand toggle, rather than spamming the feed
    // with N+1 separate rows. Only collapses when a real batch exists (at
    // least one matching child); a container created on its own (no
    // members yet) renders exactly as before.
    const batchChildrenByContainer = new Map();
    const batchConsumedChildren = new Set();
    for (const e of items) {
      let children = null;
      // Excludes anything already claimed by an earlier container this
      // pass - a book could in principle match both a fresh series and a
      // fresh anthology (seriesId and parentBookId both set) in the same
      // batch; first container wins rather than rendering it twice.
      if (e.type === 'series_created') {
        children = items.filter(x => x.type === 'book_created' && !x.isContainer && !batchConsumedChildren.has(x) && x.username === e.username && x.seriesId === e.seriesId);
      } else if (e.type === 'book_created' && e.isContainer) {
        children = items.filter(x => x.type === 'book_created' && !x.isContainer && !batchConsumedChildren.has(x) && x.username === e.username && x.parentBookId === e.bookId);
      }
      if (children && children.length) {
        batchChildrenByContainer.set(e, children);
        children.forEach(c => batchConsumedChildren.add(c));
      }
    }

    // Books added to an already-existing series/anthology (no fresh
    // container event today, e.g. volume 5 dropped in a week after the
    // series itself was created) never match a container above and would
    // otherwise render as N separate same-day rows. Group same-user
    // same-series/anthology book_created siblings under the first one as
    // the same inline-toggle batch, using that first entry's own rendered
    // body (title + series tag) as the visible head instead of a
    // dedicated container event. Uses "+N more" wording rather than the
    // container batch's "N books" - here the head is itself one of the
    // books, not a separate container standing apart from an N-book
    // count, so the toggle should only cover the rest.
    const looseKeyOf = e => e.seriesId != null ? `s:${e.seriesId}` : (e.parentBookId != null ? `a:${e.parentBookId}` : null);
    const looseGroups = new Map();
    for (const e of items) {
      if (e.type !== 'book_created' || e.isContainer || batchConsumedChildren.has(e)) continue;
      const key = looseKeyOf(e);
      if (!key) continue;
      const gk = `${e.username}|${key}`;
      if (!looseGroups.has(gk)) looseGroups.set(gk, []);
      looseGroups.get(gk).push(e);
    }
    const looseBatchHeads = new Set();
    for (const group of looseGroups.values()) {
      if (group.length < 2) continue;
      const [head, ...rest] = group;
      batchChildrenByContainer.set(head, rest);
      rest.forEach(c => batchConsumedChildren.add(c));
      looseBatchHeads.add(head);
    }

    const rendered = new Set();
    let out = '';
    for (const e of items) {
      if (batchConsumedChildren.has(e)) continue;
      if (skipTypes.has(e.type) && e.type !== 'user_joined') {
        // Always its own standalone entry - never merged into a same-user
        // collapse group, even if that user has enough other actions today
        // to trigger one (grouping keys purely on username, so without this
        // explicit bypass a rating would get swept into an unrelated group
        // of e.g. run_completed entries, or silently dropped if that group
        // was already rendered).
        const { html: body, isParty, extraClass } = renderEntry(e);
        if (!body) continue;
        const children = batchChildrenByContainer.get(e);
        if (children) {
          const id = `feed-collapse-${collapseId++}`;
          const preview = children.slice(0, 2).map(_makeEntryHtml).join('');
          const rest    = children.slice(2).map(_makeEntryHtml).join('');
          out += `<div class="feed-entry${isParty ? ' feed-entry--party' : ''}${extraClass ? ' ' + extraClass : ''}">${body} `;
          out += `<button class="feed-group-toggle feed-group-toggle--inline" data-target="${id}" data-group-key="${escapeHtml(thisDayIndex + ':batch:' + (e.seriesId ?? e.bookId))}" aria-expanded="false">`;
          const countKey = looseBatchHeads.has(e) ? 'feed.more_books_in_batch' : 'feed.books_in_batch';
          out += `<span class="feed-group-chevron">▶</span><span class="feed-group-count">${t(countKey, { n: children.length })}</span>`;
          out += `</button></div>`;
          out += `<div class="feed-group-body" id="${id}" hidden>${preview}${rest}</div>`;
        } else {
          out += `<div class="feed-entry${isParty ? ' feed-entry--party' : ''}${extraClass ? ' ' + extraClass : ''}">${body}</div>`;
        }
        continue;
      }
      if (e.type === 'user_joined') {
        if (collapseJoins) {
          if (joinGroupRendered) continue;
          joinGroupRendered = true;
          const id = `feed-collapse-${collapseId++}`;
          const preview = joinItems.slice(0, 2).map(_makeEntryHtml).join('');
          const rest    = joinItems.slice(2).map(_makeEntryHtml).join('');
          out += `<div class="feed-user-group feed-user-group--joins">`;
          out += `<button class="feed-group-toggle" data-target="${id}" data-group-key="${escapeHtml(thisDayIndex + ':__joins')}" aria-expanded="false">`;
          out += `<span class="feed-group-chevron">▶</span><span class="feed-group-name">${t('feed.new_adventurers')}</span><span class="feed-group-count">${t('feed.joined_today', { n: joinItems.length })}</span>`;
          out += `</button>`;
          out += `<div class="feed-group-body" id="${id}" hidden>${preview}${rest}</div>`;
          out += `</div>`;
          continue;
        }
        const { html: body, isParty, extraClass } = renderEntry(e);
        if (body) out += `<div class="feed-entry${isParty ? ' feed-entry--party' : ''}${extraClass ? ' ' + extraClass : ''}">${body}</div>`;
        continue;
      }
      const k = entryUserKey(e);
      if (userCounts.get(k) >= COLLAPSE_THRESHOLD) {
        if (rendered.has(k)) continue;
        rendered.add(k);
        const userItems = items.filter(x => !skipTypes.has(x.type) && entryUserKey(x) === k);
        const id = `feed-collapse-${collapseId++}`;
        const preview = userItems.slice(0, 2).map(_makeEntryHtml).join('');
        const rest    = userItems.slice(2).map(_makeEntryHtml).join('');
        const isPartyGroup = !!(e.usernames && e.usernames.length > 1);
        const label = renderGroupLabel(e, k);
        const partyTag = isPartyGroup ? ' <span class="feed-party-badge">party</span>' : '';
        out += `<div class="feed-user-group${isPartyGroup ? ' feed-user-group--party' : ''}">`;
        out += `<button class="feed-group-toggle" data-target="${id}" data-group-key="${escapeHtml(thisDayIndex + ':' + k)}" aria-expanded="false">`;
        out += `<span class="feed-group-chevron">▶</span>${label}<span class="feed-group-count">${t('feed.actions_today', { n: userItems.length })}</span>${partyTag}`;
        out += `</button>`;
        out += `<div class="feed-group-body" id="${id}" hidden>${preview}${rest}</div>`;
        out += `</div>`;
        continue;
      }
      const { html: body, isParty, extraClass } = renderEntry(e);
      if (body) out += `<div class="feed-entry${isParty ? ' feed-entry--party' : ''}${extraClass ? ' ' + extraClass : ''}">${body}</div>`;
    }
    return out;
  }

  return renderDayItems;
}
