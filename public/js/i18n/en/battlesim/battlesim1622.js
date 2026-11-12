// English controls for Darkmoon's Curse first-hit encounters.
const labels={
  title:"Darkmoon's Curse: Combat",player:'You',playerSkill:'Your current Skill',skill:'Skill',
  rules:'Enter your current Skill and choose or enter one opponent. You attack first. Roll two dice: a total equal to or higher than the target’s Skill hits. The first hit ends the encounter.',
  manualStory:'Apply the printed outcome in the reader. Wounds, rescues, items and story choices remain manual.',
  ready:'Ready',start:'Start encounter',attack:'Roll attack',cancel:'Cancel encounter',
  cancelConfirm:'Cancel this encounter?',invalid:'Enter a name, valid Skill and either both dice or neither die.',
  manualDice:'Optional dice',die1:'First die',die2:'Second die',round:'Round',threshold:'Target Skill',
  hit:'Hit',miss:'Miss',log:'Combat log',history:'History',
  'turn.player':'Your attack','turn.enemy':'Opponent’s attack',
  'status.fighting':'Fighting','status.win':'Victory','status.loss':'Opponent landed the first hit',
  'status.cancelled':'Canceled',
};
export default Object.fromEntries(Object.entries(labels).map(([key,value])=>['battlesim1622.'+key,value]));
