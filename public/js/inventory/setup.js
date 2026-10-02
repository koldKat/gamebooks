// setup.js - Internal inventory module; use ../inventory.js externally.

import { inventoryRuntime } from './runtime.js';
import { _renderGrid } from './grid.js';

inventoryRuntime.renderGrid = _renderGrid;
