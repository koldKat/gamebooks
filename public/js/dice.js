// dice.js - Dice roller widget: roll, display, and persist dice state per playthrough

import { state, viewingPt, currentPlaythrough, saveState } from './state.js?v=13';
import { _setPlayPanelCollapsed } from './prefs.js?v=135';
import { setAfterRenderFn } from './play.js?v=86';

const SUPPORTED_DICE = [4, 6, 8, 10, 12, 20, '%'];
const MIN_DICE = 1;
const MAX_DICE = 10;
const _PIPS = {
  1: [5],
  2: [3, 7],
  3: [3, 5, 7],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};
const _SHAPES = {
  4:  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8 54 50H10Z"/></svg>',
  8:  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 52 22 32 58 12 22Z"/></svg>',
  10: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 50 18 44 52 20 52 14 18Z"/></svg>',
  12: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 7 49 14 57 32 49 50 32 57 15 50 7 32 15 14Z"/></svg>',
  20: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 55 22 46 54 18 54 9 22Z"/></svg>',
  100:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 52 16 58 32 52 48 32 58 12 48 6 32 12 16Z"/></svg>',
  '%': '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 52 16 58 32 52 48 32 58 12 48 6 32 12 16Z"/></svg>',
};

function _normalizeDie(die) {
  if (die === '%') return '%';
  const n = Number(die);
  return SUPPORTED_DICE.includes(n) ? n : 6;
}

function _legacyDiceState(ds) {
  if (!ds) return { count: 2, die: 6, lastResult: null, previousResult: null };
  if ('die' in ds || 'lastResult' in ds || 'previousResult' in ds) {
    return {
      count: Number.isInteger(ds.count) ? ds.count : 2,
      die: _normalizeDie(ds.die),
      lastResult: ds.lastResult ?? null,
      previousResult: ds.previousResult ?? null,
    };
  }
  const rolls = Array.isArray(ds.lastRoll) ? ds.lastRoll.filter(Number.isFinite) : null;
  const count = Number.isInteger(ds.count) ? ds.count : (rolls?.length || 2);
  if (!rolls?.length) return { count, die: 6, lastResult: null, previousResult: null };
  return {
    count,
    die: 6,
    lastResult: {
      kind: 'standard',
      count,
      die: 6,
      rolls,
      total: rolls.reduce((a, b) => a + b, 0),
    },
    previousResult: null,
  };
}

function _rollSelectedDice(count, die) {
  if (die === '%') {
    const rolls = Array.from({ length: count }, () => {
      const tens = Math.floor(Math.random() * 10);
      const ones = Math.floor(Math.random() * 10);
      const total = tens === 0 && ones === 0 ? 100 : tens * 10 + ones;
      return { tens, ones, total };
    });
    return {
      kind: 'percentile',
      count,
      die: '%',
      rolls,
      total: rolls.reduce((sum, roll) => sum + roll.total, 0),
    };
  }
  const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * die) + 1);
  return {
    kind: 'standard',
    count,
    die,
    rolls,
    total: rolls.reduce((sum, value) => sum + value, 0),
  };
}

function _formatDiceResultInline(result) {
  if (!result) return '';
  if (Array.isArray(result.terms)) {
    const parts = [];
    let isFirst = true;
    for (const term of result.terms) {
      const sign = term.sign < 0 ? (isFirst ? '-' : ' - ') : (isFirst ? '' : ' + ');
      if (term.kind === 'mod') {
        parts.push(`${sign}${term.value}`);
      } else if (Array.isArray(term.rolls)) {
        parts.push(`${sign}${term.rolls.map(String).join(' + ')}`);
      }
      isFirst = false;
    }
    return `${parts.join('')} = ${result.total}`.trim();
  }
  if (result.kind === 'percentile') {
    return `${result.rolls.map(roll => roll.total).join(' + ')} = ${result.total}`;
  }
  return `${result.rolls.map(String).join(' + ')} = ${result.total}`;
}

