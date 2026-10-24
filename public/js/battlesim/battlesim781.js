// Compatibility entry point; implementation follows the shared simulator structure.
export * from './books/781/panel.js';
export { definition } from './books/781/definition.js';
export async function loadData() {
  const [{ apiFetch }, { loadRoster }] = await Promise.all([import('../core/state.js'), import('./books/781/definition.js')]);
  await loadRoster(apiFetch);
}
