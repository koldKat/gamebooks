import { equipmentRuntime } from './runtime.js';
import { _renderGrid } from './grid.js';

// UI actions can request a grid refresh without a grid -> events -> UI cycle.
equipmentRuntime.renderGrid = _renderGrid;
