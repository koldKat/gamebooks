// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function character(d) {
return d.fight?.player??d.player;}

function active(d) {
return Boolean(d.fight&&!d.fight.outcome);}

function append(d,message) {
d.log.push(message);d.log=d.log.slice(-150);}

function record(d) {
  const { tk } = getContext();

  const f=d.fight;
  if (!f||f.recorded||!['win','loss'].includes(f.outcome)) return;
  f.recorded=true;
  d.history.push({enemy:`${[...new Set(f.encounter.enemies)].join(', ')} (${tk('section',{section:f.encounter.section})})`,outcome:f.outcome,
    ts:Math.max(Date.now(),(d.history.at(-1)?.ts??0)+1)});
}

function store(d) {
  const { record, renderSim535, saveState } = getContext();
record(d);saveState();renderSim535();}

function start() {
  const { FIRE_WOLF_ATTRIBUTES, active, append, character, createCryptsFight, createCryptsMagicSection, data, el, prepareCryptsEncounter, showAlert, store, tk } = getContext();

  const d=data();if (!d||active(d)||character(d).lifePoints<=0) return;
  try {
    const manual=Object.fromEntries([...FIRE_WOLF_ATTRIBUTES,'skill','lifePoints','power'].map(key=>
      [key,el(`manual-${key}`).value===''?null:Number(el(`manual-${key}`).value)]));
    const prepared=prepareCryptsEncounter(el('encounter').value,character(d),{...d.nextOptions,manual});
    d.fight=createCryptsFight(prepared);
    if (d.magic?.section!==String(prepared.encounter.section)) {
      d.magic=createCryptsMagicSection(prepared.encounter.section,d.fight.player,d.fight.enemies);
      d.fight.player.magicArmour=0;delete d.fight.player.magicFear;
    }
    d.fight.player.magicArmour=d.magic.armour;
    d.player={...d.fight.player};
    append(d,tk('section',{section:prepared.encounter.section}));store(d);
  } catch {showAlert(tk('invalid'));}
}

function target() {
  const { el } = getContext();
return Number(el('target').value);}

function resultLog(d,result) {
  const { append, showAlert, tk } = getContext();

  if (result?.error) {showAlert(tk(`error.${result.error}`));return;}
  if (result?.kind==='attack') append(d,tk('attack_log',{...result,side:tk(result.side)}));
  else append(d,tk('result',{result:typeof result==='boolean'?tk(result?'success':'failure'):result?.damage??result?.kind??''}));
}

function act(action) {
  const { advanceCryptsRound, applyCryptsWightHit, data, el, resolveCryptsDeathLuck, resolveFireWolfInitiative, resultLog, rollCryptsAttack, store, target, tryCryptsOrb, useCryptsRosewoodBox, useCryptsWand } = getContext();

  const d=data(),f=d?.fight;if (!f||f.outcome) return;
  let result;
  if (action==='death_luck') result=resolveCryptsDeathLuck(f);
  else if (f.pending) return;
  else if (action==='initiative') result=resolveFireWolfInitiative(f);
  else if (action==='player_attack'||action==='enemy_attack') result=rollCryptsAttack(f,action==='player_attack'?'player':'enemy',target());
  else if (action==='end_round') result=advanceCryptsRound(f);
  else if (action==='box') result=useCryptsRosewoodBox(f);
  else if (action==='orb_test') result=tryCryptsOrb(f);
  else if (action==='wand') result=useCryptsWand(f,target());
  else if (action==='wight_hit') {
    const value=el('wight-damage').value;
    if (value==='') return;
    result=applyCryptsWightHit(f,Number(value));
  }
  if (result===null||result===undefined) return;
  resultLog(d,result);store(d);
}






// END EXTRACTED RULES
  return { character, active, append, record, store, start, target, resultLog, act };
}
