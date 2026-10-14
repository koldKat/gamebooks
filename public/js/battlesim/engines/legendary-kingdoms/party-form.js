import { LEGENDARY_SKILLS, VALLEY_PROFILES, newValleyCharacter, newLegendaryCustomCharacter,
  validateLegendaryCharacter } from './character.js';
import { LEGENDARY_SPELLS, chooseLegendaryStartingSpells } from './spells.js';

export const legendaryEscape = value => String(value).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaults = ['jessica','tiquon','tasha','akihiro'];
const starterSpells = Object.keys(LEGENDARY_SPELLS).filter(id=>LEGENDARY_SPELLS[id].starting);
const defaultSpells = ['armourOfHeaven','iceBolt','wolfSpirit'];
const equipment = ['health','maxHealth','armour','weaponBonus','skeletonHealth','healingPotions','invulnerabilityPotions'];

function numeric(id,label,value=0,min=0,max=1000000) {
  return `<label class="inv-edit-row"><span class="inv-edit-label">${legendaryEscape(label)}</span><input class="inv-edit-input" id="${id}" type="number" min="${min}" max="${max}" step="1" value="${value}"></label>`;
}

export function legendarySetupHTML(ID,tk,settings = {}) {
  const profiles = settings.profiles ?? VALLEY_PROFILES;
  const starting = settings.startingSpells ?? starterSpells;
  const custom = settings.customSkills ?? [5,3,3,3,1];
  return `<details><summary>${legendaryEscape(tk('newParty'))}</summary>`+defaults.map((profile,index)=>{
    const prefix=ID+'-new-'+index;
    return `<fieldset class="legendary-hero"><legend>${legendaryEscape(tk('heroSlot',{number:index+1}))}</legend>`+
      `<select class="inv-edit-input" id="${prefix}-profile">${Object.entries(profiles).map(([id,hero])=>
        `<option value="${id}"${id===profile?' selected':''}>${legendaryEscape(hero.name)}</option>`).join('')}`+
      `<option value="custom">${legendaryEscape(tk('custom'))}</option></select>`+
      `<div id="${prefix}-custom" hidden><label class="inv-edit-row"><span class="inv-edit-label">${legendaryEscape(tk('name'))}</span>`+
      `<input class="inv-edit-input" id="${prefix}-name" maxlength="100"></label>`+
      `<label class="bsim-checkbox"><input type="checkbox" id="${prefix}-caster">${legendaryEscape(tk('spellcaster'))}</label>`+
      LEGENDARY_SKILLS.map((skill,i)=>numeric(prefix+'-'+skill,tk(skill),custom[i],1,settings.maxSkill ?? 5)).join('')+`</div>`+
      `<div id="${prefix}-spells"${profiles[profile].spellcaster?'':' hidden'}><p>${legendaryEscape(tk('chooseThree'))}</p>`+
      starting.map(id=>`<label class="bsim-checkbox"><input type="checkbox" id="${prefix}-spell-${id}"${defaultSpells.includes(id)?' checked':''}>${legendaryEscape(tk('spell.'+id))}</label>`).join('')+
      `</div></fieldset>`;
  }).join('')+'</details>';
}

export function wireLegendarySetup(ID,el,settings = {}) {
  const profiles = settings.profiles ?? VALLEY_PROFILES;
  for (let index=0;index<4;index++) {
    const prefix='new-'+index;
    const update=()=>{
      const profile=el(prefix+'-profile').value;
      el(prefix+'-custom').hidden=profile!=='custom';
      el(prefix+'-spells').hidden=profile==='custom'?!el(prefix+'-caster').checked:!profiles[profile]?.spellcaster;
    };
    el(prefix+'-profile').addEventListener('change',update);
    el(prefix+'-caster').addEventListener('change',()=>{
      const values=el(prefix+'-caster').checked?(settings.casterSkills ?? [1,2,5,1,2]):(settings.customSkills ?? [5,3,3,3,1]);
      LEGENDARY_SKILLS.forEach((skill,i)=>{el(prefix+'-'+skill).value=values[i];});
      update();
    });
  }
}

