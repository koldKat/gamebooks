// English controls for The Dread Vault of Tgozur.
import labels from './d20.js';
export default Object.fromEntries(Object.entries({...labels,
  title:'The Dread Vault of Tgozur: Combat',useBoon:'Use lion’s courage',
}).map(([key,value])=>['battlesim1620.'+key,value]));
