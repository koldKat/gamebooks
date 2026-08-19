// toast.js - Minimal auto-dismissing toast, mobile's only reward feedback
// mechanism right now. Desktop's equivalent for this same event (notebook
// XP) is even quieter - notes.js just refreshes the header's XP/coin
// counter (setOnXpAwarded -> refreshCoinsDisplay) - but mobile has no
// persistent XP/level display anywhere to refresh, so a toast is the
// closest equivalent, not an attempt at porting rewards.js's full
// fly-to-badge floater animation.

let _el = null;
let _hideTimer = null;

function _ensureDom() {
  if (_el) return _el;
  _el = document.createElement('div');
  _el.id = 'm-toast';
  document.body.appendChild(_el);
  return _el;
}

export function showToast(message) {
  const el = _ensureDom();
  el.textContent = message;
  el.classList.add('active');
  clearTimeout(_hideTimer);
  _hideTimer = setTimeout(() => el.classList.remove('active'), 2200);
}
