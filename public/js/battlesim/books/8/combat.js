// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _rollDice(n) {

  const a = [];
  for (let i = 0; i < n; i++) a.push(1 + Math.floor(Math.random() * 6));
  return a;
}

function _calcDmg(dice) {

  return dice.reduce((s, d) => s + (d === 6 ? 2 : d >= 4 ? 1 : 0), 0);
}

function _diceHtml(dice) {
  const { _dieHtml } = getContext();

  return '[' + dice.map(_dieHtml).join(' ') + ']';
}

function _enemyName(d) {
 return d.enemy.name.trim() || 'врагът'; }

function _runRound() {
  const { AXE_DICE_BONUS, SVG_SKULL, SVG_TARGET, SVG_TROPHY, _appendLog, _calcDmg, _data, _diceHtml, _dmgHtml, _enemyName, _recordOutcome, _renderHistory, _renderInputs, _renderLog, _rollDice, escapeHtml, saveState, t } = getContext();

  const d = _data();
  if (!d || d.player.life <= 0 || d.enemy.life <= 0) return;

  const useAxe  = !!d.items?.axe;
  const aDice   = _rollDice(d.player.skill + (useAxe ? AXE_DICE_BONUS : 0));
  const eDice   = _rollDice(d.enemy.skill  + (useAxe ? AXE_DICE_BONUS : 0));

  let cmNote = '';
  if (d.items?.chainmail) {
    let worst = -1, wi = -1;
    for (let i = 0; i < eDice.length; i++) if (eDice[i] >= 4 && eDice[i] > worst) { worst = eDice[i]; wi = i; }
    if (wi >= 0) {
      const old = eDice[wi];
      eDice[wi] = 1 + Math.floor(Math.random() * 6);
      cmNote = t('battlesim8.log.chainmail_note', { old, new: eDice[wi] });
    }
  }

  const aDmg    = _calcDmg(aDice);
  const eDmg    = _calcDmg(eDice);
  const rn      = d.round++;
  const en      = escapeHtml(_enemyName(d));
  const axeNote = useAxe ? t('battlesim8.log.axe_note') : '';

  if (d.enemy.foeFirst) {
    // Enemy strikes first; sixWins only applies if the player survives
    d.player.life = Math.max(0, d.player.life - eDmg);
    if (d.player.life <= 0) {
      _appendLog(d, t('battlesim8.log.round_foefirst_dead', { rn, en, eDice: _diceHtml(eDice), axeNote, cmNote, eDmg: _dmgHtml(eDmg, 's8-dmg-enemy') }));
      _recordOutcome(d, 'loss');
    } else if (d.sixWins && aDice.includes(6)) {
      d.enemy.life = 0;
      _appendLog(d, t('battlesim8.log.round_foefirst_sixwin', { rn, en, eDice: _diceHtml(eDice), axeNote, cmNote, eDmg: _dmgHtml(eDmg, 's8-dmg-enemy'), aDice: _diceHtml(aDice), target: SVG_TARGET }));
      _recordOutcome(d, 'win');
    } else {
      d.enemy.life = Math.max(0, d.enemy.life - aDmg);
      const bar = t('battlesim8.log.hpbar', { playerLife: d.player.life, en, enemyLife: Math.max(0, d.enemy.life) });
      _appendLog(d, t('battlesim8.log.round_foefirst_normal', { rn, en, eDice: _diceHtml(eDice), axeNote, cmNote, eDmg: _dmgHtml(eDmg, 's8-dmg-enemy'), aDice: _diceHtml(aDice), aDmg: _dmgHtml(aDmg, 's8-dmg-player'), bar }));
      if (d.enemy.life <= 0) { _appendLog(d, t('battlesim8.log.enemy_defeated', { trophy: SVG_TROPHY, en })); _recordOutcome(d, 'win'); }
    }
  } else if (d.sixWins && aDice.includes(6)) {
    d.enemy.life = 0;
    _appendLog(d, t('battlesim8.log.round_sixwin', { rn, aDice: _diceHtml(aDice), axeNote, target: SVG_TARGET }));
    _recordOutcome(d, 'win');
  } else {
    d.enemy.life = Math.max(0, d.enemy.life - aDmg);
    if (d.enemy.life <= 0) {
      _appendLog(d, t('battlesim8.log.round_enemy_dead', { rn, aDice: _diceHtml(aDice), axeNote, aDmg: _dmgHtml(aDmg, 's8-dmg-player'), en }));
      _recordOutcome(d, 'win');
    } else {
      d.player.life = Math.max(0, d.player.life - eDmg);
      const bar = t('battlesim8.log.hpbar', { playerLife: d.player.life, en, enemyLife: Math.max(0, d.enemy.life) });
      _appendLog(d, t('battlesim8.log.round_normal', { rn, aDice: _diceHtml(aDice), axeNote, aDmg: _dmgHtml(aDmg, 's8-dmg-player'), en, eDice: _diceHtml(eDice), cmNote, eDmg: _dmgHtml(eDmg, 's8-dmg-enemy'), bar }));
      if (d.player.life <= 0) { _appendLog(d, t('battlesim8.log.player_dead', { skull: SVG_SKULL })); _recordOutcome(d, 'loss'); }
    }
  }

  saveState();
  _renderInputs();
  _renderLog();
  _renderHistory();
}

function _fireBow() {
  const { SVG_TROPHY, _appendLog, _calcDmg, _data, _diceHtml, _dmgHtml, _enemyName, _recordOutcome, _renderHistory, _renderInputs, _renderLog, _rollDice, escapeHtml, saveState, t } = getContext();

  const d = _data();
  if (!d || d.round !== 1 || d.bowFired || !d.items?.bow || !(d.items?.arrows > 0)) return;
  if (d.player.life <= 0 || d.enemy.life <= 0) return;

  const dice = _rollDice(1);
  const dmg  = _calcDmg(dice);
  const en   = escapeHtml(_enemyName(d));

  d.items.arrows--;
  d.bowFired   = true;
  d.enemy.life = Math.max(0, d.enemy.life - dmg);

  _appendLog(d, t('battlesim8.log.arrow', { dice: _diceHtml(dice), dmg: _dmgHtml(dmg, 's8-dmg-player'), en, enemyLife: d.enemy.life, arrows: d.items.arrows }));
  if (d.enemy.life <= 0) {
    _appendLog(d, t('battlesim8.log.arrow_kill', { trophy: SVG_TROPHY, en }));
    _recordOutcome(d, 'win');
  }

  saveState();
  _renderInputs();
  _renderLog();
  _renderHistory();
}

function _resetBattle() {
  const { _appendLog, _data, _renderHistory, _renderInputs, _renderLog, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.enemy.life  = d.enemy.lifeMax;
  d.player.life = d.player.lifeMax;
  d.round       = 1;
  d.bowFired    = false;
  if (d.log.length) _appendLog(d, t('battlesim8.log.reset_sep'));
  _appendLog(d, t('battlesim8.log.reset'));
  saveState();
  _renderInputs();
  _renderLog();
  _renderHistory();
}

// END EXTRACTED RULES
  return { _rollDice, _calcDmg, _diceHtml, _enemyName, _runRound, _fireBow, _resetBattle };
}
