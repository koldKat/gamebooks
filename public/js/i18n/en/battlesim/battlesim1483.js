// English terminology for optional Knightmare Life Force duels.
const labels={
  player:'You',player_life_force:'Your Life Force',life_force:'Life Force',custom_opponent:'Custom opponent',
  luck_charges:'Luck charges',luck_hint:'Enter any unused automatic successes from your ring or Fate water. Use them manually during the duel.',
  use_luck:'Use one automatic success',manual_die:'Die (blank: automatic)',automatic:'Roll automatically',next_round:'Next round',
  start:'Start duel',end:'End duel',end_confirm:'End this duel without recording a victory or defeat?',
  check_values:'Check the current Life Force grades, opponent name, luck charges and die.',
  ready:'Ready for a duel',combat_log:'Combat log',history:'Duel history',round:'Round {round}',die_value:'Die: {value}',
  wounded:'{name} loses one grade',luck_used:'Automatic success',charges_left:'Luck charges remaining: {count}',
  rules:'Roll a die each round: 1 or 2 wounds your opponent; 3 to 6 wounds you. Life Force falls from Green to Amber to Red, then death.'
};
export default {
  'battlesim1483.title':'Fortress of Assassins Battle Simulator',
  ...Object.fromEntries(Object.entries(labels).map(([key,value])=>['battlesim.knightmare.'+key,value])),
  ...Object.fromEntries(Object.entries({GREEN:'Green',AMBER:'Amber',RED:'Red',DEAD:'Dead'}).map(([key,value])=>['battlesim.knightmare.grade.'+key,value])),
  ...Object.fromEntries(Object.entries({fighting:'Duel in progress',win:'Victory',loss:'Defeat',cancelled:'Duel ended'}).map(([key,value])=>['battlesim.knightmare.status.'+key,value]))
};
