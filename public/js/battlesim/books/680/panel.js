import { currentBookId, currentPlaythrough, saveState } from "../../../core/state.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { showAlert, showConfirm } from "../../../ui-helpers/confirm.js";
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { createFabledPanel } from "../.././engines/fabled-lands/panel.js";
import { FABLED_ABILITIES } from "../.././engines/fabled-lands/character.js";
import { SERPENT_FIGHTS, SERPENT_SEA_CHECKS, SERPENT_RULES, newSerpentCharacter, validateSerpentCharacter,
  serpentDefence, serpentAbilityCheck, startSerpentFight, serpentRound, resolveSerpentAction,
  fleeSerpentFight, cancelSerpentFight, serpentSeaCheck, burnedHordeCheck, javelinSnakesCheck }
  from "../.././engines/fabled-lands/serpent-domain.js";

const sectionsFor = special => SERPENT_FIGHTS.filter(f=>f.special===special).map(f=>f.section);
const hazardRules = SERPENT_RULES.hazards;

function extendPanel({el,tk,button,checkbox,select,action,report,overlay,render:refresh}) {
  el('luckReroll').closest('label').insertAdjacentHTML('afterend', select('clarityUse',['','player','enemy']));
  el('abilityRoll').insertAdjacentHTML('beforebegin', checkbox('spiritualCheck')+checkbox('spiritWeaponCheck'));
  el('step').parentElement.insertAdjacentHTML('afterend',
    `<div id="sim680-pending" class="bsim-status"><p id="sim680-pendingNote"></p>`
    +select('escapeAbility',SERPENT_RULES.grimEscape.abilities)+checkbox('escapeLuck')
    +`<div class="bsim-btn-row">${button('resolveAction')}${button('escapeAction')}</div></div>`);
  const hazards=document.createElement('details');
  hazards.innerHTML=`<summary>${tk('hazards')}</summary>${select('hazard',[String(hazardRules.snakes.section),String(hazardRules.horde.section)])}`
    +checkbox('hazardEntry')+checkbox('hazardObfuscation')+checkbox('hazardLuck')+button('hazardRoll');
  overlay.querySelector('.bsim-col-left').appendChild(hazards);
  el('seaRoll').insertAdjacentHTML('beforebegin',checkbox('emptyCargo'));
  el('characterStatus').insertAdjacentHTML('afterend','<div class="bsim-status" id="sim680-spiritStatus"></div>');
  for (const key of ['hazard','seaContext']) el(key).addEventListener('change',refresh);
  const resolve = escape => action(game => report(game,resolveSerpentAction(game.fight,
    {escape,ability:el('escapeAbility').value,luckReroll:el('escapeLuck').checked}),game.fight.events.length));
  el('resolveAction').addEventListener('click',()=>resolve(false));
  el('escapeAction').addEventListener('click',()=>resolve(true));
  el('hazardRoll').addEventListener('click',()=>action(game=>{
    if (game.fight?.status==='fighting'||!game.character?.stamina) return;
    const result=el('hazard').value===String(hazardRules.snakes.section)
      ?javelinSnakesCheck(game.character,{obfuscationUse:el('hazardObfuscation').checked,luckReroll:el('hazardLuck').checked})
      :burnedHordeCheck(game.character,{applyEntry:el('hazardEntry').checked});
    game.fight=null;game.character=result.character;
    game.log.push(tk('hazardResult',{total:result.total??'-',damage:result.damage}));
    if (result.destination) game.log.push(tk('destination',{section:result.destination}));
    else game.log.push(tk('hordeContinue'));
    // Entry damage belongs to arriving at the horde, not each retry.
    el('hazardEntry').checked=false;
  }));
  return {
    roundOptions:()=>({clarity:el('clarityUse').value||null}),
    abilityOptions:()=>({spiritual:el('spiritualCheck').checked,spiritWeapon:el('spiritWeaponCheck').checked}),
    seaOptions:()=>({emptyCargo:el('emptyCargo').checked}),
    eventMessage:event=>['obfuscation','clarity','negatedHit','enemyHealing','sorcery','blowgun',
      'forcedEscape','nyarTactic','poison','combatPenalty'].includes(event.kind)?tk('event.'+event.kind,event):null,
    render(game,{busy,blocked}) {
      const c=game.character,fight=game.fight,pending=busy&&fight.pendingAction;
      el('step').disabled ||= !!pending;
      el('flee').disabled=!!pending||!!c?.frenziedMight;
      el('clarityUse').disabled=!busy||!fight.config.spiritual||!c?.clarity||!!pending;
      if (el('clarityUse').disabled) el('clarityUse').value='';
      el('pending').hidden=!pending;
      el('pendingNote').textContent=pending?tk('pending.'+pending):'';
      el('escapeAction').hidden=pending!=='grimEscape';
      el('escapeAction').disabled=!!c?.frenziedMight;
      el('escapeAbility').closest('label').hidden=pending!=='grimEscape';
      el('escapeLuck-row').hidden=pending!=='grimEscape';
      el('escapeLuck').disabled=!c?.luckBlessing;
      if (!c?.luckBlessing) el('escapeLuck').checked=false;
      el('spiritStatus').textContent=c?tk('spiritStatus',{nahual:c.nahual,defence:serpentDefence(c,true)}):'';
      el('obfuscationUse').disabled=blocked||!c?.obfuscation;
      if (el('obfuscationUse').disabled) el('obfuscationUse').checked=false;
      if (fight?.config.spiritual) el('status').textContent=[tk('status.'+fight.status),tk('rounds',{count:fight.rounds}),
        ...fight.enemies.map(foe=>`${tk('enemy.'+foe.name)}: ${tk('nahual')} ${foe.combat}, ${tk('defence')} ${foe.defence}, ${tk('stamina')} ${foe.stamina}`),
        ...(fight.destination?[tk('destination',{section:fight.destination})]:[])].join('\n');
      for (const key of ['hazardRoll','hazard','hazardEntry','hazardObfuscation','hazardLuck'])
        el(key).disabled=blocked||!c?.stamina;
      el('hazardObfuscation').disabled ||= !c?.obfuscation;
      el('hazardLuck').disabled ||= !c?.luckBlessing;
      if (el('hazardObfuscation').disabled) el('hazardObfuscation').checked=false;
      if (el('hazardLuck').disabled) el('hazardLuck').checked=false;
      el('hazardEntry-row').hidden=el('hazard').value!==String(hazardRules.horde.section);
      el('hazardObfuscation-row').hidden=el('hazard').value!==String(hazardRules.snakes.section);
      el('hazardLuck-row').hidden=el('hazard').value!==String(hazardRules.snakes.section);
      for (const key of ['spiritualCheck','spiritWeaponCheck']) el(key).disabled=blocked||!c?.stamina;
      el('safetyFromStorms').disabled ||= SERPENT_SEA_CHECKS[el('seaContext').value]?.kind!=='storm';
      if (el('safetyFromStorms').disabled) el('safetyFromStorms').checked=false;
    },
  };
}

