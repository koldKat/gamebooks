// Display first-hit outcomes, printed encounter notes and bounded combat history.
import {decorateOutcome} from '../../outcome.js';
export function renderFirstHitReport(parent,ui,state){
  parent.replaceChildren();const fight=state.fight;
  const status=ui.text(parent,ui.tr(fight?'status.'+fight.status:'ready'),'h4');
  status.className='bsim-side-title';decorateOutcome(status,fight?.status);
  if(fight){
    ui.text(parent,fight.opponent.name+' · '+ui.tr('skill')+' '+fight.opponent.skill);
    ui.text(parent,ui.tr('playerSkill')+' '+fight.player.skill);
    ui.text(parent,ui.tr('round')+' '+fight.round);
    if(fight.status==='fighting')ui.text(parent,ui.tr('turn.'+fight.phase));
    for(const note of fight.opponent.sourceNotes??[])ui.text(parent,note);
    ui.text(parent,ui.tr('manualStory'));
    ui.text(parent,ui.tr('log'),'h4').className='bsim-side-title';
    const log=ui.document.createElement('div');log.className='bsim-log';parent.append(log);
    for(const event of fight.events.slice().reverse()){
      const text=event.kind==='cancel'?ui.tr('status.cancelled'):ui.tr('turn.'+event.actor)+' · ['+event.dice.join(', ')+'] = '+event.total
        +' · '+ui.tr('threshold')+' '+event.threshold+' · '+ui.tr(event.hit?'hit':'miss');
      ui.text(log,text).className='bsim-log-'+(!event.hit?'muted':event.actor==='player'?'success':'danger');
    }
  }
  if(state.history.length){
    ui.text(parent,ui.tr('history'),'h4').className='bsim-side-title';
    for(const row of state.history.slice(-30).reverse())decorateOutcome(ui.text(parent,row.enemy+' · '+ui.tr('status.'+row.outcome)),row.outcome);
  }
}
