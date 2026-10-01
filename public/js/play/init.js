import { setPanelRenderer } from './render.js';
import { renderPlaythroughPanel } from './panel.js';

// Keep render -> panel -> actions -> render from becoming an import cycle.
setPanelRenderer(renderPlaythroughPanel);
