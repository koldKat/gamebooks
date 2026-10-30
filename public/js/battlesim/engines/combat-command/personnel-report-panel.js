// Render personnel survivors, completed rolls and battle history in the results column.
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderPersonnelReport(holder,state) {
  const fight=state.fight;
  const table=fight?'<table class="bsim-report-table"><thead><tr><th>Force</th><th>Manpower</th></tr></thead><tbody>'
    +[...fight.player,...fight.enemies].map(unit=>'<tr><td>'+escape(unit.name)
      +(unit.retired?' · '+escape(unit.retired):'')+'</td><td>'+unit.count+'</td></tr>').join('')+'</tbody></table>':'';
  holder.innerHTML='<h4 class="bsim-side-title">'+escape(fight?fight.status+' · Round '+fight.round:'Ready')+'</h4>'
    +(fight?.section?'<p>Book reference: '+escape(fight.section)+'</p>':'')
    +(fight?.restoredTemporaryLosses?'<p>Temporary Manpower losses restored after the bar fight.</p>':'')
    +'<div class="bsim-report">'+table+'</div><h4 class="bsim-side-title">Combat log</h4><div class="bsim-log">'
    +(fight?.history??[]).slice().reverse().filter(event=>event.attacks.length||event.checks.length).map(event=>
      '<div><strong>'+escape(event.round?'Round '+event.round:'Opening dice')+'</strong>'
      +event.attacks.map(a=>'<p>'+escape((a.side==='player'?'Your':'Enemy')+' '+(a.kind??'attack')
        +(a.chart?': AS '+a.strength+', Chart '+a.chart:'')+', roll '+a.total+': '+a.hits+' hits'
        +(a.bonusHits?' ('+a.bonusHits+' bonus)':'')+(a.ignoredHits?' · hit ignored':'')
        +(a.losses.length?' · '+a.losses.map(v=>v.count+' '+v.name).join(', '):''))+'</p>').join('')
      +event.checks.map(c=>'<p>'+escape(c.kind+': '+c.total+(c.passed===undefined?'':c.passed?' · passed':' · failed'))+'</p>').join('')+'</div>').join('')
    +'</div><h4 class="bsim-side-title">Battle history</h4>'
    +(state.history??[]).slice(-30).reverse().map(e=>'<p>'+escape(e.enemy+' · '+e.outcome)+'</p>').join('');
}
