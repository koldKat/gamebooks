import {startCrossroadsFight, crossroadsRound, crossroadsAbilityCheck,encounterTargets} from './core.js';
import {createOpponentEditor} from '../../opponents.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const abilities = ['strength','intelligence','wisdom','constitution','dexterity','charisma'];
const characterFields = [...abilities,'hp','maxHp','attackBonus','defenceBonus'];
const active = fight => fight?.status === 'active';

export function createCrossroadsPanel({document,definition,state,getRoster,t,getRun,getBookId,saveState,
  getButtonRow,showAlert,showConfirm,registerShortcut = () => {}}) {
  const ID=definition.stateKey, tk=(key,params)=>t(definition.i18nPrefix+'.'+key,params), el=key=>document.getElementById(ID+'-'+key);
  let editor,shownRun,rendered,editorRun;
  const button=key=>`<button type="button" class="bsim-action-btn" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const field=(key,min=0,max=1000000)=>`<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="${max}" step="1"></label>`;
  const number=(key,min=0,max=1000000)=>{
    const raw=el(key).value.trim(), n=Number(raw);
    if (!raw || !Number.isSafeInteger(n) || n<min || n>max) throw new RangeError('Invalid number');
    return n;
  };
  const preset=()=>getRoster().find(entry=>entry.section===el('encounter').value);
  function close(){el('overlay')?.classList.remove('active');rendered=null;}
  function change(update){
    if (shownRun!==getRun() || Number(getBookId())!==definition.id || !el('overlay')?.classList.contains('active')) {close();return;}
    try {if(state.change(update))render(true);} catch {showAlert(tk('invalid'));}
  }
  function confirm(key,update){
    const run=getRun(),before=state.read();
    showConfirm(tk(key),()=>{if(getRun()===run && state.read()===before)change(update);});
  }
  function readCharacter(){
    const result=Object.fromEntries(characterFields.map(key=>[key,number(key,key.endsWith('Bonus')?-100:0,abilities.includes(key)||key.endsWith('Bonus')?100:1000000)]));
    if (!result.maxHp || result.hp>result.maxHp)throw new RangeError('Invalid hit points');
    return result;
  }
  function setup(){return {section:el('encounter').value,opponents:editor.snapshot(),weaponDice:el('weaponDice').value,weaponAdd:el('weaponAdd').value};}
  function saveSetup(){
    if (shownRun!==getRun() || active(state.read()?.fight))return;
    state.change(data=>{data.setup=setup();});
    rendered=state.read();
  }
  function setupNotes(){
    const entry=preset(), damage=entry?.rules.heroDamage;
    el('sourceNotes').textContent=(entry?.rules.sourceNotes ?? []).join(' ');
    el('weaponNote').textContent=entry?.rules.enemyOnly?tk('noHeroAttack'):damage?tk('printedDamage'):tk('chooseDamage');
    for(const key of ['weaponDice','weaponAdd'])el(key).disabled=active(state.read()?.fight)||Boolean(damage)||Boolean(entry?.rules.enemyOnly);
    if(damage){el('weaponDice').value=damage.dice;el('weaponAdd').value=damage.add;}
  }
  function logEvents(data,fight){
    data.fight=fight;
    for(const event of fight.events){
      if(event.kind==='attack')data.log.push(tk('attack',{name:event.side==='hero'?tk('hero'):event.name,
        dice:event.automatic?tk('automatic'):event.dice.join('+'),total:event.total,result:tk(event.hit?'hit':'miss'),damage:event.damage}));
      if(event.kind==='check')data.log.push(tk('check',{name:tk(event.ability),dice:event.dice.join('+'),result:tk(event.passed?'passed':'failed')}));
      if(event.kind==='freeRounds')data.log.push(tk('freeRounds',{n:event.amount}));
      if(event.kind==='absorbed')data.log.push(tk('absorbed',{name:event.name}));
      if(event.kind==='blinded')data.log.push(tk('blinded'));
      if(event.kind==='fled')data.log.push(tk('fled',{name:event.name}));
      if(event.kind==='shape')data.log.push(tk('shape',{name:event.name}));
      if(event.kind==='disarmed')data.log.push(tk('disarmed',{name:event.name}));
      if(event.kind==='poison')data.log.push(tk('poison',{dice:event.dice.join('+'),result:tk(event.passed?'passed':'failed'),damage:event.damage}));
      if(event.kind==='healing')data.log.push(tk('restored',{n:event.amount}));
      if(event.kind==='outcome')data.log.push(tk('status.'+event.status)+(event.destination?' '+tk('destination',{n:event.destination}):''));
    }
  }
  function render(force=false){
    if(!el('overlay')?.classList.contains('active'))return;
    if(shownRun!==getRun() || Number(getBookId())!==definition.id){close();return;}
    const data=state.read();if(!data || !force && data===rendered)return;rendered=data;
    const fight=data.fight,locked=active(fight),hero=data.character;
    if(editorRun!==shownRun){
      editorRun=shownRun;el('encounter').value=data.setup.section ?? 'custom';
      const entry=preset();editor.set(data.setup.opponents ?? (entry?editorRows(entry.enemies):[{}]));
      el('weaponDice').value=data.setup.weaponDice ?? '';el('weaponAdd').value=data.setup.weaponAdd ?? 0;
    }
    for(const key of characterFields){el(key).value=key==='hp'&&locked?fight.hero.hp:hero?.[key]??'';el(key).disabled=locked;}
    editor.lock(locked||Boolean(preset()?.rules.mechanics?.abilityOutcome));editor.fixCount(Boolean(preset()));el('encounter').disabled=locked;
    el('start').disabled=locked||!hero?.hp;el('saveCharacter').disabled=locked;el('newCharacter').disabled=locked;
    el('round').disabled=!locked;el('cancel').disabled=!locked;
    el('heal').disabled=!hero?.hp||Boolean(locked&&fight.rules.enemyOnly);
    el('abilityCheck').disabled=locked||!hero?.hp;
    const currentTarget=Number(el('target').value),targets=encounterTargets(fight).map(index=>({enemy:fight.enemies[index],index}));
    el('target').innerHTML=targets.map(({enemy,index})=>`<option value="${index}">${escape(enemy.name)}</option>`).join('');
    el('target').value=targets.some(({index})=>index===currentTarget)?currentTarget:targets[0]?.index??'';
    el('target').disabled=!locked||Boolean(fight.rules.enemyOnly);
    el('status').textContent=tk('status.'+(fight?.status??'ready'))+(fight?' · '+tk('roundNumber',{n:fight.round}):'');
    el('destination').textContent=fight?.destination?tk('destination',{n:fight.destination}):'';
    el('opponents').innerHTML=fight?fight.enemies.map(enemy=>'<div>'+escape(tk('enemyHp',{name:enemy.name,n:enemy.hp,max:enemy.maxHp}))+'</div>').join(''):'';
    el('log').innerHTML=data.log.slice(-80).map(line=>'<div>'+escape(line)+'</div>').join('');
    el('history').innerHTML=data.history.slice(-40).toReversed().map(row=>'<div>'+escape(row.enemy+': '+tk('status.'+row.outcome))+'</div>').join('');
    setupNotes();
  }
  function editorRows(enemies){return enemies.map(enemy=>({...structuredClone(enemy),displayName:enemy.name,toHit:enemy.attacks[0]?.toHit??enemy.printedAttack,damageDice:enemy.attacks[0]?.damage.dice,damageAdd:enemy.attacks[0]?.damage.add}));}
  function open(){
    if(Number(getBookId())!==definition.id||!getRun()){showAlert(t('battlesim.no_active_playthrough'));return;}
    shownRun=getRun();editorRun=null;
    if(!state.read())state.change(data=>{data.character=structuredClone(definition.defaultHero);});
    el('overlay').classList.add('active');render(true);
  }
  function init(){
    if(el('overlay'))return;
    const overlay=document.createElement('div');overlay.id=ID+'-overlay';overlay.className='inv-overlay';
    overlay.innerHTML=`<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-heading"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-heading">${escape(definition.title)}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">×</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left">
      <details open><summary>${escape(tk('character'))}</summary>${characterFields.map(key=>field(key,key.endsWith('Bonus')?-100:0,abilities.includes(key)||key.endsWith('Bonus')?100:1000000)).join('')}<div class="bsim-btn-row">${button('saveCharacter')}${button('newCharacter')}</div></details>
      <label class="inv-edit-row"><span>${escape(tk('encounter'))}</span><select class="inv-edit-input" id="${ID}-encounter"><option value="custom">${escape(tk('custom'))}</option>${getRoster().map(entry=>`<option value="${entry.section}">${escape(entry.label)}</option>`).join('')}</select></label>
      <div id="${ID}-editor"></div><p class="bsim-note" id="${ID}-sourceNotes"></p>
      ${field('weaponDice',0,10)}${field('weaponAdd',-100,1000)}<p class="bsim-note" id="${ID}-weaponNote"></p>${button('start')}
      <label class="inv-edit-row"><span>${escape(tk('target'))}</span><select class="inv-edit-input" id="${ID}-target"></select></label><div class="bsim-btn-row">${button('round')}${button('cancel')}</div>
      ${field('healing',1)}${button('heal')}<p class="bsim-note">${escape(tk('healingNote'))}</p>
      <label class="inv-edit-row"><span>${escape(tk('ability'))}</span><select class="inv-edit-input" id="${ID}-ability">${abilities.map(key=>`<option value="${key}">${escape(tk(key))}</option>`).join('')}</select></label>${field('abilityModifier',-100,100)}${button('abilityCheck')}
      </div><div class="bsim-col bsim-col-right"><p id="${ID}-status" role="status"></p><p id="${ID}-destination"></p><div id="${ID}-opponents"></div><h3 class="bsim-side-title">${escape(tk('log'))}</h3><div class="bsim-log" id="${ID}-log"></div><h3 class="bsim-side-title">${escape(tk('history'))}</h3><div class="bsim-history-list" id="${ID}-history"></div></div></div></div>`;
    document.body.append(overlay);
    el('abilityModifier').value=0;
    editor=createOpponentEditor({document,id:ID,t,fields:[{key:'toBeHit',label:tk('toBeHit'),min:3,max:18},{key:'toHit',label:tk('toHit'),min:3,max:18},{key:'hp',label:tk('hp'),min:1},{key:'damageDice',label:tk('damageDice'),min:0,max:10},{key:'damageAdd',label:tk('damageAdd'),min:-100,max:1000}],presets:getRoster().filter(entry=>!entry.rules.mechanics?.abilityOutcome).flatMap(entry=>editorRows(entry.enemies)),
      isStatUnavailable:(key,row)=>key==='toHit'&&row.attacks?.every(attack=>attack.check==='constitution')});
    el('editor').append(editor.element);
    const trigger=document.createElement('button');trigger.id=ID+'-btn';trigger.style.display='none';trigger.textContent=t('battlesim.title');getButtonRow().append(trigger);trigger.addEventListener('click',open);
    el('close').addEventListener('click',close);
    overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();}});
    el('encounter').addEventListener('change',()=>{if(active(state.read()?.fight))return;const entry=preset();editor.set(entry?editorRows(entry.enemies):[{}]);editor.fixCount(Boolean(entry));editor.lock(Boolean(entry?.rules.mechanics?.abilityOutcome));el('weaponDice').value='';el('weaponAdd').value=0;setupNotes();saveSetup();});
    editor.element.addEventListener('input',saveSetup);editor.element.addEventListener('change',saveSetup);
    for(const key of ['weaponDice','weaponAdd'])el(key).addEventListener('change',saveSetup);
    el('saveCharacter').addEventListener('click',()=>change(data=>{if(active(data.fight))return;data.character=readCharacter();data.fight=null;}));
    el('newCharacter').addEventListener('click',()=>confirm('resetConfirm',data=>{if(active(data.fight))return;data.character=structuredClone(definition.defaultHero);data.fight=null;}));
    el('start').addEventListener('click',()=>change(data=>{
      if(active(data.fight))return;data.character=readCharacter();const entry=preset(),rules=structuredClone(entry?.rules??{});
      const enemies=rules.mechanics?.abilityOutcome?structuredClone(entry.enemies):editor.read().map(enemy=>{
        const attacks=structuredClone(enemy.attacks??[{toHit:enemy.toHit,damage:{dice:enemy.damageDice,add:enemy.damageAdd}}]);
        for(const attack of attacks)if(!attack.check)attack.toHit=enemy.toHit;
        attacks[0].damage={...attacks[0].damage,dice:enemy.damageDice,add:enemy.damageAdd};
        return {name:enemy.displayName||tk('opponent'),hp:enemy.hp,toBeHit:enemy.toBeHit,attacks};
      });
      if(enemies.some(enemy=>enemy.attacks.some(attack=>attack.check||attack.when)))rules.mechanics??={};
      data.setup=setup();data.encounterName=entry?.label??enemies.map(enemy=>enemy.name).join(' / ');
      data.fight=startCrossroadsFight(data.character,enemies,rules,rules.enemyOnly?null:rules.heroDamage??{dice:number('weaponDice',0,10),add:number('weaponAdd',-100,1000)});
      data.log.push(data.encounterName);
    }));
    el('round').addEventListener('click',()=>change(data=>logEvents(data,crossroadsRound(data.fight,{target:Number(el('target').value)}))));
    el('heal').addEventListener('click',()=>change(data=>{
      const amount=number('healing',1);
      if(active(data.fight))logEvents(data,crossroadsRound(data.fight,{healing:amount}));
      else {const restored=Math.min(amount,data.character.maxHp-data.character.hp);data.character.hp+=restored;data.fight=null;data.log.push(tk('restored',{n:restored}));}
    }));
    el('abilityCheck').addEventListener('click',()=>change(data=>{if(active(data.fight))return;const key=el('ability').value;if(!abilities.includes(key))return;const result=crossroadsAbilityCheck(Math.max(0,Math.min(100,data.character[key]+number('abilityModifier',-100,100))));data.log.push(tk('check',{name:tk(key),dice:result.dice.join('+'),result:tk(result.passed?'passed':'failed')}));}));
    el('cancel').addEventListener('click',()=>confirm('cancelConfirm',data=>{if(!active(data.fight))return;if(data.fight.rules.nonfatal)data.fight.hero.hp=data.fight.startingHp;data.fight.status='cancelled';data.fight.events=[];}));
    registerShortcut({button:trigger,overlay,open,close});
  }
  return {init,render,open,close,setVisible(value){if(el('btn'))el('btn').style.display=value?'':'none';if(!value){close();shownRun=null;}}};
}
