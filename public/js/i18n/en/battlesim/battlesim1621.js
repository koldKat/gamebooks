// English controls for Labyrinth of Lies.
import labels from './d20.js';
export default Object.fromEntries(Object.entries({...labels,
  title:'Labyrinth of Lies: Combat',
}).map(([key,value])=>['battlesim1621.'+key,value]));
