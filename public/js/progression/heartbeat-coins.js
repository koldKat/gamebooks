import { BRONZE_COIN_SVG, SILVER_COIN_SVG } from '../ui-helpers/coin-icon.js';

export function updateHeartbeatCoinsDisplay(data) {
  for (const [name, icon] of [['bronze', BRONZE_COIN_SVG], ['silver', SILVER_COIN_SVG]]) {
    const el = document.getElementById(name + '-display');
    if (!el) continue;
    const value = data?.[name + 'Balance'];
    el.hidden = !Number.isSafeInteger(value) || value < 0;
    el.innerHTML = el.hidden ? '' : `${icon} ${value.toLocaleString()}`;
    el.setAttribute('aria-label', `${name} coins: ${el.hidden ? 0 : value}`);
  }
}
