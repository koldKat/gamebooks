import { state, saveState } from '../core/state.js';
import { network, visNodes, visEdges, setNetwork, setVisNodes, setVisEdges, graphRuntime } from './runtime.js';
import { clampViewportScale, enforceSnapZoomFloor, minSnapScale, GRID_SIZE } from './viewport.js';
import { drawGrid, drawOverlays } from './overlays.js';
import { _smoothOption } from './connectors.js';

export function destroyNetwork() {
  if (network) { network.stopSimulation(); network.destroy(); setNetwork(null); }
  setVisNodes(null);
  setVisEdges(null);
  graphRuntime._stabilizeHandler = null;
  graphRuntime._stabilizing      = false;
  graphRuntime._pendingSync      = false;
  clearTimeout(graphRuntime._restabilizeTimer);
  graphRuntime._restabilizeTimer = null;
  clearTimeout(graphRuntime._dragSaveTimer);
  clearTimeout(graphRuntime._viewportSaveTimer);
  graphRuntime._dragSaveTimer = null;
  graphRuntime._viewportSaveTimer = null;
  graphRuntime._graphIsOpenWorld = false;
  graphRuntime._graphSeriesBooks = [];
  graphRuntime._graphCrossBookRoute = null;
  graphRuntime._overlayPositions      = {};
  graphRuntime._overlayPosDirty       = true;
  graphRuntime._overlayDraggingActive = false;
  graphRuntime._fogPositions      = {};
  graphRuntime._fogPosDirty       = true;
  graphRuntime._fogDraggingActive = false;
}

// ── Graph lifecycle ─────────────────────────────────────────────────────────

export function initGraph() {
  if (!window.vis?.DataSet || !window.vis?.Network) {
    const container = document.getElementById('graph-container');
    if (container) {
      container.innerHTML = '<div class="graph-load-error">Graph library failed to load. Refresh the page or check the local vis-network asset.</div>';
    }
    throw new Error('vis-network failed to load');
  }

  setVisNodes(new vis.DataSet());
  setVisEdges(new vis.DataSet());

  const hasSavedLayout = Object.keys(state.positions).length > 0;

  const options = {
    nodes: {
      shape: 'dot',
      size: 14,
      font: { size: 11, color: '#ffffff', face: 'Segoe UI, system-ui, sans-serif' },
      borderWidth: 2,
    },
    edges: {
      arrows: { to: { enabled: true, scaleFactor: 0.5 } },
      color: { color: '#4b5563', opacity: 0.7, highlight: '#9ca3af' },
      smooth: _smoothOption(state.connectorStyle),
      width: 1.2,
    },
    physics: hasSavedLayout ? { enabled: false } : {
      enabled: true,
      solver: 'forceAtlas2Based',
      forceAtlas2Based: {
        gravitationalConstant: -120,
        springLength: 160,
        springConstant: 0.05,
        damping: 0.5,
        avoidOverlap: 1,
      },
      stabilization: { iterations: 300, updateInterval: 50 },
    },
    interaction: {
      hover: true,
      zoomView: true,
      dragView: true,
      tooltipDelay: 150,
    },
    layout: { improvedLayout: !hasSavedLayout },
  };

  setNetwork(new vis.Network(
    document.getElementById('graph-container'),
    { nodes: visNodes, edges: visEdges },
    options
  ));
  // The floor-revert anchor is canvas coords for THIS graph only - a stale
  // position from a previous book would teleport the view.
  graphRuntime._lastAboveFloorViewPos = null;

  if (!hasSavedLayout) {
    graphRuntime._stabilizeHandler = () => {
      network.setOptions({ physics: { enabled: false } });
      state.positions = network.getPositions();
      saveState();
      network.off('stabilizationIterationsDone', graphRuntime._stabilizeHandler);
      graphRuntime._stabilizeHandler = null;
    };
    network.on('stabilizationIterationsDone', graphRuntime._stabilizeHandler);
  }

  network.on('beforeDrawing', ctx => drawGrid(ctx));
  network.on('afterDrawing', ctx => drawOverlays(ctx));

  const freezeCurrentLayout = () => {
    network.setOptions({ physics: { enabled: false } });
    network.stopSimulation();
    Object.assign(state.positions, network.getPositions());
    saveState();
  };

  const saveViewport = () => {
    clearTimeout(graphRuntime._viewportSaveTimer);
    graphRuntime._viewportSaveTimer = setTimeout(() => {
      graphRuntime._viewportSaveTimer = null;
      state.viewport = { scale: clampViewportScale(network.getScale()) };
      saveState();
    }, 500);
  };

  network.on('zoom', () => {
    enforceSnapZoomFloor();
    saveViewport();
  });

  // Pure background pans change the view center without firing any 'zoom'
  // event, which would leave the snap floor's revert anchor pointing at the
  // pre-pan center - the first sub-floor wheel tick after a pan would then
  // jump the view backwards. Refresh the anchor on drag end instead.
  network.on('dragEnd', () => {
    if (state.snapToGrid && network.getScale() >= minSnapScale()) {
      graphRuntime._lastAboveFloorViewPos = network.getViewPosition();
    }
  });

  network.on('dragStart', params => {
    if (!params.nodes.length) return;
    clearTimeout(graphRuntime._restabilizeTimer);
    graphRuntime._restabilizeTimer = null;
    graphRuntime._stabilizing = false;
    graphRuntime._pendingSync = false;
    // Manual node dragging should take over immediately instead of fighting
    // the initial physics solver, which feels "bouncy" on freshly created maps.
    if (graphRuntime._stabilizeHandler) {
      network.off('stabilizationIterationsDone', graphRuntime._stabilizeHandler);
      graphRuntime._stabilizeHandler = null;
    }
    freezeCurrentLayout();
    // If any dragged node has an overlay, fetch positions every frame during drag.
    if (params.nodes.some(id => graphRuntime._overlayNodeIds.includes(id))) {
      graphRuntime._overlayDraggingActive = true;
    }
    // Fog-of-grid halos can follow any node, not just overlay ones.
    if (state.fogOfGrid) graphRuntime._fogDraggingActive = true;
  });

  network.on('dragEnd', params => {
    if (params.nodes.length) {
      const positions = network.getPositions(params.nodes);
      // Snap only ever applies to this drag's end position - never touches
      // any node that wasn't just moved, so turning the toggle on can't
      // retroactively reshape an already-placed graph.
      if (state.snapToGrid) {
        for (const id of params.nodes) {
          positions[id].x = Math.round(positions[id].x / GRID_SIZE) * GRID_SIZE;
          positions[id].y = Math.round(positions[id].y / GRID_SIZE) * GRID_SIZE;
        }
        visNodes.update(params.nodes.map(id => ({ id, x: positions[id].x, y: positions[id].y, physics: false })));
      } else {
        visNodes.update(params.nodes.map(id => ({ id, physics: false })));
      }
      Object.assign(state.positions, positions);
      clearTimeout(graphRuntime._dragSaveTimer);
      graphRuntime._dragSaveTimer = setTimeout(() => {
        graphRuntime._dragSaveTimer = null;
        saveState();
      }, 1000);
      graphRuntime._overlayDraggingActive = false;
      graphRuntime._overlayPosDirty = true;
      graphRuntime._fogDraggingActive = false;
      graphRuntime._fogPosDirty = true;
    }
  });
}