export function readLegendarySetup(el,number,settings = {}) {
  const makeNamed = settings.newCharacter ?? newValleyCharacter;
  const makeCustom = settings.newCustomCharacter ?? newLegendaryCustomCharacter;
  const chooseSpells = settings.chooseStartingSpells ?? chooseLegendaryStartingSpells;
  const starting = settings.startingSpells ?? starterSpells;
  const party=[];
  const named=new Set();
  for (let index=0;index<4;index++) {
    const prefix='new-'+index,profile=el(prefix+'-profile').value;
    let hero;
    if (profile==='custom') hero=makeCustom(el(prefix+'-name').value,
      Object.fromEntries(LEGENDARY_SKILLS.map(skill=>[skill,number(prefix+'-'+skill)])),el(prefix+'-caster').checked);
    else {
      if (named.has(profile)) throw new RangeError('Choose four different named heroes');
      named.add(profile);hero=makeNamed(profile);
    }
    if (hero.spellcaster) hero=chooseSpells(hero,starting.filter(id=>el(prefix+'-spell-'+id).checked));
    party.push(hero);
  }
  return party;
}

export function renderLegendaryParty(container,party,ID,tk,busy,document) {
  const signature=party.map(hero=>hero.name+'|'+(hero.profileId??'custom')).join('\n');
  if (container.dataset.party!==signature) {
    const open=[...container.querySelectorAll('details')].map(details=>details.open);
    container.innerHTML=party.map((hero,index)=>{
      const prefix=ID+'-hero-'+index;
      return `<details data-hero="${index}"${open[index]?' open':''}><summary>${legendaryEscape(hero.name)}</summary>`+
        LEGENDARY_SKILLS.map(skill=>numeric(prefix+'-'+skill,tk(skill))).join('')+
        LEGENDARY_SKILLS.map(skill=>numeric(prefix+'-bonus-'+skill,tk('skillBonus',{skill:tk(skill)}))).join('')+
        equipment.map(key=>numeric(prefix+'-'+key,tk(key),0,key==='maxHealth'?1:0,key==='skeletonHealth'?6:1000000)).join('')+
        `<label class="bsim-checkbox"><input type="checkbox" id="${prefix}-armed">${legendaryEscape(tk('armed'))}</label>`+
        `<label class="bsim-checkbox"><input type="checkbox" id="${prefix}-stonecutterSword">${legendaryEscape(tk('stonecutterSword'))}</label>`+
        `<label class="bsim-checkbox"><input type="checkbox" id="${prefix}-twoHanded">${legendaryEscape(tk('twoHanded'))}</label></details>`;
    }).join('');
    container.dataset.party=signature;
  }
  party.forEach((hero,index)=>{
    for (const skill of LEGENDARY_SKILLS) {
      for (const [suffix,value] of [[skill,hero.skills[skill]],['bonus-'+skill,hero.bonuses[skill]??0]]) {
        const input=document.getElementById(ID+'-hero-'+index+'-'+suffix);
        if (document.activeElement!==input) input.value=value;
        input.disabled=busy||(hero.profileId==='skullcracker'&&suffix.startsWith('bonus-'));
      }
    }
    for (const key of equipment) {
      const input=document.getElementById(ID+'-hero-'+index+'-'+key);
      if (document.activeElement!==input) input.value=hero[key]??0;
      input.disabled=busy||(hero.profileId==='skullcracker'&&['armour','weaponBonus'].includes(key));
    }
    for (const key of ['armed','twoHanded','stonecutterSword']) {
      const input=document.getElementById(ID+'-hero-'+index+'-'+key);
      input.checked=!!hero[key];input.disabled=busy||hero.profileId==='skullcracker';
    }
  });
}

export function readLegendaryParty(party,el,number) {
  return party.map((hero,index)=>{
    const prefix='hero-'+index+'-';
    const next={...hero,skills:Object.fromEntries(LEGENDARY_SKILLS.map(skill=>[skill,number(prefix+skill)])),
      bonuses:Object.fromEntries(LEGENDARY_SKILLS.map(skill=>[skill,number(prefix+'bonus-'+skill)])),
      ...Object.fromEntries(equipment.map(key=>[key,number(prefix+key)])),
      armed:el(prefix+'armed').checked,twoHanded:el(prefix+'twoHanded').checked,stonecutterSword:el(prefix+'stonecutterSword').checked};
    if(hero.profileId==='skullcracker') Object.assign(next,{armed:true,twoHanded:false,stonecutterSword:false,
      armour:0,weaponBonus:0,bonuses:Object.fromEntries(LEGENDARY_SKILLS.map(skill=>[skill,0]))});
    validateLegendaryCharacter(next);
    return next;
  });
}
