import shared from './battlesim1291.js';
export default Object.fromEntries(Object.entries(shared).map(([key,value])=>[key.replace(/^battlesim1291\./,'battlesim1294.'),value.replaceAll('Robinton','Vanye')]));