const panel=createFabledPanel({document,t,getRun:currentPlaythrough,
  getBookId:()=>currentBookId,saveState,showAlert,showConfirm,getButtonRow:getPlayBtnRow,
  bookId:680,fights:SERPENT_FIGHTS,seaChecks:SERPENT_SEA_CHECKS,seaCheck:serpentSeaCheck,
  createCharacter:newSerpentCharacter,validateCharacter:validateSerpentCharacter,
  opponentStatUnavailable:(_key,enemy)=>enemy.dynamic==='mirror',
  characterDefence:serpentDefence,abilityCheck:serpentAbilityCheck,
  startFight:startSerpentFight,roundFight:serpentRound,fleeFight:fleeSerpentFight,cancelFight:cancelSerpentFight,
  extraFields:[...FABLED_ABILITIES.map(ability=>({key:'base'+ability[0].toUpperCase()+ability.slice(1),min:1,max:12})),
    ...['nahual','spiritualWeapon','spiritualCombatBonus','spiritualArmour','heatArmour','metalArmour'].map(key=>({key,min:0,max:1000}))],
  extraFlags:['obfuscation','clarity','diseaseBlessing','periapt','guise','frenziedMight','crazedVim','shimasCurse','pacharaCirclet'],
  encounterOptions:[
    {key:'mentalPenalty',type:'checkbox',sections:sectionsFor('grimEscape')},
    {key:'soldierAmbush',type:'checkbox',sections:sectionsFor('soldiers')},
    {key:'obfuscationUse',type:'checkbox',sections:SERPENT_FIGHTS.map(f=>f.section)},
    {key:'flintKnife',type:'checkbox',sections:sectionsFor('lightning')},
    {key:'goldenWeapon',type:'checkbox',sections:sectionsFor('goldenWeapon')},
    {key:'nyarDisarmed',type:'checkbox',sections:sectionsFor('nyarContinuation')},
    {key:'nyarNut',type:'checkbox',sections:sectionsFor('nyarContinuation')},
    {key:'enemyDamage',min:0,max:SERPENT_FIGHTS.find(f=>f.special==='nyarContinuation').enemies[0].stamina-1,sections:sectionsFor('nyarContinuation')},
  ],extendPanel,
  registerShortcut({button,overlay,open,close}) {
    button.innerHTML=shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  },
});
export function initSim680() {panel.init();}
export function renderSim680() {panel.render();}
export function setSim680Visible(visible) {panel.setVisible(visible);}

export { initSim680 as init, renderSim680 as render, setSim680Visible as setVisible };
