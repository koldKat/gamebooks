// Build encounter actions and local item/recovery controls from the current combat snapshot.
import {groundMaximumSpend, prepareGroundRound, advanceGroundFight, decideGroundReroll, leaveGroundFight} from './ground.js';
import {prepareSpaceRound, rollSpaceStations, rerollSpaceStation, spaceStationRerollAvailable, advanceSpaceFight, decideSpaceShieldReroll, finishSpaceFirefight, leaveSpaceFight} from './space.js';
import {coPilotAlive} from './injuries.js';
import {applyCombatItem, useCombatRecovery, useIyspEnergy} from './effects.js';
import {cancelTwoFistedFight, twoFistedFightActive} from './state.js';
import {twoFistedFields} from './panel-fields.js';

export function renderTwoFistedActions({document, root, id, state, change, getSupport, readPlayer, confirmCancel}) {
  root.replaceChildren();
  const ui = twoFistedFields(document, id, id + '-action'), fight = state.fight, active = twoFistedFightActive(fight);
  const support = getSupport();
  function updateFight(transform) {change(next => {next.fight = transform(next.fight); return next;});}
  function groundActions(ground, embedded) {
    const selectEnemy = (label, key) => {
      const input = ui.select(root, label, ground.opponents.flatMap((enemy, i) => enemy.health > 0 ? [[String(i), enemy.name || 'Opponent ' + (i + 1)]] : [])); input.id = id + '-' + key; return input;
    };
    function saveGround(transform) {
      updateFight(original => {
        const result = transform(embedded ? original.fireFight : original);
        if (!embedded) return result;
        if (twoFistedFightActive(result)) return {...original, fireFight: result};
        return finishSpaceFirefight(original, result);
      });
    }
    if (ground.pending) {
      ui.text(root, 'Right Stuff: accept the failed roll or reroll your FISTS without another ENERGY payment.');
      ui.button(root, 'Accept roll', () => saveGround(current => decideGroundReroll(current, false)), 'accept');
      ui.button(root, 'Use Right Stuff', () => saveGround(current => decideGroundReroll(current, true)), 'right-stuff'); return;
    }
    if (ground.roundAction) {
      ui.button(root, 'Resolve exchanges', () => saveGround(advanceGroundFight), 'continue'); return;
    }
    const heroAway = embedded && !fight.roundAction.heroFire;
    const spend = ui.number(root, 'ENERGY commitment', ground.player.nextAutomaticHeroWin || heroAway ? 0 : Math.min(5, groundMaximumSpend(ground.player, ground.mode, ground.round + 1)), 0, groundMaximumSpend(ground.player, ground.mode, ground.round + 1));
    spend.id = id + '-spend'; spend.disabled = Boolean(heroAway || ground.player.nextAutomaticHeroWin);
    const target = selectEnemy('Protagonist’s opponent', 'target'); target.disabled = Boolean(heroAway);
    const hasCrew = coPilotAlive(ground.player.copilot), low = hasCrew && !embedded ? ui.check(root, 'Co-pilot lays low') : null;
    const crewTarget = hasCrew ? selectEnemy('Co-pilot’s opponent', 'copilot-target') : null;
    if (crewTarget && ground.opponents.filter(enemy => enemy.health > 0).length > 1 && !heroAway) crewTarget.value = [...crewTarget.options].find(option => option.value !== target.value)?.value ?? target.value;
    const gocky = hasCrew && ground.player.copilot.trait === 'gocky' && !ground.player.copilot.crippled && ground.mode === 'melee';
    const second = gocky ? ui.select(root, 'Gocky’s second opponent', [['', 'None'], ...ground.opponents.flatMap((enemy, i) => enemy.health > 0 ? [[String(i), enemy.name || 'Opponent ' + (i + 1)]] : [])]) : null;
    const pet = ground.player.trobble && !ground.player.trobble.inactive && !ground.player.trobble.discarded ? selectEnemy('Trobble’s opponent', 'trobble-target') : null;
    if (pet) pet.value = [...pet.options].find(option => option.value !== target.value && option.value !== crewTarget?.value)?.value ?? target.value;
    ui.button(root, 'Resolve round', () => saveGround(current => advanceGroundFight(prepareGroundRound(current, {
      spend: ui.numeric(spend), target: Number(target.value), copilotLow: low?.checked ?? false, heroAway,
      copilotTargets: crewTarget ? [Number(crewTarget.value), ...(second?.value ? [Number(second.value)] : [])] : [],
      ...(pet ? {trobbleTarget: Number(pet.value)} : {}),
    }))), 'round');
  }
  function spaceActions() {
    if (fight.status === 'firefighting') {ui.text(root, 'Resolve one round against the cockpit fire.'); groundActions(fight.fireFight, true); return;}
    if (fight.pending) {
      ui.text(root, 'The shield check failed. Right Stuff can reroll it once.');
      ui.button(root, 'Accept shield check', () => updateFight(current => decideSpaceShieldReroll(current, false)), 'accept');
      ui.button(root, 'Use Right Stuff', () => updateFight(current => decideSpaceShieldReroll(current, true)), 'right-stuff'); return;
    }
    if (fight.stage === 'allocated') {ui.button(root, 'Roll stations', () => updateFight(rollSpaceStations), 'stations'); return;}
    if (fight.stage === 'rolled') {
      for (const role of ['weapons', 'manoeuvre', 'shields']) if (spaceStationRerollAvailable(fight, role)) ui.button(root, 'Right Stuff: ' + role, () => updateFight(current => rerollSpaceStation(current, role)), 'reroll-' + role);
      ui.button(root, 'Resolve volleys', () => updateFight(advanceSpaceFight), 'volley'); return;
    }
    if (fight.stage === 'volley') {ui.button(root, 'Continue volleys', () => updateFight(advanceSpaceFight), 'volley'); return;}
    const target = ui.select(root, 'Target ship', fight.opponents.flatMap((enemy, i) => enemy.hull > 0 ? [[String(i), enemy.name || 'Ship ' + (i + 1)]] : [])); target.id = id + '-target';
    const points = {}, fists = {};
    for (const role of ['weapons', 'manoeuvre', 'shields']) {
      points[role] = ui.number(root, role.toUpperCase() + ' allocation', 0, 0, fight.player.expertise);
      fists[role] = ui.number(root, role.toUpperCase() + ' FISTS', 0, 0, 20);
    }
    const station = ui.select(root, 'Co-pilot station', [['', 'None'], ...(coPilotAlive(fight.player.copilot) ? ['weapons', 'manoeuvre', 'shields'].filter(role => fight.player.copilot[role] > 0).map(role => [role, role]) : [])]);
    const low = ui.check(root, 'Co-pilot lays low');
    const fire = fight.fires.length ? ui.select(root, 'Cockpit fire', [['ignore', 'Ignore fire'], ['hero', 'Protagonist fights fire'], ...(coPilotAlive(fight.player.copilot) ? [['copilot', 'Co-pilot fights fire'], ['both', 'Both fight fire']] : [])]) : null;
    ui.text(root, 'Assign your EXPERTISE and FISTS among stations. A co-pilot operates their station alone. Firefighters cannot operate stations.');
    ui.button(root, 'Allocate round', () => updateFight(current => prepareSpaceRound(current, {
      target: Number(target.value), points: Object.fromEntries(Object.entries(points).map(([key, input]) => [key, ui.numeric(input)])),
      fists: Object.fromEntries(Object.entries(fists).map(([key, input]) => [key, ui.numeric(input)])), copilotStation: station.value || null, copilotLow: low.checked, fireFighter: fire?.value,
    })), 'allocate');
  }
  if (active) {
    if (fight.mode === 'space') spaceActions(); else groundActions(fight, false);
    for (const [reason, key, label] of [['surrender', 'surrenderTarget', 'Surrender'], ['escape', 'retreatTarget', 'Escape']]) {
      if (!fight.encounter[key] || reason === 'surrender' && fight.encounter.noSurrenderAfterKill && fight.opponents.some(enemy => !(fight.mode === 'space' ? enemy.hull : enemy.health))) continue;
      ui.button(root, label, () => updateFight(current => (current.mode === 'space' ? leaveSpaceFight : leaveGroundFight)(current, reason)), reason);
    }
    ui.button(root, 'Cancel encounter', () => confirmCancel(() => updateFight(cancelTwoFistedFight)), 'cancel');
  }
  const boundary = !active || fight.status === 'fighting' && !fight.pending && !fight.roundAction && (fight.mode === 'space' ? fight.stage === 'ready' : !fight.queue.length);
  if (!boundary) return;
  const player = active ? fight.player : state.player;
  if (!player) return;
  const items = support.items.filter(item => ['activate', 'ship-action'].includes(item.combat?.kind) && (player.inventory?.[item.id] ?? 0) > 0
    && (!item.combat.modes || active && item.combat.modes.includes(fight.mode)) && !(active && item.combat.outsideOnly));
  if (items.length) {
    const holder = ui.details(root, active ? 'Use combat item' : 'Combat recovery and preparation');
    const item = ui.select(holder, 'Item', items.map(item => [item.id, item.name])); item.id = id + '-item';
    const description = ui.text(holder, '');
    function describe() {description.textContent = items.find(row => row.id === item.value).effectText;}
    item.addEventListener('change', describe); describe();
    const user = ui.select(holder, 'Used by', [['hero', 'Protagonist'], ...(coPilotAlive(player.copilot) ? [['copilot', 'Co-pilot']] : [])]);
    const recipient = ui.select(holder, 'Recovery recipient', [['hero', 'Protagonist'], ...(coPilotAlive(player.copilot) ? [['copilot', 'Co-pilot']] : [])]);
    const repair = ui.select(holder, 'Hull Repair Kit', [['ship', 'Repair ship'], ['copilot', 'Repair Horizon-8']]);
    const target = active ? ui.select(holder, 'Opponent', fight.opponents.flatMap((enemy, i) => (fight.mode === 'space' ? enemy.hull : enemy.health) > 0 ? [[String(i), enemy.name || 'Opponent ' + (i + 1)]] : [])) : null;
    ui.button(holder, 'Use item', () => change(next => {
      const options = {who: recipient.value, user: user.value, repair: repair.value, ...(target ? {target: Number(target.value)} : {})};
      if (active) next.fight = applyCombatItem(next.fight, item.value, options, support);
      else next.player = useCombatRecovery(readPlayer(next.player), item.value, options, support);
      return next;
    }), 'use-item');
  }
  if (active && player.copilot?.trait === 'iysp' && coPilotAlive(player.copilot)) ui.button(root, 'Iysp: take one injury for 10 ENERGY', () => updateFight(useIyspEnergy), 'iysp');
}
