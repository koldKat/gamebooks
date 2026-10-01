// Network bindings stay live for existing importers; internal mutable caches are shared.
export let network = null;
export let visNodes = null;
export let visEdges = null;
export function setNetwork(value) { network = value; }
export function setVisNodes(value) { visNodes = value; }
export function setVisEdges(value) { visEdges = value; }

export const graphRuntime = {
  _stabilizeHandler: null,
  _restabilizeTimer: null,
  _dragSaveTimer: null,
  _viewportSaveTimer: null,
  _stabilizing: false,
  _pendingSync: false,
  _lightweightRestabilize: false,
  _lastAboveFloorViewPos: null,
  _overlayNodeIds: [],
  _overlayNodes: [],
  _noteLabelCache: new Map(),
  _overlayPositions: {},
  _overlayPosDirty: true,
  _overlayDraggingActive: false,
  _fogPositions: {},
  _fogPosDirty: true,
  _fogDraggingActive: false,
  _graphIsOpenWorld: false,
  _graphSeriesBooks: [],
  _graphCrossBookRoute: null,
};
