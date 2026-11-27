import labels from './d20.js';

export default Object.fromEntries(Object.entries({
  ...labels,
  title:'The Saviour of Sharn',
  rules:'Choose a printed encounter or enter your own opponents. Use the combat sheet to adjudicate movement, positioning, flanking, and any checks called for by the encounter.',
  starterCompanions:'Joins this encounter',
  'event.reinforcement':'Reinforcement arrived',
  'event.vitalityDrain':'Maximum HP drained',
  'event.martialFury':'Whirlwind Attack',
  'event.martialFuryRoll':'Whirlwind recharge roll',
}).map(([key,value]) => ['battlesim1982.'+key,value]));
