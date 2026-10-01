import { network } from './runtime.js';

// ── Connector style ──────────────────────────────────────────────────────────

const CONNECTOR_STYLES = {
  curvedCW:   { enabled: true, type: 'curvedCW',    roundness: 0.2 },
  curvedCCW:  { enabled: true, type: 'curvedCCW',   roundness: 0.2 },
  cubic:      { enabled: true, type: 'cubicBezier', roundness: 0.4, forceDirection: 'none' },
  horizontal: { enabled: true, type: 'cubicBezier', roundness: 0.4, forceDirection: 'horizontal' },
  straight:   { enabled: false },
};

export function _smoothOption(style) {
  return CONNECTOR_STYLES[style] ?? CONNECTOR_STYLES.curvedCW;
}

export function applyConnectorStyle(style) {
  if (!network) return;
  network.setOptions({ edges: { smooth: _smoothOption(style) } });
}
