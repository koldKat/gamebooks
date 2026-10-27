import shared from './battlesim1291.js';
const labels=Object.fromEntries(Object.entries(shared).map(([key,value])=>[key.replace(/^battlesim1291\./,'battlesim1301.'),value.replaceAll('Robinton','Mirrim')]));
export default labels;
