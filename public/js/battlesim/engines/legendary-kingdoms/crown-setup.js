import { legendaryDie, legendaryInteger } from './character.js';
import { CROWN_FIGHTS } from './crown.js';

const conditions = [
  ['ogreVisits','number',[738]],['vesselType','vessel',[1193]],
  ['trappedHero','hero',[1146]],['entryDamageHero','hero',[256]],
  ['rooftopAssassin','hero',[240]],['controlledMember','hero',[399]],
  ['pitVictim','hero',[762]],['freeHero','hero',[621]],['frozenHero','hero',[1175]],
  ['abbessSlain','check',[469]],['goddessCaress','check',[399]],['titanEyesHit','check',[318]],
  ['wizardWounded','check',[543]],['skipFirstEnemyTurn','check',[932]],['spareBryce','check',[954]],
  ['entryDamageAlreadyApplied','check',[256,931,1072,762]],['boyFreed','outcome',[1185]],
  ['guardApproach','approach',[94]],['assassinationSuccesses','number',[94]],
  ['defeatedEnemies','opponents',[136,911]],
];
const armourSections = [82,370,1175,1191];
const troopTypes = ['infantry','cavalry','missile','longbow'];
const garrisons = ['beverstone','fosterly','brightsands','highpoint'];

export function mountCrownSetup(api) {
  const {document,ID,el,tk,button,check,field,select,options,render,data} = api;
  const host = document.createElement('div');host.id = ID+'-crownSetup';
  host.innerHTML = conditions.map(([key,type]) => {
    if (type === 'check') return check(key);
    if (type === 'number') return field(key);
    const rows = type === 'vessel' ? [['cog',tk('cog')],['carrack',tk('carrack')]] :
      type === 'outcome' ? [['',tk('chooseOutcome')],['true',tk('success')],['false',tk('failure')]] :
      type === 'approach' ? ['ordinary','walls','basement','assassination'].map(value => [value,tk('approach.'+value)]) : [];
    return select(key,rows);
  }).join('')+
    `<div id="${ID}-arrivalOrder">`+
    Array.from({length:4},(_,index) => select('heroArrival-'+index)).join('')+
    Array.from({length:6},(_,index) => select('guardArrival-'+index)).join('')+'</div>'+
    `<div id="${ID}-heroConditions">`+Array.from({length:4},(_,index) =>
      `<fieldset id="${ID}-heroConditions-${index}"><legend id="${ID}-conditionName-${index}"></legend>`+
      field('grappleRoll-'+index,1,1,6)+
      select('heroZone-'+index,[['walkway',tk('walkway')],['pool',tk('pool')]])+
      ['body','shield','magic'].map(part => field('armour-'+index+'-'+part)).join('')+'</fieldset>').join('')+'</div>'+button('rollGrapple');
  el('personalSetup').append(host);
  for (const key of ['cursedMember','stealthHero','stealthOutcome','slaveDamage','hygliph','enlightened','shipInMordain','rage','knockout','undercover',
    'opening','precombat']) el(key).closest('label').hidden = true;
  el('defeatedEnemies').multiple = true;
  el('defeatedEnemies').size = 4;
  for (const key of ['guardApproach','members','frozenHero']) el(key).addEventListener('change',render);
  el('rollGrapple').addEventListener('click',() => {
    if (data()?.fight?.status === 'active') return;
    data()?.party.forEach((_,index) => {el('grappleRoll-'+index).value = legendaryDie();});
  });
  for (const [prefix,before] of [['unit',el('addUnit')],['editUnit',el('updateUnit')]]) {
    before.insertAdjacentHTML('beforebegin',select(prefix+'Type',troopTypes.map(type => [type,tk('troop.'+type)]))+
      select(prefix+'Garrison',garrisons.map(place => [place,tk('garrison.'+place)]))+field(prefix+'ChargeBonus',0,0,100));
  }
  el('applyShip').insertAdjacentHTML('beforebegin',field('shipCargo',0));
  const fillUnit = unit => {
    if (!unit) return;
    el('editUnitType').value = unit.type ?? 'infantry';el('editUnitGarrison').value = unit.garrison ?? 'beverstone';
    el('editUnitChargeBonus').value = unit.firstRoundBonus ?? 0;
  };
  el('editUnit').addEventListener('change',() => fillUnit(data()?.units.find(unit => unit.uid === el('editUnit').value)));
  const show = (key,visible) => {el(key).closest('label').hidden = !visible;};
  let lastParty;
  let lastGuardSection;
  return {
    render(game) {
      const section = Number(el('context').value),active = game.fight?.status === 'active';
      const heroes = game.party.flatMap((hero,index) => hero.health > 0 ? [[index,hero.name]] : []);
      for (const [key,type,sections] of conditions) {
        show(key,sections.includes(section));
        if (type === 'hero') options(key,[['',tk('none')],...heroes]);
      }
      const encounter = CROWN_FIGHTS.find(fight => fight.section === section);
      options('defeatedEnemies',(encounter?.enemies ?? []).filter(enemy => section !== 136 ||
        ['Sir Walter','Sar Lidia'].includes(enemy.name)).map(enemy => [enemy.name,enemy.name]));
      const walls = section === 94 && el('guardApproach').value === 'walls';
      el('arrivalOrder').hidden = !walls;
      for (let index=0;index<4;index++) {
        options('heroArrival-'+index,[['',tk('none')],...heroes]);
        el('heroArrival-'+index).closest('label').hidden = index >= heroes.length;
      }
      for (let index=0;index<6;index++) options('guardArrival-'+index,
        section === 94 ? encounter.enemies.map(enemy => [enemy.name,enemy.name]) : []);
      if (section === 94 && lastGuardSection !== 94)
        encounter.enemies.forEach((enemy,index) => {el('guardArrival-'+index).value = enemy.name;});
      lastGuardSection = section;
      const heroConditions = section === 621 || section === 695 || armourSections.includes(section);
      el('heroConditions').hidden = !heroConditions;
      el('rollGrapple').hidden = section !== 621;
      for (let index=0;index<4;index++) {
        const hero = game.party[index];
        el('heroConditions-'+index).hidden = !hero;
        el('conditionName-'+index).textContent = hero?.name ?? '';
        show('grappleRoll-'+index,section === 621);show('heroZone-'+index,section === 695);
        for (const part of ['body','shield','magic']) show('armour-'+index+'-'+part,armourSections.includes(section));
        if (!hero) continue;
        const extras = 'heroExtra-'+index+'-';
        if (!el(extras+'magicalWeapon')) {
          const details = el('party').querySelector(`[data-hero="${index}"]`);
          details.insertAdjacentHTML('beforeend',check(extras+'magicalWeapon')+
            field(extras+'attackDieBonus')+field(extras+'spellDamageBonus'));
        }
        for (const key of ['magicalWeapon','attackDieBonus','spellDamageBonus']) {
          const input = el(extras+key);
          if (document.activeElement !== input) {
            if (key === 'magicalWeapon') input.checked = !!hero[key];else input.value = hero[key] ?? 0;
          }
          input.disabled = active;
        }
      }
      const signature = JSON.stringify(game.party.map(hero => [hero.profileId,hero.name,hero.armour,hero.armourBreakdown]));
      if (signature !== lastParty && !active) {
        game.party.forEach((hero,index) => {
          if (hero.armourBreakdown || hero.armour === 0) for (const part of ['body','shield','magic'])
            el('armour-'+index+'-'+part).value = hero.armourBreakdown?.[part] ?? 0;
          el('heroArrival-'+index).value = String(heroes[index]?.[0] ?? '');
        });
        lastParty = signature;
      }
      if (!active && game.ship && document.activeElement !== el('shipCargo'))
        el('shipCargo').value = Array.isArray(game.ship.cargo) ? game.ship.cargo.length : game.ship.cargo ?? 0;
      if (!el('unitEditor').contains(document.activeElement)) fillUnit(game.units.find(unit => unit.uid === el('editUnit').value));
      for (const id of ['unitType','unitGarrison','unitChargeBonus','editUnitType','editUnitGarrison','editUnitChargeBonus'])
        el(id).disabled = active;
    },
  };
}

