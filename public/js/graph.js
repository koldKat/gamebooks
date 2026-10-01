// Compatibility facade; implementations live in graph/.
export { network, visNodes, visEdges } from './graph/runtime.js';
export { MIN_VIEWPORT_SCALE, MAX_VIEWPORT_SCALE, RESTORE_MIN_VIEWPORT_SCALE, clampViewportScale, GRID_SIZE, minSnapScale, enforceSnapZoomFloor } from './graph/viewport.js';
export { setLightweightRestabilize, setGraphCrossBookRoute, setGraphOpenWorld } from './graph/settings.js';
export { computeOutcomes, inevitableOutcome } from './graph/outcomes.js';
export { applyConnectorStyle } from './graph/connectors.js';
export { initGraph, destroyNetwork } from './graph/lifecycle.js';
export { syncGraph } from './graph/sync.js';
export { subtreeToDelete, deleteNodes } from './graph/deletion.js';
export { canReachInGraph, allReachableInGraph, canReach, findPathTo } from './graph/pathfinding.js';
