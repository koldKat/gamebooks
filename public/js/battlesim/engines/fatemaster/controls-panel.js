// Present only the available Fatemaster combat action or saved pending choice.
import {assignFatemasterDamage,attackFatemaster,disengageFatemaster,equipFatemasterWeapon,finishFatemasterHelplessOpponent,resolveFatemasterCheck,resolveFatemasterEnemy,resolveFatemasterHostileDamage,resolveFatemasterHostileSave,resumeFatemasterFight,withdrawFatemaster} from './battle.js';
import {allocateFatemasterSpell,castFatemaster,resolveFatemasterSpell,resolveFatemasterSpellDice,resolveFatemasterSpellSave} from './spells.js';
import {conscious} from './rules.js';
import {button,checkbox,dice,number,numeric,select,text} from './form.js';

export function renderFatemasterControls({document,holder,id,t,fight,dispatch}) {
  holder.replaceChildren();if(!fight)return;
  const tr=(key,params)=>t('battlesim.fatemaster.'+key,params);
  const act=(label,change,key)=>button(document,holder,tr(label),()=>dispatch(change),id+'-'+key);
  if(fight.status==='paused'){
    text(document,holder,tr(fight.pauseReason==='opponent-threshold'?'threshold_pause':'reader_pause'));
    if(fight.pauseReason!=='opponent-threshold')act('resume',resumeFatemasterFight,'resume');
    return;
  }
  if(fight.status!=='fighting')return;
  const pending=fight.pending;
  if(pending?.kind==='damage'){
    text(document,holder,tr('choose_damage',{amount:pending.amount}));
    for(const pool of ['strength','agility']){
      const b=act(pool,f=>assignFatemasterDamage(f,pool),'damage-'+pool);b.disabled=Boolean(pending.pool&&pending.pool!==pool);
    }
    return;
  }
  if(pending?.kind==='spell-allocation'){
    text(document,holder,tr('allocate',{budget:pending.budget}));
    const selected=new Set(pending.selection??[]);
    for(const enemyId of pending.eligible){
      const e=fight.opponents.find(e=>e.id===enemyId);
      const input=checkbox(document,holder,e.name+' · '+e.agility,selected.has(enemyId));
      input.addEventListener('change',()=>dispatch(f=>{
        const ids=new Set(f.pending.selection??[]);if(input.checked)ids.add(enemyId);else ids.delete(enemyId);
        f.pending.selection=[...ids];return f;
      }));
    }
    act('apply_allocation',f=>allocateFatemasterSpell(f,f.pending.selection??[]),'allocate');return;
  }
  if(pending?.kind==='spell-resolve'){act('resolve_spell',resolveFatemasterSpell,'resolve');return;}
  if(pending){
    const actions={enemy:resolveFatemasterEnemy,check:resolveFatemasterCheck,'hostile-save':resolveFatemasterHostileSave,
      'hostile-damage':resolveFatemasterHostileDamage,'spell-dice':resolveFatemasterSpellDice,'spell-save':resolveFatemasterSpellSave};
    const count=pending.kind==='spell-save'||pending.kind==='hostile-save'?1:pending.dice??2;
    text(document,holder,tr('pending.'+(pending.check??pending.kind)));
    const input=number(document,holder,tr('dice',{count}),'',count,count*6);input.id=id+'-dice';
    act('resolve',f=>actions[pending.kind](f,dice(input,count)),'resolve');return;
  }
  const targets=fight.opponents.filter(conscious);
  const target=select(document,holder,tr('target'),targets.map(e=>({value:e.id,label:e.name+' · '+e.strength+'/'+e.agility})));target.id=id+'-target';
  const roll=number(document,holder,tr('dice',{count:2}),'',2,12);roll.id=id+'-dice';
  const attack=act('attack',f=>{
    const e=f.opponents.find(e=>e.id===target.value);
    return ['asleep','helpless'].includes(e.condition)?finishFatemasterHelplessOpponent(f,e.id):attackFatemaster(f,e.id,dice(roll,2));
  },'attack');
  const refreshTarget=()=>{const e=targets.find(e=>e.id===target.value),helpless=['asleep','helpless'].includes(e?.condition);attack.textContent=tr(helpless?'finish_helpless':'attack');roll.disabled=helpless;};
  target.addEventListener('change',refreshTarget);refreshTarget();
  if(fight.rules.escape)act('flee',withdrawFatemaster,'flee');
  for(const option of fight.rules.escapeOptions??[])act('escape.'+option.key,f=>withdrawFatemaster(f,option.key),'flee-'+option.key);
  if(targets.every(e=>e.condition==='repelled'||fight.rules.ignoreInvisible&&fight.invisibleTo.includes(e.id)))act('disengage',disengageFatemaster,'disengage');
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=tr('spells');details.appendChild(summary);holder.appendChild(details);
  const spell=select(document,details,tr('spell'),['healing','invisibility','footsteps','bolt','slumber','repel','light'].map(value=>({value,label:tr('spell.'+value)})));
  const source=select(document,details,tr('spell_source'),[{value:'power',label:tr('power')},{value:'scroll',label:tr('scroll')}]);
  const power=select(document,details,tr('bolt_power'),[1,2,3],1);
  const pool=select(document,details,tr('healing_pool'),['strength','agility'].map(value=>({value,label:tr(value)})));
  const footsteps=select(document,details,tr('footsteps_action'),[{value:'escape',label:tr('flee')},...(fight.rules.footstepsAutomaticHit?[{value:'hit',label:tr('automatic_hit')}]:[])]);
  button(document,details,tr('cast'),()=>dispatch(f=>castFatemaster(f,spell.value,{source:source.value,power:Number(power.value),pool:pool.value,action:footsteps.value,targetId:target.value})),id+'-cast');
  spell.id=id+'-spell';source.id=id+'-spell-source';power.id=id+'-spell-power';pool.id=id+'-healing-pool';
  const equipment=document.createElement('details'),title=document.createElement('summary');title.textContent=tr('change_weapon');equipment.appendChild(title);holder.appendChild(equipment);
  const damage=number(document,equipment,tr('damage'),fight.player.damage,1),modifier=number(document,equipment,tr('weapon_attack'),fight.player.weaponAttack,-100,100);
  const kind=select(document,equipment,tr('weapon_kind'),['normal','silver','magic'].map(value=>({value,label:tr(value)})),fight.player.weaponKind);
  button(document,equipment,tr('equip'),()=>dispatch(f=>equipFatemasterWeapon(f,{damage:numeric(damage),weaponAttack:numeric(modifier),weaponKind:kind.value})),id+'-equip');
}
