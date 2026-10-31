// Render formation survivors, current morale and completed combat rolls in the results column.
const escape = value => String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function renderFormationReport(holder,state) {
  const fight=state.fight;
  const rows=fight?[...fight.player.map(unit=>({...unit,side:'You'})),...fight.enemies.map(unit=>({...unit,side:'Enemy'}))]:[];
  const table=rows.length?'<table class="bsim-report-table"><thead><tr><th>Force</th><th>Manpower</th><th>Morale</th></tr></thead><tbody>'
    +rows.map(unit=>'<tr><td>'+escape(unit.side+' · '+unit.name)+(unit.retired?' · '+escape(unit.retired):'')
      +'</td><td>'+unit.count+'</td><td>'+escape(unit.morale??'-')+'</td></tr>').join('')+'</tbody></table>':'';
  const eventHtml=event=>'<div><strong>'+escape(event.round?'Round '+event.round:'Opening fire')+'</strong>'
    +event.attacks.map(attack=>'<p>'+escape((attack.side==='player'?'Your':'Enemy')+' attack: AS '+attack.strength
      +', Chart '+attack.chart+', roll '+attack.total+': '+attack.hits+' hits'
      +(attack.applied===undefined?' · allocation pending':'')
      +(attack.losses.length?' · '+attack.losses.map(loss=>loss.count+' '+loss.name).join(', '):'')
      +(attack.moralePenalty?' · additional Morale loss '+attack.moralePenalty.amount:''))+'</p>').join('')
    +event.checks.map(check=>'<p>'+escape((check.side==='player'?'Your':'Enemy')+' morale check: '
      +check.total+' against '+check.morale+' · '+(check.passed?'held':'routed'))+'</p>').join('')+'</div>';
  holder.innerHTML='<h4 class="bsim-side-title">'+escape(fight?fight.status+' · Round '+fight.round:'Ready')+'</h4>'
    +(fight?.section?'<p>Book reference: '+escape(fight.section)+'</p>':'')
    +'<div class="bsim-report">'+table+'</div><h4 class="bsim-side-title">Combat log</h4><div class="bsim-log">'
    +(fight?.history??[]).slice().reverse().filter(event=>event.attacks.length||event.checks.length).map(eventHtml).join('')
    +'</div><h4 class="bsim-side-title">Battle history</h4>'
    +(state.history??[]).slice(-30).reverse().map(event=>'<p>'+escape(event.enemy+' · '+event.outcome)+'</p>').join('');
}
