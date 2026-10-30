// Select a fleet's firing wing and advance its explicit formation phase.
import { fleetUnits } from './fleet-force.js';

const count = (force, type) => force.reduce((sum, unit) => sum + (unit.type === type ? unit.count : 0), 0);
const chart = value => {
  if (!/^[A-G]$/.test(value ?? '')) throw new RangeError('Choose a combat chart');
  return value;
};

export function startFleetTactics(force, previous) {
  const units = fleetUnits(force);
  return { round: 0, coneWing: 'battlecruiser', coneLeft: 0,
    specialUsed: previous?.specialUsed ?? false,
    battlecruiserFired: previous?.battlecruiserFired ?? false,
    initialBattlecruisers: previous?.initialBattlecruisers ?? count(units, 'battlecruiser') };
}

function phase(saved) {
  if (!saved || !Number.isSafeInteger(saved.round) || saved.round < 0
      || !Number.isSafeInteger(saved.coneLeft) || saved.coneLeft < 0 || saved.coneLeft > 5
      || !['battlecruiser', 'destroyer'].includes(saved.coneWing)
      || typeof saved.specialUsed !== 'boolean' || typeof saved.battlecruiserFired !== 'boolean'
      || !Number.isSafeInteger(saved.initialBattlecruisers) || saved.initialBattlecruisers < 0) {
    throw new RangeError('Invalid fleet formation phase');
  }
  return structuredClone(saved);
}

export function canLaunchFleetSpecial(force, config, saved) {
  const units = fleetUnits(force), state = phase(saved), special = config.specialAttack;
  if (!special || state.specialUsed || !count(units, 'destroyer') || !count(units, 'battlecruiser')) return false;
  if (special.maximumUses !== 1 || special.scope !== 'whole-battle' || special.volleys !== 2
      || !special.requiresSurvivingDestroyers) throw new RangeError('Invalid special attack');
  chart(special.chart);
  if (special.eligibility === 'battlecruisers-not-yet-fired') return !state.battlecruiserFired;
  if (special.eligibility === 'no-battlecruisers-lost') {
    return count(units, 'battlecruiser') === state.initialBattlecruisers;
  }
  throw new RangeError('Invalid special attack condition');
}

// Planning is pure: callers commit nextPhase only with the corresponding resolved exchange.
export function planFleetAttack(force, config, saved, { special = false, wing, blockRoll } = {}) {
  const units = fleetUnits(force), nextPhase = phase(saved);
  const living = type => count(units, type) > 0;
  let selected, selectedChart, volleys = 1;
  if (special) {
    if (!canLaunchFleetSpecial(units, config, saved)) throw new RangeError('Special attack is unavailable');
    selected = 'battlecruiser'; selectedChart = config.specialAttack.chart;
    volleys = config.specialAttack.volleys; nextPhase.specialUsed = true;
  } else if (config.playerChart) {
    selectedChart = chart(config.playerChart);
  } else {
    switch (config.firingOrder) {
      case 'destroyer-first-then-battlecruiser':
        selected = nextPhase.round === 0 && living('destroyer') ? 'destroyer' : 'battlecruiser';
        break;
      case 'battlecruiser-first-d6-blocks':
        if (!living('battlecruiser') || !living('destroyer')) {
          selected = living('battlecruiser') ? 'battlecruiser' : 'destroyer';
          nextPhase.coneWing = selected; nextPhase.coneLeft = 0;
        } else {
          selected = nextPhase.coneWing;
          if (!nextPhase.coneLeft) {
            if (!Number.isSafeInteger(blockRoll) || blockRoll < 1 || blockRoll > 6) {
              throw new RangeError('Roll one die for the firing-wing duration');
            }
            nextPhase.coneLeft = blockRoll;
          }
          nextPhase.coneLeft--;
          if (!nextPhase.coneLeft) nextPhase.coneWing = selected === 'battlecruiser' ? 'destroyer' : 'battlecruiser';
        }
        break;
      case 'battlecruiser-until-eliminated': selected = 'battlecruiser'; break;
      case 'destroyer-until-special-or-eliminated':
        selected = nextPhase.specialUsed ? 'battlecruiser' : 'destroyer';
        break;
      case 'battlecruiser-first-alternating':
        selected = nextPhase.round % 2 ? 'destroyer' : 'battlecruiser'; break;
      case 'destroyer-first-alternating':
        selected = nextPhase.round % 2 ? 'battlecruiser' : 'destroyer'; break;
      case 'each-sector-in-order':
        if (!['battlecruiser', 'destroyer'].includes(wing) || !living(wing)) {
          throw new RangeError('Choose the firing wing in this sector');
        }
        selected = wing; break;
      default: throw new RangeError('Choose a firing formation');
    }
    if (!living(selected)) selected = selected === 'battlecruiser' ? 'destroyer' : 'battlecruiser';
    selectedChart = chart(config.playerCharts?.[selected]);
  }
  const keys = units.filter(unit => unit.count && (selected ? unit.type === selected
    : !config.playerAllowedTypes || config.playerAllowedTypes.includes(unit.type))).map(unit => unit.key);
  if (!keys.length) throw new RangeError('No ships can fire');
  const casualtyKeys = config.casualtyPolicy === 'choose-wing'
    ? units.filter(unit => unit.count && ['battlecruiser', 'destroyer'].includes(unit.type)).map(unit => unit.key)
    : [...keys];
  let fallbackCasualtyKeys = [];
  if (config.casualtyFallbackWhenPrimaryEliminated) {
    if (config.casualtyFallbackWhenPrimaryEliminated !== true || !selected
        || !['battlecruiser-until-eliminated', 'destroyer-until-special-or-eliminated'].includes(config.firingOrder)) {
      throw new RangeError('Invalid casualty fallback rule');
    }
    fallbackCasualtyKeys = units.filter(unit => unit.count
      && unit.type === (selected === 'battlecruiser' ? 'destroyer' : 'battlecruiser')).map(unit => unit.key);
  }
  nextPhase.round++;
  if (selected === 'battlecruiser' || !selected && units.some(unit => keys.includes(unit.key) && unit.type === 'battlecruiser')) {
    nextPhase.battlecruiserFired = true;
  }
  return { wing: selected ?? null, chart: chart(selectedChart), volleys, keys, casualtyKeys, fallbackCasualtyKeys, nextPhase };
}
