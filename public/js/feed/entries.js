import { feedHooks as _hooks } from './state.js';
import { escapeHtml } from '../core/util.js';
import { t } from '../i18n.js';
import { _runTooltip, _runN, _firstResultRunLabel, _seriesTag, formatAnnBody } from './formatting.js';

export function _makeEntryHtml(x) {
  const { html: b, isParty, extraClass } = renderEntry(x);
  return b ? `<div class="feed-entry${isParty ? ' feed-entry--party' : ''}${extraClass ? ' ' + extraClass : ''}">${b}</div>` : '';
}

export function renderEntry(e) {
  const isParty = !!(e.usernames && e.usernames.length > 1);
  let extraClass = '';
  let userEl;
  if (isParty) {
    userEl = [...e.usernames].sort((a, b) => a.username.localeCompare(b.username)).map(u => {
      const dn = escapeHtml(_hooks.displayFor?.(u.username) ?? u.username);
      const av = u.avatarUrl ? ` data-avatar="${escapeHtml(u.avatarUrl)}"` : '';
      const level = Number.isFinite(+u.userLevel) ? ` data-user-level="${+u.userLevel}"` : '';
      const userTitle = u.userTitle ? ` data-user-title="${escapeHtml(u.userTitle)}"` : '';
      return u.userPublicProfile
        ? `<button class="feed-user feed-user-pub" data-username="${escapeHtml(u.username)}"${av}${level}${userTitle}>${dn}</button>${_hooks.adminBadge?.(u.username) ?? ''}${_hooks.authorBadge?.(u.username) ?? ''}${_hooks.contributorBadge?.(u.username) ?? ''}`
        : `<span class="feed-user"${av}${level}${userTitle}>${dn}</span>${_hooks.adminBadge?.(u.username) ?? ''}${_hooks.authorBadge?.(u.username) ?? ''}${_hooks.contributorBadge?.(u.username) ?? ''}`;
    }).join('<span class="feed-party-sep">, </span>');
  } else {
    const dn     = escapeHtml(_hooks.displayFor?.(e.username) ?? e.username);
    const user   = escapeHtml(e.username);
    const avatar = e.avatarUrl ? ` data-avatar="${escapeHtml(e.avatarUrl)}"` : '';
    const level  = Number.isFinite(+e.userLevel) ? ` data-user-level="${+e.userLevel}"` : '';
    const userTitle = e.userTitle ? ` data-user-title="${escapeHtml(e.userTitle)}"` : '';
    const badge  = (_hooks.adminBadge?.(e.username) ?? '') + (_hooks.authorBadge?.(e.username) ?? '') + (_hooks.contributorBadge?.(e.username) ?? '');
    userEl = e.userPublicProfile
      ? `<button class="feed-user feed-user-pub" data-username="${user}"${avatar}${level}${userTitle}>${dn}</button>${badge}`
      : `<span class="feed-user"${avatar}${level}${userTitle}>${dn}</span>${badge}`;
  }
  const bookBtn = (id, name) => {
    const collectionTag = e.parentBookName
      ? (e.parentBookIsPublic
          ? ` <a href="/anthology/${e.parentBookId}" class="feed-anthology-tag" data-anthology-id="${e.parentBookId}" data-anthology-name="${escapeHtml(e.parentBookName)}">${escapeHtml(e.parentBookName)}</a>`
          : ` <span class="feed-anthology-tag">${escapeHtml(e.parentBookName)}</span>`)
      : '';
    const seriesTag = e.seriesName && e.seriesId
      ? (e.seriesIsPublic
          ? ` <a href="/series/${e.seriesId}" class="feed-series-tag" data-series-id="${e.seriesId}" data-series-name="${escapeHtml(e.seriesName)}">${escapeHtml(e.seriesName)}${e.seriesNumber ? ' #' + escapeHtml(e.seriesNumber) : ''}</a>`
          : ` <span class="feed-series-tag" style="cursor:default">${escapeHtml(e.seriesName)}${e.seriesNumber ? ' #' + escapeHtml(e.seriesNumber) : ''}</span>`)
      : '';
    const tags = collectionTag + seriesTag;
    // An anthology's own name renders as a purple pill (#a78bfa, matching
    // the covers wall's .cover-anthology-badge), the same way a series's
    // own name pills up amber in the "created series" template - not a
    // separate badge next to plain title text, the title *is* the pill.
    const pillClass = e.isContainer ? ' feed-anthology-pill' : '';
    if (!e.bookIsPublic) return `<span class="feed-book${pillClass}">${escapeHtml(name)}</span>${tags}`;
    const effectiveCover = e.coverUrl || e.parentCoverUrl || null;
    const cover = effectiveCover ? ` data-cover="${escapeHtml(effectiveCover)}"` : '';
    const parentAttrs = e.parentBookId
      ? ` data-parent-id="${e.parentBookId}" data-parent-name="${escapeHtml(e.parentBookName)}"`
      : '';
    return `<button class="feed-book feed-book-btn${pillClass}" data-book-id="${id}" data-book-name="${escapeHtml(name)}"${cover}${parentAttrs}>${escapeHtml(name)}</button>${tags}`;
  };
  const verbLabel = cls => cls === 'won' ? t('feed.verb.won') : cls === 'died' ? t('feed.verb.died') : t('feed.verb.lost');
  const nounLabel = isContainer => isContainer ? t('feed.noun.anthology') : t('feed.noun.book');

  let html = '';
  if (e.type === 'run_completed') {
    const isWin  = e.result === 'success';
    const isBattle = e.result === 'battle';
    const verbCls = isWin ? 'won' : isBattle ? 'died' : 'lost';
    const verb = verbLabel(verbCls);
    const verbEl = e.runIsPublic
      ? `<button class="feed-verb ${verbCls} feed-verb-pub" data-book-id="${e.bookId}" data-user-id="${e.userId}" data-run-index="${e.runIndex}" data-tooltip="${escapeHtml(_runTooltip(e))}">${verb}</button>`
      : `<span class="feed-verb ${verbCls}">${verb}</span>`;
    html = t('feed.tmpl.run_completed', { user: userEl, verb: verbEl, book: bookBtn(e.bookId, e.bookName), n: _runN(e.runIndex) });
  } else if (e.type === 'book_created') {
    html = t('feed.tmpl.created', { user: userEl, noun: nounLabel(e.isContainer), book: bookBtn(e.bookId, e.bookName) });
    extraClass = 'feed-entry--created';
  } else if (e.type === 'book_added') {
    html = t('feed.tmpl.added', { user: userEl, noun: nounLabel(e.isContainer), book: bookBtn(e.bookId, e.bookName) });
  } else if (e.type === 'series_created') {
    html = t('feed.tmpl.created_series', { user: userEl, series: _seriesTag(e) });
    extraClass = 'feed-entry--created';
  } else if (e.type === 'series_added') {
    html = t('feed.tmpl.added_series', { user: userEl, series: _seriesTag(e) });
  } else if (e.type === 'series_run_started') {
    // Book first, series shown as its usual attached tag (bookBtn already
    // does this for every other entry type) - never "series" mentioned
    // ahead of the book, which would break the pattern used everywhere
    // else in the feed.
    html = e.bookName
      ? t('feed.tmpl.series_run_started_in', { user: userEl, n: e.runIndex + 1, book: bookBtn(e.bookId, e.bookName) })
      : t('feed.tmpl.series_run_started', { user: userEl, n: e.runIndex + 1, series: _seriesTag(e) });
  } else if (e.type === 'series_run_completed') {
    const isWin    = e.result === 'success';
    const isBattle = e.result === 'battle';
    const verbCls  = isWin ? 'won' : isBattle ? 'died' : 'lost';
    const verb = verbLabel(verbCls);
    const verbEl   = e.runIsPublic
      ? `<button class="feed-verb ${verbCls} feed-verb-pub" data-book-id="${e.seriesId}" data-user-id="${e.userId}" data-run-index="${e.runIndex}" data-series-run="1" data-tooltip="${escapeHtml(_runTooltip(e))}">${verb}</button>`
      : `<span class="feed-verb ${verbCls}">${verb}</span>`;
    html = e.bookName
      ? t('feed.tmpl.series_run_completed_in', { user: userEl, verb: verbEl, n: e.runIndex + 1, book: bookBtn(e.bookId, e.bookName) })
      : t('feed.tmpl.series_run_completed', { user: userEl, verb: verbEl, n: e.runIndex + 1, series: _seriesTag(e) });
  } else if (e.type === 'run_started') {
    html = t('feed.tmpl.run_started', { user: userEl, n: _runN(e.runIndex), book: bookBtn(e.bookId, e.bookName) });
  } else if (e.type === 'user_joined') {
    const tmpl = e.joinTemplate || t('feed.join_default');
    html = tmpl.replace('{name}', userEl);
    extraClass = 'feed-entry--join';
  } else if (e.type === 'level_up') {
    extraClass = 'feed-entry--levelup';
    const abilitySuffix = e.gainedAbility
      ? t('feed.ability_unlocked', { n: e.newAbilityCount })
      : '';
    const lvTmpl = e.levelUpTemplate || t('feed.levelup_default');
    html = lvTmpl
      .replace('{name}',  userEl)
      .replace('{title}', `<span class="feed-title">${escapeHtml(e.levelTitle)}</span>`)
      .replace('{level}', `<span class="feed-level">${e.level}</span>`) + abilitySuffix;
  } else if (e.type === 'all_visited') {
    html = t('feed.tmpl.all_visited', { user: userEl, book: bookBtn(e.bookId, e.bookName) });
  } else if (e.type === 'all_discovered') {
    html = t('feed.tmpl.all_discovered', { user: userEl, book: bookBtn(e.bookId, e.bookName) });
  } else if (e.type === 'first_win') {
    const wonEl = (e.runIsPublic && e.runIndex != null)
      ? `<button class="feed-verb won feed-verb-pub" data-book-id="${e.bookId}" data-user-id="${e.userId}" data-run-index="${e.runIndex}" data-tooltip="${escapeHtml(_runTooltip(e))}">${t('feed.verb.won')}</button>`
      : `<span class="feed-verb won">${t('feed.verb.won')}</span>`;
    const runLabel = _firstResultRunLabel(e);
    html = t('feed.tmpl.first_result', { user: userEl, verb: wonEl, book: bookBtn(e.bookId, e.bookName), run: runLabel, first_time: t('feed.first_time') });
  } else if (e.type === 'first_loss') {
    const verbEl   = (e.runIsPublic && e.runIndex != null)
      ? `<button class="feed-verb lost feed-verb-pub" data-book-id="${e.bookId}" data-user-id="${e.userId}" data-run-index="${e.runIndex}" data-tooltip="${escapeHtml(_runTooltip(e))}">${t('feed.verb.lost')}</button>`
      : `<span class="feed-verb lost">${t('feed.verb.lost')}</span>`;
    const runLabel = _firstResultRunLabel(e);
    html = t('feed.tmpl.first_result', { user: userEl, verb: verbEl, book: bookBtn(e.bookId, e.bookName), run: runLabel, first_time: t('feed.first_time') });
  } else if (e.type === 'first_battle_death') {
    const verbEl   = (e.runIsPublic && e.runIndex != null)
      ? `<button class="feed-verb lost feed-verb-pub" data-book-id="${e.bookId}" data-user-id="${e.userId}" data-run-index="${e.runIndex}" data-tooltip="${escapeHtml(_runTooltip(e))}">${t('feed.verb.fell_in_battle')}</button>`
      : `<span class="feed-verb lost">${t('feed.verb.fell_in_battle')}</span>`;
    const runLabel = _firstResultRunLabel(e);
    html = t('feed.tmpl.first_result', { user: userEl, verb: verbEl, book: bookBtn(e.bookId, e.bookName), run: runLabel, first_time: t('feed.first_time') });
  } else if (e.type === 'won_all_series') {
    html = t('feed.tmpl.won_all', { user: userEl, target: _seriesTag(e) });
  } else if (e.type === 'won_all_anthology') {
    html = t('feed.tmpl.won_all', { user: userEl, target: bookBtn(e.bookId, e.bookName) });
  } else if (e.type === 'visit_all_series') {
    html = t('feed.tmpl.visit_all', { user: userEl, target: _seriesTag(e) });
  } else if (e.type === 'discover_all_series') {
    html = t('feed.tmpl.discover_all', { user: userEl, target: _seriesTag(e) });
  } else if (e.type === 'visit_all_anthology') {
    html = t('feed.tmpl.visit_all', { user: userEl, target: bookBtn(e.bookId, e.bookName) });
  } else if (e.type === 'discover_all_anthology') {
    html = t('feed.tmpl.discover_all', { user: userEl, target: bookBtn(e.bookId, e.bookName) });
  } else if (e.type === 'party_formed') {
    html = t('feed.tmpl.party_formed', { user: userEl, book: bookBtn(e.bookId, e.bookName), together: t('feed.together'), party: t('feed.party_badge') });
  } else if (e.type === 'book_rated') {
    html = t('feed.tmpl.rated', { user: userEl, noun: nounLabel(e.isContainer), book: bookBtn(e.bookId, e.bookName), stars: _hooks.starsHtml?.(e.rating) ?? '' });
    extraClass = 'feed-entry--rated';
  } else if (e.type === 'series_rated') {
    html = t('feed.tmpl.rated_series', { user: userEl, series: _seriesTag(e), stars: _hooks.starsHtml?.(e.rating) ?? '' });
    extraClass = 'feed-entry--rated';
  } else if (e.type === 'announcement') {
    html = `<div class="feed-announcement"><span class="feed-ann-title">${escapeHtml(e.title)}</span><div class="feed-ann-body">${formatAnnBody(e.body)}</div></div>`;
  }
  if (isParty && html && e.type !== 'party_formed') html += ` <span class="feed-party-badge">${t('feed.party_badge')}</span>`;
  return { html, isParty, extraClass };
}
