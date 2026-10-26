import shared from './battlesim1291.js';
const labels=Object.fromEntries(Object.entries(shared).map(([key,value])=>[key.replace(/^battlesim1291\./,'battlesim1300.'),value.replaceAll('Robinton','Geordie')]));
export default labels;
