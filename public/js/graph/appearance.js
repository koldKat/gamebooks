import { COLORS } from '../core/constants.js';
import { state, viewingPt, currentPlaythrough, isTerminal, parseSecId } from '../core/state.js';
import { t } from '../i18n.js';
import { graphRuntime } from './runtime.js';
import { _effectiveStartSec } from './helpers.js';

// ── Node appearance ─────────────────────────────────────────────────────────

function _darkenHex(hex) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `#${[r,g,b].map(c => Math.round(c*0.6).toString(16).padStart(2,'0')).join('')}`;
}

// Set both hover and highlight colors so vis-network cannot replace semantic fills with its defaults.
function _withHighlight(c) {
  const swatch = { background: c.background, border: c.border };
  return { ...c, highlight: swatch, hover: swatch };
}

export function nodeColor(secId) {
  const pt        = currentPlaythrough();
  const displayPt = pt || viewingPt;
  const path      = displayPt ? displayPt.path : [];
  const cur       = (pt && path.length) ? path[path.length - 1] : null;
  const finalNode = (displayPt && displayPt.completed && path.length)
    ? path[path.length - 1] : null;

  // These states are always shown as-is, no battle border override
  const startSec = _effectiveStartSec(displayPt);
  if (secId === startSec) return _withHighlight(COLORS.start);
  if (secId === cur) return _withHighlight(COLORS.current);
  if (secId === finalNode) {
    if (displayPt.result === 'success') return _withHighlight(COLORS.victory);
    if (displayPt.result === 'battle')  return _withHighlight(COLORS.battleDeath);
    return _withHighlight(COLORS.death);
  }

  // Determine base fill+border from normal rules
  let base;
  if (path.includes(secId)) {
    base = COLORS.visitedRun;
  } else if (!displayPt) {
    const ends          = state.playthroughs.filter(p =>
      p.completed && p.path.length && p.path[p.path.length - 1] === secId
    );
    const hasEndDeath   = ends.some(p => p.result === 'death');
    const hasEndBattle  = ends.some(p => p.result === 'battle');
    const hasEndVictory = ends.some(p => p.result === 'success');
    if ((hasEndDeath || hasEndBattle) && hasEndVictory) base = { background: '#b45309', border: '#f59e0b' };
    else if (hasEndDeath)   base = COLORS.death;
    else if (hasEndBattle)  base = COLORS.battleDeath;
    else if (hasEndVictory) base = COLORS.victory;
  }
  if (!base) {
    const choices    = (state.graph[secId]?.choices || []).map(parseSecId);
    const hasDeath   = choices.includes(-1);
    const hasVictory = choices.includes(0);
    if (hasDeath && hasVictory) base = COLORS.bothOutline;
    else if (hasDeath)          base = COLORS.deathOutline;
    else if (hasVictory)        base = COLORS.victoryOutline;
    // Portal-only nodes count as mapped even without choices.
    else if (state.graph[secId] && (!state.graph[secId].discovered || state.graph[secId].portals?.length > 0)) base = COLORS.mapped;
    else                                                            base = COLORS.discovered;
  }

  // Custom color overrides base fill (not special states - those returned early above)
  const customColor = state.graph[secId]?.color;
  if (customColor) base = { background: customColor, border: _darkenHex(customColor) };

  // Battle flag: keep fill from base rules, override only the border
  if (state.graph[secId]?.battle) {
    return _withHighlight({ background: base.background, border: COLORS.battleOutline.border });
  }

  return _withHighlight(base);
}

export function nodeLabel(secId) {
  const displayPt = currentPlaythrough() || viewingPt;
  const startSec  = _effectiveStartSec(displayPt);
  return secId === startSec ? `${secId}\nSTART` : String(secId);
}

export function nodeTitle(secId, portals) {
  const data = state.graph[secId];
  const lines = [];
  if (!data) {
    lines.push(t('node.unmapped', { n: secId }));
  } else {
    const choices  = data.choices.map(parseSecId);
    const real     = choices.filter(c => !isTerminal(c));
    const hasDeath = choices.includes(-1);
    const hasWin   = choices.includes(0);
    const parts    = [];
    if (real.length)  parts.push(t('node.goes_to', { list: real.join(', ') }));
    if (hasDeath)     parts.push(t('node.can_die'));
    if (hasWin)       parts.push(t('node.can_win'));
    lines.push(t('node.section', { n: secId, parts: parts.join(' | ') }));
    if (data.battle)              lines.push(`Battle: ${t('node.battle')}`);
    if (data.priority === 'high') lines.push(`▲ ${t('ctx.priority.high')}`);
    if (data.priority === 'low')  lines.push(`▼ ${t('ctx.priority.low')}`);
    if (data.note) { lines.push('Note:'); data.note.split('\n').forEach(part => lines.push(part)); }
  }
  if (portals && portals.length) {
    lines.push('Portal destinations:');
    portals.forEach(p => {
      const bookName = graphRuntime._graphSeriesBooks.find(b => b.id === p.targetBookId)?.name ?? `Book #${p.targetBookId}`;
      lines.push(p.label || `⇒ ${bookName} ${p.targetSection}`);
    });
  }
  const el = document.createElement('div');
  lines.forEach((line, i) => {
    if (i > 0) el.appendChild(document.createElement('br'));
    el.appendChild(document.createTextNode(line));
  });
  return el;
}
