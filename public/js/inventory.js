// Stable inventory API; implementations live in inventory/.
import './inventory/setup.js';

export { getInventorySlots, refreshInventoryUI, addItemToInventory, removeAllFromInventoryAt } from './inventory/transfers.js';
export { preloadItems } from './inventory/cache.js';
export { renderInventoryDisplay, setExtraDisplayItemsProvider } from './inventory/display.js';
export { initInventory } from './inventory/init.js';
export { setInventoryVisible } from './inventory/panel.js';
