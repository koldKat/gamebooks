// Edit the current player and autocomplete-backed opponents before a Fatemaster encounter.
import {createOpponentEditor} from '../../opponents.js';
import {expandFatemasterGroups,prepareFatemasterEncounter} from './catalog.js';
import {enemyAttack,enemyDefence} from './rules.js';
import {checkbox,number,numeric,select,text} from './form.js';

export function createFatemasterSetup({document,holder,id,t,getRoster,getPlayerDefaults}) {
  const tr=key=>t('battlesim.fatemaster.'+key);
  let inputs={},checks={},editor,preset,expected=[],counter,initiative,weapon,disarmChoice,furyMode;
  function mount(state,entry) {
    holder.replaceChildren();inputs={};checks={};preset=entry;
    const defaults=getPlayerDefaults(),fight=state.fight,locked=['fighting','paused'].includes(fight?.status);
    const player=locked?fight.player:state.player??defaults.player;
    const config=entry?(entry.rules.response==='miss-bolt'?structuredClone(entry):prepareFatemasterEncounter(entry,{variant:state.variant||entry.variants?.[0]?.key})):null;
    text(document,holder,tr('current_player'),'h4');
    const labels={strength:'strength',agility:'agility',power:'power',maxStrength:'strength_score',maxAgility:'agility_score',maxPower:'power_score',damage:'damage',attackModifier:'attack_adjustment',weaponAttack:'weapon_attack',defenceModifier:'defence_adjustment'};
    for(const [key,label]of Object.entries(labels)){
      const min=key.includes('Modifier')||key==='weaponAttack'?-100:key==='power'||key==='maxPower'?0:1;
      inputs[key]=number(document,holder,tr(label),player[key]??0,min);inputs[key].id=id+'-player-'+key;
    }
    weapon=select(document,holder,tr('weapon'),[{value:'',label:tr('manual_gear')},...defaults.weapons.map(w=>({value:w.key,label:w.name}))]);
    weapon.addEventListener('change',()=>{const chosen=defaults.weapons.find(w=>w.key===weapon.value);if(chosen)inputs.damage.value=chosen.damage;});
    inputs.weaponKind=select(document,holder,tr('weapon_kind'),['normal','silver','magic'].map(value=>({value,label:tr(value)})),player.weaponKind);
    checks.renewPower=checkbox(document,holder,tr('renewal_ring'),player.renewPower);
    checks.healing=checkbox(document,holder,tr('healing_scroll'),player.scrolls?.healing===1);
    checks.invisibility=checkbox(document,holder,tr('invisibility_scroll'),player.scrolls?.invisibility===1);
    checks.invisible=checkbox(document,holder,tr('already_invisible'),locked&&fight.invisibleTo.length>0);
    checks.unseen=checkbox(document,holder,tr('not_seen'),Boolean(locked?fight.rules.unseen:false));
    checks.opening=checkbox(document,holder,tr('opening_applied'),locked||false);checks.opening.closest('label').hidden=!(config?.rules.openingDamage||config?.rules.openingAutomaticHit);
    checks.sleeping=checkbox(document,holder,tr('opponent_sleeping'),locked&&fight.opponents.some(e=>e.condition==='dormant'));
    checks.sleeping.closest('label').hidden=!config?.rules.sleepingAllowed;
    checks.roofOpen=checkbox(document,holder,tr('roof_open'),Boolean(locked?fight.rules.roofOpen:config?.rules.roofOpen));
    checks.roofOpen.closest('label').hidden=!config?.rules.flyfeetDamage;
    initiative=select(document,holder,tr('initiative'),[{value:'player',label:tr('player_first')},{value:'enemy',label:tr('enemy_first')}],config?.rules.initiative??'player');
    initiative.dataset.fixed=String(Boolean(config?.rules.initiative));
    counter=select(document,holder,tr('counter_bolt_dice'),[{value:'',label:tr('choose_dice')},1,2,3],locked?fight.rules.counterBoltDice??'':'');
    counter.closest('label').hidden=config?.rules.response!=='miss-bolt';counter.id=id+'-counter-dice';
    if(config?.rules.response==='miss-bolt')text(document,holder,tr('counter_bolt_note'));
    disarmChoice=select(document,holder,tr('disarm_interpretation'),[{value:'',label:tr('choose_interpretation')},...['raw-hit','raw-special','score-hit'].map(value=>({value,label:tr('disarm.'+value)}))],
      locked&&fight.rules.disarm?(fight.rules.disarm.basis==='score'?'score-hit':fight.rules.disarm.requiresHit?'raw-hit':'raw-special'):'');
    disarmChoice.closest('label').hidden=!config?.rules.disarm;
    disarmChoice.id=id+'-disarm-interpretation';
    furyMode=select(document,holder,tr('fury_interpretation'),[{value:'',label:tr('choose_interpretation')},...['once','per-cast'].map(value=>({value,label:tr('fury.'+value)}))],locked?fight.rules.survivingCastBonusMode??'':'');
    furyMode.closest('label').hidden=!config?.rules.survivingCastBonusMode;
    furyMode.id=id+'-fury-mode';
    checks.roofOpen.id=id+'-roof-open';
    checks.opening.id=id+'-opening-applied';
    const keys=['strength','agility','attackBonus','defenceBonus','damage','power'];
    const fields=keys.map(key=>({key,label:tr({attackBonus:'attack_bonus',defenceBonus:'defence_bonus'}[key]??key),min:key.includes('Bonus')?-100:key==='strength'||key==='agility'?1:0,max:10000}));
    const suggestions=getRoster().flatMap(e=>expandFatemasterGroups(e.groups));
    editor=createOpponentEditor({document,id,t,fields,presets:suggestions});holder.appendChild(editor.element);
    expected=config?expandFatemasterGroups(config.groups):[];
    const opponents=locked?fight.opponents.map(e=>({...e,attackBonus:enemyAttack(e),defenceBonus:enemyDefence(e)}))
      :config?expected:state.custom?.length?state.custom:[defaults.customEnemy];
    editor.set(opponents);editor.fixCount(Boolean(config));lock(locked);
  }
  function read() {
    const player=Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,key==='weaponKind'?input.value:numeric(input)]));
    player.name=getPlayerDefaults().player.name;player.renewPower=checks.renewPower.checked;
    player.scrolls={healing:Number(checks.healing.checked),invisibility:Number(checks.invisibility.checked)};
    let config=preset?prepareFatemasterEncounter(preset,{variant:holder.dataset.variant||preset.variants?.[0]?.key,counterBoltDice:counter.value===''?undefined:Number(counter.value),disarmInterpretation:disarmChoice.value,furyMode:furyMode.value})
      :{section:'custom',label:tr('custom'),rules:{}};
    const opponents=editor.read().map((e,index)=>({...e,name:e.displayName.trim()||e.name||tr('opponent'),maxStrength:e.strength,maxAgility:e.agility,maxPower:e.power,group:expected[index]?.group??String(index),
      ...(preset?{undead:expected[index]?.undead,invisibilityBonus:expected[index]?.invisibilityBonus}:{} )}));
    config.rules.unseen=checks.unseen.checked;
    return {player,opponents,config,options:{initiative:initiative.value,invisible:checks.invisible.checked,openingAlreadyApplied:checks.opening.checked,sleeping:checks.sleeping.checked,...(config.rules.flyfeetDamage?{roofOpen:checks.roofOpen.checked}:{})}};
  }
  function lock(value){for(const input of holder.querySelectorAll('input,select'))input.disabled=value||input.dataset.fixed==='true';editor?.lock(value);}
  return {mount(state,entry){holder.dataset.variant=state.variant??'';mount(state,entry);},read,lock};
}
