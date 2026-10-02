// markup.js - Internal play-screen module; use ../play.js externally.

import { state, viewingPt, viewingPtIndex, isTerminal, currentPlaythrough, currentSection } from '../core/state.js';
import { network, computeOutcomes } from '../graph.js';
import { t } from '../i18n.js';
import { escapeHtml } from '../core/util.js';
import { playContext } from './context.js';
import { renderPathTrail } from './trail.js';
import { maxUndos, maxFastTravels } from './limits.js';
import { navigate, wouldAutoNav } from './navigation.js';
import { CHOICES_PULSE_THRESHOLD } from './settings.js';

export function renderPanelMarkup(pt, sec) {

  let html = '';

  // ── Active run controls ──────────────────────────────────────
  if (!pt) {
    const viewHeader = viewingPt
      ? (playContext._owIsOpenWorld ? 'Path in this book' : t('runs.path', { n: state.playthroughs.indexOf(viewingPt) + 1 }))
      : null;
    renderPathTrail(viewingPt, viewHeader);
  } else {
    const isPlaceholder = pt.path.length === 0;
    const trailHeader = playContext._owIsOpenWorld ? 'Path in this book' : null;
    renderPathTrail(isPlaceholder ? null : pt, trailHeader);
    const undosLeft = maxUndos() - (pt.undosUsed || 0);
    const undoDisabled = (undosLeft <= 0 || pt.path.length <= 1) ? ' disabled' : '';
    let secDisplay;
    if (isPlaceholder) {
      if (playContext._owIsOpenWorld) {
        const loc = playContext._owGetRunLocation?.(state.activePtIndex);
        const where = loc?.bookName
          ? `in ${escapeHtml(loc.bookName)}${loc.section ? ` at ${loc.section}` : ''} ⇒`
          : 'another book ⇒';
        secDisplay = `<span class="section-cross-book">${where}</span>`;
      } else {
        secDisplay = '-';
      }
    } else {
      secDisplay = sec;
    }
    html += `<div class="section-row"><span class="section-label">${t('record.section')}</span><span class="section-display">${secDisplay}</span></div>` +
            `<div class="run-controls-group">` +
            `<div class="undo-ft-row">` +
            `<button id="undo-run-btn" class="undo-run-btn"${undoDisabled}>${t('runs.undo', { n: undosLeft })}</button>` +
            (!isPlaceholder
              ? `<button id="fasttravel-btn" class="fasttravel-btn" data-tooltip="${t('ft.tooltip')}"${(maxFastTravels() - (pt.fastTravelsUsed || 0)) <= 0 ? ' disabled' : ''}>${t('runs.fasttravel', { n: maxFastTravels() - (pt.fastTravelsUsed || 0) })}</button>`
              : '') +
            `</div>` +
            (!isPlaceholder
              ? `<div class="end-run-group"><div class="win-loss-row"><button id="win-run-btn" class="win-btn">★ Win</button><button id="loss-run-btn" class="loss-btn">✝ Loss</button></div><button id="battle-death-btn" class="battle-death-btn">${t('runs.battle_death')}</button></div>`
              : '') +
            `</div>`;
    const secData = state.graph[sec];
    if (!secData || secData.choices.length === 0) {
      const pulseClass = playContext._choicesRecordedCount < CHOICES_PULSE_THRESHOLD ? ' choices-input--pulse' : '';
      html +=
        `<div class="input-group">` +
          `<label>${t('record.choices.label')}</label>` +
          `<input type="text" id="choices-input" class="${pulseClass.trim()}" placeholder="${t('record.choices.placeholder')}" autocomplete="off">` +
          `<div class="record-btn-row">` +
            `<button id="record-btn" class="primary-btn">${t('record.btn')}</button>` +
          `</div>` +
        `</div>`;
    } else if (secData.choices.length === 1 && !isTerminal(secData.choices[0]) && !pt.path.includes(secData.choices[0]) && !(playContext._suppressAutoNavDepth > 0) && !(playContext._owIsOpenWorld && secData.portals?.length)) {
      const dest = secData.choices[0];
      const previous = playContext._pendingAutoNav;
      if (!previous || previous.state !== state || previous.pt !== pt || previous.sec !== sec || previous.dest !== dest || previous.network !== network) {
        const pending = { state, pt, sec, dest, network };
        playContext._pendingAutoNav = pending;
        setTimeout(() => {
          // A render/book/run change may have replaced this queued hop.
          if (playContext._pendingAutoNav !== pending) return;
          playContext._pendingAutoNav = null;
          if (state !== pending.state || currentPlaythrough() !== pt || currentSection() !== sec || network !== pending.network) return;
          if (!wouldAutoNav(sec, pt) || state.graph[sec].choices[0] !== dest) return;
          navigate(dest);
        }, 0);
      }
      const destLabel = dest === -1 ? t('record.death') : dest === 0 ? t('record.victory') : dest;
      html += `<div class="choices-label auto-nav">${t('record.auto', { dest: destLabel })}</div>`;
    } else {
      html += `<div class="choices-label">${t('record.where')}</div><div class="choice-buttons">`;
      const sortedChoices = [...secData.choices].sort((a, b) => {
        if (a >= 1 && b >= 1) return a - b;
        if (a >= 1) return -1;
        if (b >= 1) return 1;
        return a - b;
      });
      // Resolve outcomes once so choice pills match graph edges, including branching paths.
      const outcomes = computeOutcomes();
      const choiceOutcomeClass = c => {
        if (c === -1) return 'death-btn';
        if (c === 0) return 'win-btn';
        const outcome = outcomes[c] ?? null;
        return outcome === 'death' ? 'death-btn' : outcome === 'win' ? 'win-btn' : '';
      };
      html += sortedChoices.map(c => {
        const extra = choiceOutcomeClass(c);
        const lbl   = c === -1 ? t('runs.death') : c === 0 ? t('runs.victory') : c;
        return `<button class="choice-btn ${extra}" data-choice="${c}">${lbl}</button>`;
      }).join('');
      html += `</div>`;
    }
    if (playContext._owIsOpenWorld) {
      html += `<button id="add-portal-btn" class="add-portal-btn" data-tooltip="Add a cross-book portal from this section">⇒ Portal</button>`;
    }
    // ── Portal destinations on this section (open world) ─────────
    if (playContext._owIsOpenWorld && pt) {
      const portals = state.graph[sec]?.portals || [];
      if (portals.length > 0) {
        html += `<div class="portal-destinations">` +
          `<div class="portal-dest-label">${t('play.portal_destinations')}</div>`;
        portals.forEach((p, idx) => {
          const bk = playContext._owSeriesBooks.find(b => b.id === p.targetBookId);
          const bkName = bk ? bk.name : `Book #${p.targetBookId}`;
          const lbl = p.label || `⇒ ${bkName} ${p.targetSection}`;
          html += `<div class="portal-dest-item">` +
            `<button class="portal-travel-btn primary-btn" data-portal-idx="${idx}">⇒ ${lbl}</button>` +
            `<button class="portal-edit-btn" data-portal-idx="${idx}" data-tooltip="Edit portal">✎</button>` +
            `<button class="portal-del-btn" data-portal-idx="${idx}" data-tooltip="Remove portal">✕</button>` +
          `</div>`;
        });
        html += `</div>`;
      }
    }
  }

  // ── Runs list ────────────────────────────────────────────────
  html += `<div class="runs-section">`;
  const noActiveRun = state.activePtIndex === null || state.activePtIndex === undefined;
  html += `<div class="runs-header"><span>${t('runs.header')}</span>` +
          `<div class="runs-header-actions">` +
          `<button id="new-pt-btn" class="new-run-btn${noActiveRun ? ' pulse' : ''}">${t('runs.new')}</button>` +
          (playContext._owIsOpenWorld ? '' : `<button id="new-pt-alt-btn" class="new-run-alt-btn" data-tooltip="Start at a specific section">⚑</button>`) +
          `</div></div>`;

  if (state.playthroughs.length === 0) {
    html += `<div class="runs-empty">${t('runs.empty')}</div>`;
  } else {
    html += `<div class="runs-list">`;
    state.playthroughs.map((p, i) => i).reverse().forEach(i => {
      const p = state.playthroughs[i];
      const isActive   = i === state.activePtIndex;
      const isViewing  = viewingPtIndex >= 0 && i === viewingPtIndex;
      const isPortalPaused = p.completed && p.result === 'portal';
      const isDone     = p.completed && !isPortalPaused;
      // Hide Load only for a run actually active here; placeholders and portal-paused runs need it.
      const isActiveHere = playContext._owIsOpenWorld
        ? (isActive && p.path.length > 0 && !isPortalPaused)
        : isActive;
      const lastSec    = p.path[p.path.length - 1];
      let statusText, statusCls;
      if (isDone) {
        statusText = p.result === 'success' ? t('runs.victory') : p.result === 'battle' ? t('runs.battle') : t('runs.death');
        statusCls  = p.result === 'success' ? 'run-win' : p.result === 'battle' ? 'run-battle' : 'run-death';
      } else if (isPortalPaused) {
        // Portal-paused - run is now active in the target book (via portalTarget) or wherever the series cache says it is.
        const target = p.portalTarget?.bookId
          ? { bookName: (playContext._owSeriesBooks.find(b => b.id === p.portalTarget.bookId)?.name) || `Book #${p.portalTarget.bookId}`, section: p.portalTarget.section }
          : playContext._owGetRunLocation?.(i);
        const targetSec = target?.section ?? '?';
        const targetName = target?.bookName ? escapeHtml(target.bookName) : null;
        statusText = targetName ? `⇒ ${targetName} ${targetSec}` : (lastSec ? `⇒ ${lastSec}` : '⇒ Travelling');
        statusCls  = 'run-portal';
      } else if (!lastSec && playContext._owIsOpenWorld) {
        // Placeholder in open world - run is alive in another book
        const loc = playContext._owGetRunLocation?.(i);
        statusText = loc?.bookName
          ? `<span class="section-cross-book">in ${escapeHtml(loc.bookName)}${loc.section ? ` at ${loc.section}` : ''} ⇒</span>`
          : '<span class="section-cross-book">another book ⇒</span>';
        statusCls  = isActive ? 'run-active-label' : '';
      } else {
        statusText = lastSec ? t('runs.section', { n: lastSec }) : t('runs.section', { n: '-' });
        statusCls  = isActive ? 'run-active-label' : '';
      }
      const isPublic = isDone && (p.isPublic || false);
      html +=
        `<div class="run-item${isActive ? ' run-item-active' : ''}${isViewing ? ' run-item-viewing' : ''}">` +
          `<div class="run-info">` +
            `<span class="run-num">${t('runs.run', { n: i + 1 })}</span>` +
            `<span class="run-status ${statusCls}">${statusText}</span>` +
          `</div>` +
          `<div class="run-actions">` +
            (isDone
              ? `<button class="run-public-btn${isPublic ? ' is-public' : ''}" data-index="${i}">${t('play.public_run')}</button>`
              : '') +
            (!isActiveHere
              ? `<button class="run-load-btn${isViewing ? ' run-view-active' : ''}" data-index="${i}">${t('runs.load')}</button>`
              : '') +
            `<button class="run-del-btn" data-index="${i}" data-tooltip="${escapeHtml(t('runs.delete_run'))}">✕</button>` +
          `</div>` +
        `</div>`;
    });
    html += `</div>`;
  }
  html += `</div>`; // close .runs-section - pre-series runs below are its sibling, not its child

  // ── Pre-series runs (existed before book joined open world series) ───────────
  const preRuns = playContext._owIsOpenWorld ? (state.preSeriesRuns || []) : [];
  if (preRuns.length > 0) {
    html += `<div class="pre-series-runs-section${playContext._preSeriesCollapsed ? ' pre-series-collapsed' : ''}">`;
    html += `<div class="pre-series-runs-header">` +
      `<span>${t('play.before_joining_series')}</span>` +
      `<button class="pre-series-toggle-btn" aria-label="${t('play.toggle_pre_series')}">▾</button>` +
    `</div>`;
    html += `<div class="runs-list">`;
    // Display in reverse: most recent = Run -1 (last in array), oldest = Run -N (first)
    preRuns.map((p, i) => i).reverse().forEach(i => {
      const p    = preRuns[i];
      const negN = -(preRuns.length - i); // -1 for last, -N for first
      const isViewing = viewingPtIndex < 0 && state._viewingPreSeriesIdx === i;
      const isDone = p.completed && p.result !== 'portal';
      const lastSec = p.path[p.path.length - 1];
      let statusText, statusCls;
      if (isDone) {
        statusText = p.result === 'success' ? t('runs.victory') : p.result === 'battle' ? t('runs.battle') : t('runs.death');
        statusCls  = p.result === 'success' ? 'run-win' : p.result === 'battle' ? 'run-battle' : 'run-death';
      } else {
        statusText = lastSec ? t('runs.section', { n: lastSec }) : t('runs.section', { n: '-' });
        statusCls  = '';
      }
      html +=
        `<div class="run-item run-item-preseries${isViewing ? ' run-item-viewing' : ''}">` +
          `<div class="run-info">` +
            `<span class="run-num run-num-preseries">${t('runs.run', { n: negN })}</span>` +
            `<span class="run-status ${statusCls}">${statusText}</span>` +
          `</div>` +
          `<div class="run-actions">` +
            `<button class="run-load-btn run-load-preseries${isViewing ? ' run-view-active' : ''}" data-pre-index="${i}">${t('runs.load')}</button>` +
            `<button class="run-del-btn run-del-preseries" data-pre-index="${i}" data-tooltip="${escapeHtml(t('runs.delete_run'))}">✕</button>` +
          `</div>` +
        `</div>`;
    });
    html += `</div></div>`;
  }

  html += `</div>`;
  return html;
}
