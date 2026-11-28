import { apiFetch } from '../core/state.js';
import { loadRoster } from './books/1526/definition.js';

export { definition } from './books/1526/definition.js';
export * from './books/1526/panel.js';
export const loadData = () => loadRoster(apiFetch);
