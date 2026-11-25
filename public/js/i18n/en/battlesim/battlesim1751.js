import labels from './d20.js';

export default Object.fromEntries(Object.entries({
  ...labels,
  title:'Archmage’s Gate I: Saross',
  rules:'Choose a printed encounter or enter your own opponents. Use the combat notes for tactical choices and resolve each turn with your current character and equipment.',
  initiative:'Show turn order',
}).map(([key,value]) => ['battlesim1751.'+key,value]));
