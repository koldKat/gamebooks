// Auto-dismissing mobile feedback; no desktop fly-to-badge animation.

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
