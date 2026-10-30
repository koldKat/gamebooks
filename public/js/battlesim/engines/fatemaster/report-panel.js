// Show Fatemaster current pools, completed combat events and saved encounter history.
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderFatemasterReport(holder,state,t) {
  const tr=(key,params)=>t('battlesim.fatemaster.'+key,params),fight=state.fight;
  const units=fight?[fight.player,...fight.opponents]:[];
  const table='<table class="bsim-report-table"><thead><tr>'+['combatant','strength','agility','power'].map(k=>'<th>'+escape(tr(k))+'</th>').join('')+'</tr></thead><tbody>'
    +units.map(e=>'<tr><td>'+escape(e.name)+(e.condition&&e.condition!=='active'?' · '+escape(tr('condition.'+e.condition)):'')+'</td><td>'+e.strength+'</td><td>'+e.agility+'</td><td>'+e.power+'</td></tr>').join('')+'</tbody></table>';
  const log=(fight?.events??[]).slice(-100).reverse().map(e=>{
    const name=fight.opponents.find(enemy=>enemy.id===e.enemyId)?.name??'';
    const details=[];
    if(e.total!==undefined)details.push(tr('roll_value',{value:e.total}));
    if(e.score!==undefined)details.push(tr('score_value',{value:e.score}));
    if(e.amount!==undefined||e.damage!==undefined)details.push(tr('damage_value',{value:e.amount??e.damage}));
    if(e.pool)details.push(tr(e.pool));
    if(e.spell)details.push(tr('spell.'+e.spell));
    if(e.hit!==undefined)details.push(tr(e.hit?'hit':'miss'));
    if(e.resisted!==undefined)details.push(tr(e.resisted?'resisted':'not_resisted'));
    if(e.success!==undefined)details.push(tr(e.success?'passed':'failed'));
    if(e.broken!==undefined)details.push(tr(e.broken?'broken':'intact'));
    return '<p>'+escape(tr('round',{round:e.round})+' · '+tr('event.'+e.type)+(name?' · '+name:'')+(details.length?' · '+details.join(' · '):''))+'</p>';
  }).join('');
  holder.innerHTML='<h4 class="bsim-side-title">'+escape(tr(fight?'status.'+fight.status:'ready'))+'</h4>'
    +(fight?'<p>'+escape(tr('round',{round:fight.round}))+'</p>'+table:'')
    +'<h4 class="bsim-side-title">'+escape(tr('combat_log'))+'</h4><div class="bsim-log">'+log+'</div>'
    +'<h4 class="bsim-side-title">'+escape(tr('history'))+'</h4>'
    +(state.history??[]).slice(-30).reverse().map(e=>'<p>'+escape(e.enemy+' · '+tr('status.'+e.outcome))+'</p>').join('');
}
