// tips.js - Books-screen tip bar: fetches, shuffles, and cycles tips

import { fetchPublic } from './core/util.js';

export function initTips() {
  const el  = document.getElementById('books-tip-text');
  const bar = document.getElementById('tip-progress-bar');
  if (!el) return;
  let realDeck = [], sillyDeck = [], realPool = [], sillyPool = [];
  let useReal = Math.random() < 0.5;

  function nextTip(_triedOtherSide = false) {
    const pool = useReal ? realPool  : sillyPool;
    let   deck = useReal ? realDeck  : sillyDeck;
    if (!pool.length) {
      // Stop when both tip pools are empty to avoid infinite recursion.
      if (_triedOtherSide) return '';
      useReal = !useReal;
      return nextTip(true);
    }
    if (!deck.length) {
      deck = pool.map((_, i) => i);
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      if (useReal) realDeck = deck; else sillyDeck = deck;
    }
    const tip = pool[deck.pop()];
    if (useReal) realDeck = deck; else sillyDeck = deck;
    useReal = !useReal;
    return tip;
  }

  function restartBar() {
    if (!bar) return;
    bar.style.animation = 'none';
    bar.offsetWidth;
    bar.style.animation = 'tip-progress 15s linear forwards';
  }

  function cycle() {
    restartBar();
    setTimeout(() => {
      el.classList.add('fading');
      setTimeout(() => {
        el.textContent = nextTip();
        el.classList.remove('fading');
        cycle();
      }, 500);
    }, 15000);
  }

  fetchPublic('/api/tips').then(r => r.ok ? r.json() : Promise.reject(new Error('tips fetch failed'))).then(data => {
    realPool  = data.real  || [];
    sillyPool = data.silly || [];
    el.textContent = nextTip();
    cycle();
  }).catch(() => {
    el.textContent = '';
  });
}
