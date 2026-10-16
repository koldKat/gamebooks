import { createCustomOpponentSetup } from '../../custom-setup.js';
import { customUrowenEncounter, urowenOpponentFields } from './opponents.js';
import {UROWEN_SOURCE} from './roster.js';
import {createUrowenCharacter,UROWEN_RACES,UROWEN_CAREERS,upgradeUrowenAttribute,
  changeUrowenExperience} from './core.js';
import {compileUrowenEncounters,createUrowenSimState,prepareUrowenEncounter} from './state.js';
import {resolveUrowenOpening} from './openings.js';
import {startUrowenEncounter,resolveUrowenEncounterRound} from './rounds.js';
import {startUrowenAnimalBet,rollUrowenAnimalBet,startUrowenDrinkingBet,
  rollUrowenDrinkingBet,stakeUrowenFight,startUrowenPointBet,rollUrowenPointBet} from './bets.js';
import {recoverUrowenMissionLife} from './forms.js';
import {recoverUrowenDefeat} from './recovery.js';
import {UROWEN_WEAPON_EFFECTS} from './weapons.js';
import {UROWEN_ELIXIRS,drinkUrowenElixir} from './elixirs.js';

const ID='sim550';
const specs=compileUrowenEncounters(UROWEN_SOURCE);
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const stats=['STR','SK','MAG','PER','life','maxLife','power','experience','coins'];
const equipment=['net','horse','companion','magicGreaves','dragonBoneRing'];
const spells=['fireball','poppy','lifeSuction','fireEdge','lethalMirror'];
export function createUrowenPanel({document,t,getRun,getBookId,saveState,showAlert,showConfirm,
  registerShortcut=()=>{},getButtonRow,roll=()=>Math.floor(Math.random()*6)+1}) {
  const tk=(key,params)=>t(`battlesim550.${key}`,params);
  const el=key=>document.getElementById(`${ID}-${key}`);
  let customSetup;
  const active=data=>['prepared','fighting'].includes(data?.fight?.status)||data?.contest?.status==='fighting';
  function data() {
    if(Number(getBookId())!==550)return null;
    const run=getRun();return run?run[ID]??=createUrowenSimState():null;
  }
  const player=d=>d.temporary?.player??d.character;
  const label=spec=>spec?.custom ? spec.enemies.map(e=>e.name).join(' / ') : tk('encounter_label',{enemy:spec.enemies.map(enemy=>enemy.name).join(' / '),section:spec.section});
  function close(){el('overlay')?.classList.remove('active');}
  function open(){if(!data()){showAlert(t('battlesim.no_active_playthrough'));return;}render();el('overlay').classList.add('active');}
  function action(update) {
    const run=getRun(),previous=data();if(!previous)return;
    try {
      const next=update(previous)??previous;
      if(getRun()!==run||Number(getBookId())!==550)return;
      for(const row of next.history.slice(previous.history.length)) {
        row.enemy=row.section===0 ? next.fight.enemies.map(e=>e.name).join(' / ') : label(specs.find(spec=>spec.section===row.section));
        row.outcome=row.status==='retreated'?'win':row.status;
        row.ts=Math.max(Date.now(),(next.history.at(-2)?.ts??0)+1);
      }
      run[ID]=next;saveState();render();
    } catch(error){showAlert(tk('invalid'));render();}
  }
  function confirmed(key,update) {
    const run=getRun(),previous=data();if(!previous)return;
    showConfirm(tk(key),()=>{if(getRun()===run&&data()===previous)action(update);});
  }
  function render() {
    if(!el('overlay'))return;
    const d=data();if(!d){close();return;}
    customSetup?.render();
    const p=d.fight&&active(d)?d.fight.player:player(d),busy=active(d),f=d.fight;
    for(const key of stats) {
      const value=['experience','coins'].includes(key)?d.character[key]:p.attributes[key]??p[key];
      if(document.activeElement!==el(key))el(key).value=value;
      el(key).disabled=busy;
    }
    for(const key of equipment){el(key).checked=!!d.character[key];el(key).disabled=busy;}
    for(const spell of spells){el('known_'+spell).checked=d.character.knownSpells?.includes(spell)??false;el('known_'+spell).disabled=busy;}
    for(const [key,value] of [['reroll_one',p.weapon.reroll?.includes(1)],['reroll_two',p.weapon.reroll?.includes(2)],['ice_crystal',p.weapon.sorcererOne===4]]) {
      el(key).checked=!!value;el(key).disabled=busy;
    }
    el('bow_owned').checked=!!d.character.bow;el('bow_owned').disabled=busy;
    el('bow_difficulty').value=d.character.bow?.difficulty??8;
    el('bow_bonus').value=d.character.bow?.bonus??0;
    el('arrows').value=d.character.arrows??0;el('arrows').disabled=busy;
    for(const kind of UROWEN_ELIXIRS){el('stock_'+kind).value=d.character.elixirs?.[kind]??0;el('stock_'+kind).disabled=busy;}
    el('drink_elixir').disabled=!['prepared','fighting'].includes(f?.status)||f?.rules.items===false;
    el('fight_stake').disabled=f?.section!==262||f?.status!=='prepared'||!!f?.wager;
    el('place_fight_bet').disabled=el('fight_stake').disabled;
    for(const key of ['attack','damage','lifeLoss']) {
      el('next_'+key).value=d.character.nextCombat?.[key]??0;el('next_'+key).disabled=busy;
    }
    for(const key of ['bow_difficulty','bow_bonus','potion_dice','potion_bonus','potion_count','add_potion'])el(key).disabled=busy;
    el('recovery').disabled=busy||d.temporary?.stage!=='mission';
    el('restore_form').disabled=busy||!d.temporary;
    el('recover_defeat').disabled=f?.status!=='loss';
    for(let i=0;i<6;i++){el(`armor${i}`).value=p.armor[i];el(`armor${i}`).disabled=busy;}
    el('attribute').value=p.weapon.attribute;el('bonus').value=p.weapon.bonus;
    el('weapon_effect').value=p.weapon.effect??'custom';el('weapon_effect').disabled=busy||!!d.temporary;
    for(const option of el('weapon_effect').options)option.disabled=option.value==='scepter'&&d.temporary?.stage!=='mission';
    el('attribute').disabled=busy;el('bonus').disabled=busy;
    for(const key of ['race','career','difficulty','new','upgrade','gain_xp','encounter','prepare','contest','stake','bet'])el(key).disabled=busy;
    el('race').value=d.character.race;el('career').value=d.character.career;el('difficulty').value=d.character.difficulty;
    el('status').textContent=f?tk(`status.${f.status}`):tk('pick');
    el('opponent').textContent=f?tk('opponent_health',{enemy:f.enemies[f.target].name,health:f.enemies[f.target].life}):'';
    el('health').textContent=tk('player_health',{life:p.life,max:p.maxLife,power:p.power});
    el('opening').hidden=f?.status!=='prepared';el('attack').disabled=f?.status!=='fighting';
    el('cancel').disabled=!busy;
    el('opening_net').disabled=f?.status!=='prepared'||!d.character.net||f.rules.items===false;
    el('opening_horse').disabled=f?.status!=='prepared'||f.section!==123||!d.character.horse;
    el('retry').disabled=f?.status!=='prepared';
    el('fire_edge').disabled=f?.status!=='fighting'||f.fireEdgeUsed||!d.character.knownSpells?.includes('fireEdge')||f.rules.spells===false;
    el('lethal_mirror').disabled=f?.status!=='fighting'||f.lethalMirrorUsed||!d.character.knownSpells?.includes('lethalMirror')||f.rules.spells===false;
    el('head_spit').disabled=f?.status!=='fighting'||!f.rules.playerHeadSpitOncePerEnemy||!!f.enemies[f.target].spitPenalty;
    const selected=el('target').value;
    el('target').innerHTML=`<option value="body">${tk('body')}</option>`+(f?.appendages??[])
      .filter(row=>row.life>0).map(row=>`<option value="${row.id}">${tk('appendage',{number:row.id+1,life:row.life})}</option>`).join('');
    if([...el('target').options].some(option=>option.value===selected))el('target').value=selected;
    el('target').disabled=f?.status!=='fighting';
    const choice=el('ability').value;
    el('ability').innerHTML=`<option value="attack">${tk('attack')}</option>`+
      (p.career==='monk'&&!f?.monkUsed?`<option value="monk">${tk('monk')}</option>`:'')+
      (f?.rules.items!==false?(d.character.potions??[]).map((potion,index)=>potion.quantity>0?
        `<option value="potion:${index}">${tk('potion',{dice:potion.dice,bonus:potion.bonus,count:potion.quantity})}</option>`:'').join(''):'')+
      (f?.rules.spells!==false&&p.weapon.attribute==='MAG'?(d.character.knownSpells??[])
        .filter(spell=>['fireball','poppy','lifeSuction'].includes(spell))
        .map(spell=>`<option value="spell:${spell}">${tk(spell)}</option>`).join(''):'');
    if([...el('ability').options].some(option=>option.value===choice))el('ability').value=choice;
    el('ability').disabled=f?.status!=='fighting';
    for(const option of el('ability').options)if(option.value.startsWith('spell:')) {
      option.disabled=p.power<({fireball:2,poppy:3,lifeSuction:2}[option.value.slice(6)]);
    }
    el('contest_roll').disabled=d.contest?.status!=='fighting';
    const contest=d.contest;
    el('contest_status').textContent=!contest?'':tk('contest_progress',{
      name:tk(String(contest.section)),status:tk('status.'+(contest.status==='finished'?(contest.winner===contest.selected?'win':'loss'):contest.status)),
      score:[53,72].includes(contest.section)?`${contest.playerPoints} : ${contest.enemyPoints}`:
        contest.section===391?`${contest.playerResistance} : ${contest.enemyResistance}`:
          contest.animals.map(animal=>`${animal.name}: ${animal.life}`).join(' / ')});
    const animals=UROWEN_SOURCE.animals.filter(animal=>animal.section===Number(el('contest').value));
    const selectedAnimal=el('animal').value;
    el('animal').innerHTML=animals.map(animal=>`<option value="${escape(animal.name)}">${escape(animal.name)}</option>`).join('');
    if(animals.some(animal=>animal.name===selectedAnimal))el('animal').value=selectedAnimal;
    el('animal').disabled=busy||animals.length===0;
    el('log').innerHTML=d.log.slice(-100).reverse().map(row=>`<div>${escape(tk('result',{
      dice:(row.dice??row.rolls??[]).map(die=>typeof die==='number'?die:die.raw).join(' + ')||'-',
      dealt:row.enemyDamage??row.damage??0,taken:(row.playerDamage??0)+(row.ongoing??0)+(row.supportDamage??0),healed:row.healed??0}))}</div>`).join('');
    el('history').innerHTML=d.history.slice(-50).reverse().map(row=>
      `<div class="bsim-history-row">${escape(row.enemy??label(specs.find(spec=>spec.section===row.section)))}: ${escape(tk(`status.${row.status}`))}</div>`).join('');
  }
  function init() {
    if(el('overlay'))return;
    const number=(key,label=key)=>`<label class="inv-edit-row"><span class="inv-edit-label bsim-stat-label">${tk(label)}</span><input id="${ID}-${key}" class="inv-edit-input inv-qty-input" type="number" min="0" step="1"></label>`;
    const button=key=>`<button id="${ID}-${key}" class="inv-add-btn">${tk(key)}</button>`;
    const check=(key,label=key)=>`<label class="inv-edit-row"><input id="${ID}-${key}" type="checkbox">${tk(label)}</label>`;
    const select=(key,values,translated=true)=>`<label class="inv-edit-row"><span>${tk(key)}</span><select id="${ID}-${key}" class="inv-edit-input">${values.map(value=>`<option value="${escape(value)}">${translated?tk(value):escape(value)}</option>`).join('')}</select></label>`;
    const overlay=document.createElement('div');overlay.id=`${ID}-overlay`;overlay.className='inv-overlay';
    overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${tk('title')}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div>
    <div class="bsim-body"><div class="bsim-col bsim-col-left"><div class="bsim-side"><div class="bsim-side-title">${tk('character')}</div>
    ${select('race',Object.keys(UROWEN_RACES))}${select('career',Object.keys(UROWEN_CAREERS))}${select('difficulty',['destroyer','easy','standard','difficult','heroic'])}
    ${stats.map(key=>number(key)).join('')}${select('attribute',['STR','SK','MAG'])}${number('bonus')}${select('weapon_effect',Object.keys(UROWEN_WEAPON_EFFECTS))}
    <details><summary>${tk('equipment')}</summary>${equipment.map(key=>check(key)).join('')}${Array.from({length:6},(_,i)=>number(`armor${i}`,`location${i+1}`)).join('')}
    ${check('reroll_one')}${check('reroll_two')}${check('ice_crystal')}${check('bow_owned')}${number('bow_difficulty')}${number('bow_bonus')}${number('arrows')}
    ${spells.map(spell=>check('known_'+spell,spell)).join('')}${number('potion_dice')}${number('potion_bonus')}${number('potion_count')}${button('add_potion')}</details>
    <details><summary>${tk('elixirs')}</summary>${UROWEN_ELIXIRS.map(kind=>number('stock_'+kind,kind)).join('')}${select('elixir',UROWEN_ELIXIRS)}${button('drink_elixir')}</details>
    <div class="bsim-btn-row">${button('new')}${button('upgrade')}${button('gain_xp')}</div>
    <details><summary>${tk('temporary_form')}</summary>${select('checkpoint',['394','386','376','361','349'],false)}<div class="bsim-btn-row">${button('recovery')}${button('restore_form')}</div></details></div>
    <details class="bsim-side"><summary>${tk('next_combat')}</summary>${select('next_attack',['-1','0','1'],false)}${select('next_damage',['-1','0','1'],false)}${select('next_lifeLoss',['0','2','3'],false)}</details>
    <div class="bsim-side"><label class="inv-edit-row">${tk('encounter')}<select id="${ID}-encounter" class="inv-edit-input">${specs.map(spec=>`<option value="${spec.section}">${escape(label(spec))}</option>`).join('')}</select></label>
    ${button('prepare')}<p id="${ID}-health"></p><div id="${ID}-status" class="bsim-status"></div><div id="${ID}-opponent"></div>
    <details><summary>${tk('fight_wager')}</summary>${number('fight_stake')}${button('place_fight_bet')}</details>
    <details><summary>${tk('scene_options')}</summary>${check('scene112')}<label class="inv-edit-row">${tk('defeat_penalty')}<select id="${ID}-penalty" class="inv-edit-input"><option value="experience">${tk('lose_ep')}</option><option value="armor">${tk('damage_armor')}</option><option value="item">${tk('discard_net')}</option></select></label>${select('penalty_location',['1','2','5','6'],false)}${button('recover_defeat')}</details>
    <details><summary>${tk('opening_options')}</summary>${check('opening_net')}${check('opening_horse')}${check('retry')}</details>
    <div class="bsim-btn-row">${button('opening')}${button('cancel')}</div>
    <label class="inv-edit-row">${tk('target')}<select id="${ID}-target" class="inv-edit-input"></select></label>
    <label class="inv-edit-row">${tk('ability')}<select id="${ID}-ability" class="inv-edit-input"></select></label>
    <details><summary>${tk('critical_options')}</summary>${check('fire_edge')}${check('lethal_mirror')}${check('head_spit')}</details>${button('attack')}</div>
    <details class="bsim-side"><summary>${tk('contests')}</summary>${select('contest',['53','56','72','129','391'])}<label class="inv-edit-row">${tk('animal')}<select id="${ID}-animal" class="inv-edit-input"></select></label>${number('stake')}<div class="bsim-btn-row">${button('bet')}${button('contest_roll')}</div><p id="${ID}-contest_status"></p></details>
    <p>${tk('note')}</p></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${tk('history')}</summary><div id="${ID}-history" class="bsim-history-list"></div></details><div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    customSetup=createCustomOpponentSetup({document,id:ID,t,getRun,getData:data,isBusy:active,
      fields:urowenOpponentFields.map(f=>({...f,label:tk(f.key)})),
      defaults:{attributeCode:1,power:0,damageDice:1,damageBonus:0,...Object.fromEntries(Array.from({length:6},(_,i)=>['armor'+i,0]))},
      presets:specs.flatMap(spec=>spec.enemies.map(enemy=>({...enemy,displayName:enemy.name,attributeCode:['STR','SK','MAG','PER'].indexOf(enemy.attribute),
        ...Object.fromEntries(enemy.armorByLocation.map((value,i)=>['armor'+i,value]))}))),
    });
    const btn=document.createElement('button');btn.id=`${ID}-btn`;btn.textContent=t('battlesim.title');btn.style.display='none';
    getButtonRow().appendChild(btn);btn.addEventListener('click',open);el('close').addEventListener('click',close);
    let backdrop=false;
    overlay.addEventListener('mousedown',event=>{backdrop=event.target===overlay;});
    overlay.addEventListener('click',event=>{if(backdrop&&event.target===overlay)close();});
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();}});
    registerShortcut({button:btn,overlay,open,close});
    for(const key of stats)el(key).addEventListener('change',()=>action(previous=>{
      if(active(previous))return previous;
      const value=Number(el(key).value),next=structuredClone(previous),p=player(next);
      if(!el(key).value.trim()||!Number.isSafeInteger(value)||value<0||
        ['STR','SK','MAG','PER'].includes(key)&&value>6||key==='life'&&value>p.maxLife||key==='maxLife'&&value<p.life)throw new RangeError('Invalid value');
      if(['experience','coins'].includes(key))next.character[key]=value;
      else if(key in p.attributes)p.attributes[key]=value;else p[key]=value;
      return next;
    }));
    for(const key of equipment)el(key).addEventListener('change',()=>action(previous=>{
      if(active(previous))return previous;
      const next=structuredClone(previous);next.character[key]=el(key).checked;
      if(next.temporary)next.temporary.player[key]=el(key).checked;
      return next;
    }));
    for(let i=0;i<6;i++)el(`armor${i}`).addEventListener('change',()=>action(previous=>{
      if(active(previous))return previous;
      const next=structuredClone(previous),value=Number(el(`armor${i}`).value);
      if(!Number.isSafeInteger(value)||value<0||value>20)throw new RangeError('Invalid armor');
      player(next).armor[i]=value;return next;
    }));
    for(const key of ['attribute','bonus'])el(key).addEventListener('change',()=>action(previous=>{
      if(active(previous))return previous;
      const next=structuredClone(previous),p=player(next),bonus=Number(el('bonus').value);
      if(!Number.isSafeInteger(bonus)||Math.abs(bonus)>20)throw new RangeError('Invalid weapon');
      p.weapon.attribute=el('attribute').value;p.weapon.bonus=bonus;return next;
    }));
    el('weapon_effect').addEventListener('change',()=>action(previous=>{
      if(active(previous)||previous.temporary)return previous;
      const effect=el('weapon_effect').value;
      if(!Object.hasOwn(UROWEN_WEAPON_EFFECTS,effect)||effect==='scepter')throw new RangeError('Invalid weapon effect');
      const next=structuredClone(previous);next.character.weapon.effect=effect;return next;
    }));
    for(const key of ['reroll_one','reroll_two','ice_crystal'])el(key).addEventListener('change',()=>action(previous=>{
      if(active(previous))return previous;
      const next=structuredClone(previous),weapon=player(next).weapon;
      weapon.reroll=[...(el('reroll_one').checked?[1]:[]),...(el('reroll_two').checked?[2]:[])];
      weapon.sorcererOne=el('ice_crystal').checked?4:3;return next;
    }));
    for(const key of ['bow_owned','bow_difficulty','bow_bonus'])el(key).addEventListener('change',()=>action(previous=>{
      if(active(previous))return previous;
      const next=structuredClone(previous),difficulty=Number(el('bow_difficulty').value),bonus=Number(el('bow_bonus').value);
      if(!Number.isSafeInteger(difficulty)||difficulty<1||difficulty>20||!Number.isSafeInteger(bonus)||Math.abs(bonus)>20)throw new RangeError('Invalid bow');
      next.character.bow=el('bow_owned').checked?{difficulty,dice:1,bonus}:null;return next;
    }));
    el('arrows').addEventListener('change',()=>action(previous=>{
      if(active(previous))return previous;
      const arrows=Number(el('arrows').value);
      if(!el('arrows').value.trim()||!Number.isSafeInteger(arrows)||arrows<0||arrows>999)throw new RangeError('Invalid arrow stock');
      const next=structuredClone(previous);next.character.arrows=arrows;return next;
    }));
    for(const kind of UROWEN_ELIXIRS)el('stock_'+kind).addEventListener('change',()=>action(previous=>{
      if(active(previous))return previous;
      const quantity=Number(el('stock_'+kind).value);
      if(!el('stock_'+kind).value.trim()||!Number.isSafeInteger(quantity)||quantity<0||quantity>99)throw new RangeError('Invalid elixir stock');
      const next=structuredClone(previous);(next.character.elixirs??={})[kind]=quantity;return next;
    }));
    el('drink_elixir').addEventListener('click',()=>action(previous=>drinkUrowenElixir(previous,el('elixir').value)));
    el('place_fight_bet').addEventListener('click',()=>action(previous=>{
      if(!el('fight_stake').value.trim())throw new RangeError('Enter a wager');
      return stakeUrowenFight(previous,Number(el('fight_stake').value));
    }));
    for(const key of ['attack','damage','lifeLoss'])el('next_'+key).addEventListener('change',()=>action(previous=>{
      if(active(previous))return previous;
      const value=Number(el('next_'+key).value);
      if(!Number.isSafeInteger(value)||(key==='lifeLoss'?![0,2,3].includes(value):Math.abs(value)>1))throw new RangeError('Invalid next-combat modifier');
      const next=structuredClone(previous);(next.character.nextCombat??={attack:0,damage:0,lifeLoss:0})[key]=value;return next;
    }));
    for(const spell of spells)el('known_'+spell).addEventListener('change',()=>action(previous=>{
      if(active(previous))return previous;
      const next=structuredClone(previous);next.character.knownSpells=spells.filter(key=>el('known_'+key).checked);return next;
    }));
    el('add_potion').addEventListener('click',()=>action(previous=>{
      if(active(previous))return previous;
      const dice=Number(el('potion_dice').value),bonus=Number(el('potion_bonus').value),quantity=Number(el('potion_count').value);
      if(!Number.isSafeInteger(dice)||dice<1||dice>4||!Number.isSafeInteger(bonus)||Math.abs(bonus)>20||!Number.isSafeInteger(quantity)||quantity<1||quantity>99)throw new RangeError('Invalid potion');
      const next=structuredClone(previous);(next.character.potions??=[]).push({dice,bonus,quantity});return next;
    }));
    el('recovery').addEventListener('click',()=>action(previous=>{
      if(active(previous))return previous;
      const next=structuredClone(previous);next.temporary=recoverUrowenMissionLife(next.temporary,Number(el('checkpoint').value));return next;
    }));
    el('restore_form').addEventListener('click',()=>confirmed('restore_confirm',previous=>{
      if(active(previous))return previous;
      const next=structuredClone(previous);next.temporary=null;next.fight=null;return next;
    }));
    el('recover_defeat').addEventListener('click',()=>action(previous=>recoverUrowenDefeat(previous,
      {penalty:el('penalty').value,armorLocation:Number(el('penalty_location').value)})));
    el('new').addEventListener('click',()=>confirmed('new_confirm',previous=>{
      if(active(previous))return previous;
      const next=createUrowenSimState(createUrowenCharacter({race:el('race').value,career:el('career').value,difficulty:el('difficulty').value}));
      next.history=previous.history;return next;
    }));
    el('upgrade').addEventListener('click',()=>action(previous=>{
      if(active(previous)||previous.temporary)throw new RangeError('Finish the transformation first');
      const next=structuredClone(previous);next.character=upgradeUrowenAttribute(next.character,el('attribute').value);return next;
    }));
    el('gain_xp').addEventListener('click',()=>action(previous=>{
      if(active(previous)||previous.temporary)throw new RangeError('Finish the transformation first');
      const next=structuredClone(previous);next.character=changeUrowenExperience(next.character,1);return next;
    }));
    el('prepare').addEventListener('click',()=>action(previous=>prepareUrowenEncounter(previous,el('encounter').value==='0'?customUrowenEncounter(customSetup.settings(previous).opponents):specs.find(spec=>spec.section===Number(el('encounter').value)),
      {missionAttribute:el('attribute').value,unarmedAttribute:el('attribute').value,
        firstAttackPenalty:Number(el('encounter').value)===135&&el('scene112').checked?3:0})));
    el('opening').addEventListener('click',()=>action(previous=>{
      let next=resolveUrowenOpening(previous,roll,{net:!el('opening_net').disabled&&el('opening_net').checked,
        horseCharge:!el('opening_horse').disabled&&el('opening_horse').checked,retry:el('retry').checked,
        hunterBow:previous.fight.player.career==='hunter'&&previous.character.arrows>0&&previous.fight.rules.hunterArrow!==false&&previous.fight.rules.weapons!==false?previous.character.bow:null}).state;
      if(next.fight.status==='prepared'&&next.fight.openingDone)next=startUrowenEncounter(next);
      return next;
    }));
    el('attack').addEventListener('click',()=>action(previous=>{
      const value=el('ability').value,options={knownSpells:previous.character.knownSpells??[]};
      options.fireEdge=!el('fire_edge').disabled&&el('fire_edge').checked;
      options.lethalMirror=!el('lethal_mirror').disabled&&el('lethal_mirror').checked;
      options.headSpit=!el('head_spit').disabled&&el('head_spit').checked;
      if(el('target').value!=='body')options.appendage=Number(el('target').value);
      if(value==='monk')options.monkHeal=true;
      if(value.startsWith('potion:'))options.potionIndex=Number(value.slice(7));
      if(value.startsWith('spell:'))options.spell=value.slice(6);
      return resolveUrowenEncounterRound(previous,roll,options).state;
    }));
    el('cancel').addEventListener('click',()=>confirmed('cancel_confirm',previous=>{
      const next=structuredClone(previous);next.fight=null;next.contest=null;return next;
    }));
    el('bet').addEventListener('click',()=>action(previous=>{
      const section=Number(el('contest').value);
      if(!el('stake').value.trim())throw new RangeError('Enter a wager');
      const stake=Number(el('stake').value);
      if([53,72].includes(section))return startUrowenPointBet(previous,section,stake);
      return section===391?startUrowenDrinkingBet(previous,stake):startUrowenAnimalBet(previous,section,
        UROWEN_SOURCE.animals.filter(animal=>animal.section===section),{stake,selected:el('animal').value});
    }));
    el('contest').addEventListener('change',render);
    el('contest_roll').addEventListener('click',()=>action(previous=>previous.contest.section===391?
      rollUrowenDrinkingBet(previous,roll).state:[53,72].includes(previous.contest.section)?
        rollUrowenPointBet(previous,roll).state:rollUrowenAnimalBet(previous,roll).state));
  }
  return {init,render,open,close,setVisible(visible){if(el('btn'))el('btn').style.display=visible?'':'none';if(!visible)close();}};
}
