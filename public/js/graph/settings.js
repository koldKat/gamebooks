import { graphRuntime } from './runtime.js';

// ── Open world flag (set by main.js when book is opened) ─────────────────────
export function setGraphCrossBookRoute(routeMap) {
  // routeMap is the Map from _computeCrossBookReachability; we only need the keys.
  graphRuntime._graphCrossBookRoute = (routeMap && routeMap.size) ? new Set(routeMap.keys()) : null;
}
export function setGraphOpenWorld(v, seriesBooks = []) {
  graphRuntime._graphIsOpenWorld = !!v;
  graphRuntime._graphSeriesBooks = seriesBooks || [];
  const portalLegendItem = document.querySelector('.legend-item-portal');
  if (portalLegendItem) portalLegendItem.style.display = graphRuntime._graphIsOpenWorld ? '' : 'none';
}


export function setLightweightRestabilize(on) { graphRuntime._lightweightRestabilize = on; }