// #play-bottom-stack (party/guide/notebook buttons + XP summary) centers itself
// between this and #play-btn-row on the other side, rather than the plain
// viewport midpoint, so it doesn't get covered when either side grows wide
// enough on a narrower screen. Tracked the same way charsheet.js already
// tracks --play-btn-row-h for #stats-hud.
function _trackDiceRollerWidth() {
  const wrap = document.getElementById('dice-roller-wrap');
  if (!wrap) return;
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--dice-roller-w', `${wrap.offsetWidth}px`);
  }).observe(wrap);
}

export function initDice() {
  _trackDiceRollerWidth();
  const roller     = document.getElementById('dice-roller');
  const header     = document.getElementById('dice-roller-header');
  const decBtn     = document.getElementById('dice-dec-btn');
  const incBtn     = document.getElementById('dice-inc-btn');
  const countInput = document.getElementById('dice-count-input');
  const shortcutBtns = [...document.querySelectorAll('.dice-shortcut-btn')];
  const throwBtn   = document.getElementById('dice-throw-btn');
  const resultEl   = document.getElementById('dice-result');
  const prevRowEl  = document.getElementById('dice-prev-row');
  const prevTextEl = document.getElementById('dice-prev-text');

  if (localStorage.getItem('diceRollerCollapsed') === '1') {
    roller.classList.add('dice-collapsed');
  }

  header.addEventListener('click', () => {
    _setPlayPanelCollapsed('diceRollerCollapsed', !roller.classList.contains('dice-collapsed'));
  });

  function getRunPt() { return viewingPt || currentPlaythrough(); }

  // Read-only means visible-but-disabled, not hidden: viewing a completed/other
  // run (currentPlaythrough() null while a pt still exists via viewingPt) should
  // not let dice rolls silently overwrite that historical run's saved diceState.
  function isDiceReadOnly() { return !!getRunPt() && !currentPlaythrough(); }

  function _applyDiceReadOnly() {
    const ro = isDiceReadOnly();
    throwBtn.disabled = ro;
    decBtn.disabled   = ro;
    incBtn.disabled   = ro;
    countInput.disabled = ro;
    shortcutBtns.forEach(btn => { btn.disabled = ro; });
  }

  function getDiceCount() {
    const v = parseInt(countInput.value, 10);
    return isNaN(v) ? 2 : Math.max(MIN_DICE, Math.min(MAX_DICE, v));
  }

  function _setShortcutActive(die) {
    const normalized = String(die);
    shortcutBtns.forEach(btn => {
      btn.classList.toggle('active', normalized === btn.dataset.die);
    });
  }

  function _appendOp(text) {
    const op = document.createElement('span');
    op.className = 'dice-op';
    op.textContent = text;
    resultEl.appendChild(op);
  }

  function _appendMod(value) {
    const mod = document.createElement('span');
    mod.className = 'dice-mod';
    mod.textContent = String(value);
    resultEl.appendChild(mod);
  }

  function _appendDie(die, value, animate) {
    const d = document.createElement('span');
    const isD6 = die === 6;
    const isCritLow = die === 20 && value === 1;
    const isCritHigh = die === 20 && value === 20;
    const isMax = die !== 20 && die !== '%' && value === die;
    d.className = 'die-face' + (animate ? '' : ' no-anim') + (isD6 ? '' : ' die-face--numeric');
    d.dataset.val = value;
    d.dataset.sides = die;
    if (isCritLow) d.dataset.tone = 'low';
    if (isCritHigh) d.dataset.tone = 'high';
    if (isMax) d.dataset.tone = 'max';

    if (isD6) {
      const pips = _PIPS[value] || [];
      for (let i = 1; i <= 9; i++) {
        const pip = document.createElement('span');
        pip.className = 'die-pip' + (pips.includes(i) ? ' on' : '');
        d.appendChild(pip);
      }
    } else {
      const shape = document.createElement('span');
      shape.className = 'die-shape';
      shape.innerHTML = _SHAPES[die] || '';
      d.appendChild(shape);

      const type = document.createElement('span');
      type.className = 'die-type';
      type.textContent = die === '%' ? 'd%' : `d${die}`;
      d.appendChild(type);

      const val = document.createElement('span');
      val.className = 'die-value';
      val.textContent = value;
      d.appendChild(val);
    }

    resultEl.appendChild(d);
  }

  function _appendPercentileDie(roll, animate) {
    const d = document.createElement('span');
    d.className = 'die-face die-face--numeric die-face--percentile' + (animate ? '' : ' no-anim');
    d.dataset.sides = '%';
    d.dataset.tone = roll.total === 100 ? 'high' : (roll.total === 1 ? 'low' : '');

    const shape = document.createElement('span');
    shape.className = 'die-shape';
    shape.innerHTML = _SHAPES['%'] || '';
    d.appendChild(shape);

    const type = document.createElement('span');
    type.className = 'die-type';
    type.textContent = 'd%';
    d.appendChild(type);

    const val = document.createElement('span');
    val.className = 'die-value';
    val.textContent = String(roll.total).padStart(2, '0');
    d.appendChild(val);

    const pair = document.createElement('span');
    pair.className = 'die-percent-pair';
    pair.textContent = `${roll.tens}0·${roll.ones}`;
    d.appendChild(pair);

    resultEl.appendChild(d);
  }

  function _appendPreviewDie(die) {
    const d = document.createElement('span');
    const isD6 = die === 6;
    d.className = 'die-face die-face--preview' + (isD6 ? '' : ' die-face--numeric');
    d.dataset.sides = die;

    if (isD6) {
      const centerIdx = 5;
      for (let i = 1; i <= 9; i++) {
        const pip = document.createElement('span');
        pip.className = 'die-pip' + (i === centerIdx ? ' on die-pip--preview' : '');
        d.appendChild(pip);
      }
    } else {
      const shape = document.createElement('span');
      shape.className = 'die-shape';
      shape.innerHTML = _SHAPES[die] || '';
      d.appendChild(shape);

      const type = document.createElement('span');
      type.className = 'die-type';
      type.textContent = die === '%' ? 'd%' : `d${die}`;
      d.appendChild(type);

      const val = document.createElement('span');
      val.className = 'die-value die-value--preview';
      val.textContent = '•';
      d.appendChild(val);
    }

    resultEl.appendChild(d);
  }

  function _paintPreview(count, die) {
    resultEl.innerHTML = '';
    for (let i = 0; i < count; i++) _appendPreviewDie(die);
  }

  function _paintResult(result, animate) {
    resultEl.innerHTML = '';
    if (!result) return;
    if (Array.isArray(result.terms)) {
      let isFirst = true;
      for (const term of result.terms) {
        if (!isFirst) _appendOp(term.sign < 0 ? '−' : '+');
        else if (term.sign < 0) _appendOp('−');

        if (term.kind === 'mod') {
          _appendMod(term.value);
        } else if (Array.isArray(term.rolls)) {
          if (term.sides === 100) {
            term.rolls.forEach(value => _appendDie(100, value, animate));
          } else {
            term.rolls.forEach(value => _appendDie(term.sides, value, animate));
          }
        }
        isFirst = false;
      }

      const showTotal =
        result.terms.length > 1 ||
        result.terms.some(term => term.kind === 'dice' && term.rolls?.length > 1);
      if (showTotal) {
        const sep = document.createElement('span');
        sep.className = 'dice-sum-sep';
        sep.textContent = '=';
        resultEl.appendChild(sep);
        const s = document.createElement('span');
        s.className = 'dice-sum';
        s.textContent = result.total;
        resultEl.appendChild(s);
      }
      return;
    }
    if (result.kind === 'percentile') {
      result.rolls.forEach(roll => _appendPercentileDie(roll, animate));
    } else {
      result.rolls.forEach(value => _appendDie(result.die, value, animate));
    }

    const showTotal = result.count > 1;
    if (showTotal) {
      const sep = document.createElement('span');
      sep.className = 'dice-sum-sep';
      sep.textContent = '=';
      resultEl.appendChild(sep);
      const s = document.createElement('span');
      s.className = 'dice-sum';
      s.textContent = result.total;
      resultEl.appendChild(s);
    }
  }

  function _paintPreviousResult(result) {
    if (!prevRowEl || !prevTextEl) return;
    if (!result) {
      prevTextEl.textContent = '-';
      prevRowEl.style.display = 'flex';
      return;
    }
    prevTextEl.textContent = _formatDiceResultInline(result);
    prevRowEl.style.display = 'flex';
  }

  function getSelectedDie() {
    return _normalizeDie(shortcutBtns.find(btn => btn.classList.contains('active'))?.dataset.die);
  }

  function saveDiceState(count, die, lastResult, previousResult = null) {
    const pt = getRunPt();
    if (!pt) return;
    const normCount = Math.max(MIN_DICE, Math.min(MAX_DICE, count));
    const normDie   = _normalizeDie(die);
    pt.diceState = {
      count: normCount,
      die: normDie,
      lastResult: lastResult ?? null,
      previousResult: previousResult ?? null,
    };
    // Remember the chosen dice setup at the book level so new runs start with it
    state.dicePrefs = { count: normCount, die: normDie };
    saveState();
  }

  // Called by render() after every state change - restores dice UI for current run
  setAfterRenderFn(() => {
    const pt = getRunPt();
    const ds = _legacyDiceState(pt?.diceState);
    countInput.value = Math.max(MIN_DICE, Math.min(MAX_DICE, ds.count || 2));
    _setShortcutActive(ds.die);
    if (ds.lastResult) _paintResult(ds.lastResult, false);
    else _paintPreview(ds.count || 2, ds.die);
    _paintPreviousResult(ds.previousResult);
    _applyDiceReadOnly();
  });

  shortcutBtns.forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    if (isDiceReadOnly()) return;
    const die = _normalizeDie(btn.dataset.die);
    _setShortcutActive(die);
    const ds = _legacyDiceState(getRunPt()?.diceState);
    const lastResult = ds.lastResult ?? null;
    if (!lastResult) _paintPreview(getDiceCount(), die);
    saveDiceState(getDiceCount(), die, lastResult, ds.previousResult ?? null);
  }));

  decBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (isDiceReadOnly()) return;
    const n = Math.max(MIN_DICE, getDiceCount() - 1);
    countInput.value = n;
    const ds = _legacyDiceState(getRunPt()?.diceState);
    const lastResult = ds.lastResult ?? null;
    if (!lastResult) _paintPreview(n, getSelectedDie());
    saveDiceState(n, getSelectedDie(), lastResult, ds.previousResult ?? null);
  });
  incBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (isDiceReadOnly()) return;
    const n = Math.min(MAX_DICE, getDiceCount() + 1);
    countInput.value = n;
    const ds = _legacyDiceState(getRunPt()?.diceState);
    const lastResult = ds.lastResult ?? null;
    if (!lastResult) _paintPreview(n, getSelectedDie());
    saveDiceState(n, getSelectedDie(), lastResult, ds.previousResult ?? null);
  });
  countInput.addEventListener('change', () => {
    if (isDiceReadOnly()) return;
    const n = getDiceCount();
    countInput.value = n;
    const ds = _legacyDiceState(getRunPt()?.diceState);
    const lastResult = ds.lastResult ?? null;
    if (!lastResult) _paintPreview(n, getSelectedDie());
    saveDiceState(n, getSelectedDie(), lastResult, ds.previousResult ?? null);
  });
  countInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') throwBtn.click();
  });

  throwBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (isDiceReadOnly()) return;
    const count = getDiceCount();
    const die = getSelectedDie();
    countInput.value = count;
    const ds = _legacyDiceState(getRunPt()?.diceState);
    const result = _rollSelectedDice(count, die);
    _paintResult(result, true);
    _paintPreviousResult(ds.lastResult ?? null);
    saveDiceState(count, die, result, ds.lastResult ?? null);
  });
}
