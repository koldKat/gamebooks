// Build compact Lost Jedi controls and readable combat reports with shared simulator styles.
export const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const weapons=['blaster','lightsabre','unarmed','rifle','redemptor','speeder'];
export const setupFields=['section','variant','range','initiative','woundedFett','blaster','lightsabre','technical','jediPoints','maxJediPoints','weapon','ready','ammo','oneFewerImperial','extraRebels','extraRebelSkill','participation','survivingGuards','survivingRebels'];

export function controls(id,tk,encounters) {
  const row=(key,control)=>`<label class="inv-edit-row"><span>${escape(tk(key))}</span>${control}</label>`;
  const select=(key,items)=>`<select class="inv-edit-input" id="${id}-${key}">${items.map(([value,label])=>`<option value="${escape(value)}">${escape(label)}</option>`).join('')}</select>`;
  const number=(key,min=0,max=99)=>`<input class="inv-edit-input" type="number" id="${id}-${key}" min="${min}" max="${max}" step="1" autocomplete="off">`;
  const button=key=>`<button class="inv-add-btn bsim-action-btn" type="button" id="${id}-${key}">${escape(tk(key))}</button>`;
  const check=key=>`<label class="bsim-checkbox"><input type="checkbox" id="${id}-${key}"> ${escape(tk(key))}</label>`;
  const choices=values=>values.map(key=>[key,tk(key)]);
  const availableWeapons=[...weapons,...new Set(encounters.flatMap(e=>[e.rules.forcedPlayerWeapon,e.rules.ewebAvailable?'eweb':null]).filter(w=>w&&!weapons.includes(w)))];
  return `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
    <div class="inv-modal-hdr"><span class="inv-modal-title" id="${id}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${id}-close" aria-label="${escape(tk('close'))}">&times;</button></div>
    <div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p>
    <div id="${id}-setup">${row('section',select('section',[['custom',tk('custom')],...encounters.filter(row=>!row.rules.modifierOnly && row.rules.reinforcements!==true).map(row=>[row.section,`${row.section}: ${row.name}`])]))}
    ${row('variant',select('variant',[]))}${['blaster','lightsabre','technical','jediPoints','maxJediPoints'].map(key=>row(key,number(key,0,key.includes('Points')?999:99))).join('')}
    ${row('weapon',select('weapon',choices(availableWeapons)))}${check('ready')}${row('ammo',number('ammo',0,6))}
    ${check('oneFewerImperial')}${check('extraRebels')}${row('extraRebelSkill',number('extraRebelSkill'))}
    ${row('participation',select('participation',[['observe',tk('observe')]]))}${row('survivingGuards',number('survivingGuards',0,6))}${row('survivingRebels',number('survivingRebels',0,3))}
    ${row('range',select('range',choices(['range','close'])))}${row('initiative',select('initiative',choices(['havet','enemy'])))}${check('woundedFett')}<div id="${id}-editor"></div></div>
    <p id="${id}-encounterNote"></p>${button('start')}<div id="${id}-turnControls">
    ${row('target',select('target',[]))}${row('die',number('die',1,6))}<p>${escape(tk('diceNote'))}</p>${button('advance')}
    <div id="${id}-pendingControls">${row('adjustment',number('adjustment',-999,999))}<p id="${id}-preview"></p>${button('confirm')}</div>
    <div id="${id}-playerActions">${button('draw')}${row('combatRange',select('combatRange',choices(['range','close'])))}${row('combatWeapon',select('combatWeapon',choices(availableWeapons)))}${check('combatReady')}${button('move')}${button('wait')}${button('escape')}${button('eweb')}${button('blockGunRack')}${button('retreat')}<div id="${id}-grabControls">${row('grabPoints',number('grabPoints',0,999))}${button('grabWeapon')}</div></div></div>
    <div id="${id}-joinControls">${row('joinSide',select('joinSide',[]))}${button('joinCombat')}</div>${button('continueCombat')}${button('cancel')}
    </div><div class="bsim-col bsim-col-right"><div class="bsim-status" role="status" aria-live="polite" id="${id}-status"></div><p id="${id}-totals"></p><p id="${id}-actor"></p><div class="bsim-report" id="${id}-opponents"></div><div class="bsim-log" id="${id}-log"></div><details><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${id}-history"></div></details></div></div></div>`;
}

export function eventText(event,fight,tk) {
  const name=id=>fight.actors.find(actor=>actor.id===id)?.name ?? id;
  if (event.kind==='strike') return tk('strikeLog',{actor:name(event.actor),target:name(event.target),die:event.die,
    adjustment:event.adjustment,total:event.total,threshold:event.threshold,result:tk(event.hit?'hit':'miss'),cost:event.cost});
  if (event.kind==='target') return tk('targetLog',{actor:name(event.actor),target:name(event.target),die:event.die,adjustment:event.adjustment,cost:event.cost});
  if (event.kind==='reinforcements') return tk('reinforcements');
  return tk('actionLog',{actor:name(event.actor),action:tk(event.kind)});
}