export function readCrownPersonalOptions({game,el,number,selectedIndices}) {
  const section = number('context'),result = {silver:game.silver};
  for (const [key,type,sections] of conditions) if (sections.includes(section)) {
    if (type === 'check') result[key] = el(key).checked;
    else if (type === 'number') result[key] = number(key);
    else if (type === 'hero') result[key] = el(key).value === '' ? undefined : number(key);
    else if (type === 'opponents') result[key] = [...el(key).selectedOptions].map(option => option.value);
    else if (type === 'outcome') result[key] = el(key).value === '' ? undefined : el(key).value === 'true';
    else result[key] = el(key).value;
  }
  if (section === 1175 && result.frozenHero !== undefined) {
    const selected = selectedIndices('members');
    result.participants = (selected.length ? selected : game.party.flatMap((hero,index) => hero.health > 0 ? [index] : []))
      .filter(index => index !== result.frozenHero);
  }
  if (armourSections.includes(section)) result.armourParts = Object.fromEntries(game.party.map((_,index) =>
    [index,Object.fromEntries(['body','shield','magic'].map(part => [part,number('armour-'+index+'-'+part)]))]));
  if (section === 621) result.grappleRolls = game.party.map((_,index) => number('grappleRoll-'+index));
  if (section === 695) result.heroZones = game.party.map((_,index) => el('heroZone-'+index).value);
  if (section === 94 && result.guardApproach === 'walls') {
    const selected = selectedIndices('members');
    const count = selected.length || game.party.filter(hero => hero.health > 0).length;
    result.heroArrivalOrder = Array.from({length:count},(_,index) => number('heroArrival-'+index));
    result.guardArrivalOrder = Array.from({length:6},(_,index) => el('guardArrival-'+index).value);
  }
  return result;
}

export function readCrownUnit({el,number,editing}) {
  const prefix = editing ? 'editUnit' : 'unit';
  return {type:el(prefix+'Type').value,garrison:el(prefix+'Garrison').value,
    firstRoundBonus:legendaryInteger(number(prefix+'ChargeBonus'))};
}

export function readCrownHero({el,number,index,hero}) {
  const prefix = 'heroExtra-'+index+'-';
  const parts = hero.armourBreakdown;
  const stale = parts && parts.body + parts.shield + parts.magic !== hero.armour;
  return {magicalWeapon:el(prefix+'magicalWeapon').checked,
    attackDieBonus:legendaryInteger(number(prefix+'attackDieBonus')),
    spellDamageBonus:legendaryInteger(number(prefix+'spellDamageBonus')),
    ...(stale ? {armourBreakdown:undefined} : {})};
}
