export { definition } from './books/1808/definition.js';
export { init, render, setVisible } from './books/1808/panel.js';

import { apiFetch } from './run-context.js';
import { loadRoster } from './books/1808/definition.js';

export const loadData = () => loadRoster(apiFetch);
