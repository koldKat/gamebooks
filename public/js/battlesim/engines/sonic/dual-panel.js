import { createOpponentEditor } from '../../opponents.js';
import { dualHeroes, dualRings, dualHit, dualAbilityCheck, startDualFight, dualRound,
  dualChaosBurst, resolveDualChaos, dualChaosEncounter } from './dual.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy = value => structuredClone(value);
const active = state => state?.fight?.status === 'fighting';

export function createDualSonicPanel({ document, definition, getRoster, getPlayerDefaults, t,
  getRun, getBookId, saveState, getButtonRow, showAlert, showConfirm, registerShortcut = () => {} }) {
  const ID = definition.stateKey, el = key => document.getElementById(ID + '-' + key);
  const defaults = () => getPlayerDefaults(), heroIds = () => Object.keys(defaults().heroes);
  const selected = state => getRoster().find(entry => entry.section === state.encounter);
  let shownRun, shownPreset, editor;
  function data() {
    if (Number(getBookId()) !== definition.id) return null;
    const run = getRun();
    if (!run) return null;
    return run[ID] ??= { rulesVersion: 1, heroes: dualHeroes(defaults().heroes), hero: heroIds()[0],
      encounter: '', groups: {}, burst: null, targets: [], fight: null, custom: {}, log: [], history: [] };
  }
  function close() { el('overlay')?.classList.remove('active'); }
  function open() {
    if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    render(); el('overlay').classList.add('active');
  }
  function number(key) {
    const input = el(key), text = input.value.trim(), value = Number(text);
    if (!text || !Number.isSafeInteger(value) || value < Number(input.min) || value > Number(input.max)) throw new RangeError('Check ' + key);
    return value;
  }
  function readHero(state) {
    const old = state.heroes[state.hero], heroes = dualHeroes(state.heroes);
    heroes[state.hero] = { ...heroes[state.hero], lives: number('lives'), shield: el('shield').checked,
      abilities: Object.fromEntries(Object.keys(defaults().abilityNames).map(key => [key, number('ability-' + key)])) };
    return dualRings(heroes, state.hero, number('rings') - old.rings, defaults().rules.ringLifeThreshold);
  }
  function group(state) { return selected(state)?.helpers?.group; }
  function ensureGroup(state) {
    const entry = selected(state), key = group(state);
    if (key && !state.groups[key]) state.groups[key] = Array.from({length:entry.helpers.defaultCount}, (_,i) => ({ name: defaults().helperLabel + ' ' + (i + 1), suit:false }));
  }
  function readHelpers(state) {
    const key = group(state);
    if (!key) return [];
    const previous = state.groups[key] ?? [], count = number('helperCount');
    const helpers = Array.from({length:count}, (_,i) => ({ ...previous[i], name: previous[i]?.name ?? defaults().helperLabel + ' ' + (i + 1),
      suit: el('helper-suit-' + i)?.checked ?? previous[i]?.suit ?? false }));
    state.groups[key] = helpers;
    return helpers;
  }
  function action(update) {
    const run = getRun();
    if (run !== shownRun || Number(getBookId()) !== definition.id) return;
    const original = data();
    if (!original || original.rulesVersion !== 1) return;
    try {
      const state = copy(original); update(state);
      if (getRun() !== run || Number(getBookId()) !== definition.id) return;
      const fight = state.fight;
      if (fight && !fight.recorded && ['win','loss','gameOver'].includes(fight.status)) {
        fight.recorded = true;
        state.history.push({ enemy: fight.config.label, outcome: fight.status === 'win' ? 'win' : 'loss',
          ts: Math.max(Date.now(), (state.history.at(-1)?.ts ?? 0) + 1) });
      }
      state.log = state.log.slice(-100); run[ID] = state; saveState(); render();
    } catch (error) { showAlert(error.message || 'Check the simulator values.'); }
  }
  function config(state) {
    const entry = selected(state);
    const customActors = el('combatHero').value === 'both' ? heroIds() : [el('combatHero').value];
    let result;
    if (entry?.chaos) {
      if (!state.burst) throw new RangeError('Roll the Chaos bolts first.');
      const targets = [...el('chaosTargets').querySelectorAll('select')].map(input => {
        if (input.value === '') throw new RangeError('Choose who each green bolt strikes.');
        return Number(input.value);
      });
      state.groups[group(state)] = resolveDualChaos(entry.chaos, state.burst, readHelpers(state), targets);
      result = dualChaosEncounter(entry, state.burst, state.groups[group(state)]);
    } else {
      const opponents = editor.read();
      result = { ...(entry ? copy(entry) : {section:'custom',label:'Custom fight',rules:copy(defaults().rules),exits:{},win:null}),
        bonus: entry?.bonus ?? number('bonus'),
        enemies: opponents.map((opponent,index) => ({ ...entry?.enemies[index], name:opponent.displayName || 'Opponent', rating:opponent.rating,
          ...(entry ? {} : customActors.length === 2 ? {heroes:customActors} : {hero:customActors[0]}),
          ability: !entry || entry.manualAbility ? el('combatAbility').value : entry.enemies[index].ability })),
      };
    }
    return result;
  }
  function start(state) {
    if (active(state)) return;
    state.heroes = readHero(state); readHelpers(state);
    const entry = config(state);
    state.custom = { enemies:editor.snapshot(), hero:el('combatHero').value, ability:el('combatAbility').value, bonus:el('bonus').value };
    state.fight = startDualFight(state.heroes,entry,state.groups[group(state)] ?? []);
    state.log.push('Started: ' + entry.label); state.burst = null; state.targets = [];
  }
  function round(state) {
    if (!active(state)) return;
    const value = el('helperTarget').value;
    state.fight = dualRound(state.fight,{helperTarget:value === '' ? undefined : Number(value)});
    const fight = state.fight, result = fight.history.at(-1);
    state.heroes = fight.heroes;
    const key = fight.config.helpers?.group;
    if (key) state.groups[key] = fight.helpers.filter(helper => !helper.knockedOut && !helper.mutated);
    state.log.push(`Round ${result.round}: ${result.attackDice} + abilities and bonuses = ${result.total}; ${result.success ? 'opponent beaten' : 'miss'}.`
      + (result.counter ? ` Counter ${result.counter.total}: ${result.counter.hit ? result.counter.helper !== undefined ? 'companion knocked out' : result.counter.shieldUsed ? 'Shield used' : 'hero hit' : 'miss'}.` : ''));
    if (!active(state)) state.log.push(fight.status === 'win' ? 'Victory!' : fight.status === 'gameOver' ? 'Game Over.'
      : fight.section ? 'Defeated. Continue at section ' + fight.section + '.' : 'A life was lost. Follow the return instruction in your book.');
  }
  function renderTargets(state) {
    const entry = selected(state), helpers = copy(state.groups[group(state)] ?? []);
    let out = '';
    for (const [i,face] of (state.burst?.greenFaces ?? []).entries()) {
      const available = helpers.map((helper,index) => !helper.mutated && !helper.knockedOut ? index : -1).filter(index => index >= 0);
      if (!available.length) break;
      const target = state.targets[i], valid = available.includes(target);
      out += field('',`Green bolt ${i+1} (${face})`,`<select class="inv-edit-input" data-bolt="${i}"><option value="">Choose companion</option>${available.map(index => `<option value="${index}"${valid && target === index ? ' selected' : ''}>${escape(helpers[index].name)}</option>`).join('')}</select>`);
      if (valid && !(helpers[target].suit && entry.chaos.suitProtectsOn.includes(face))) helpers[target].mutated = true;
    }
    el('chaosTargets').innerHTML = out;
  }
  function render() {
    if (!el('overlay')) return;
    const state = data();
    if (!state) { shownRun = undefined; close(); return; }
    if (state.rulesVersion !== 1) { close(); showAlert('This saved simulator needs its original rules. Its data has been kept.'); return; }
    const changedRun = shownRun !== getRun();
    if (changedRun) { shownRun = getRun(); shownPreset = undefined; }
    ensureGroup(state);
    const entry = selected(state), busy = active(state), actor = state.heroes[state.hero];
    el('hero').value = state.hero; el('encounter').value = state.encounter;
    for (const key of Object.keys(defaults().abilityNames)) el('ability-'+key).value = actor.abilities[key];
    el('lives').value = actor.lives; el('rings').value = actor.rings; el('shield').checked = actor.shield;
    for (const input of el('character').querySelectorAll('input,select,button')) input.disabled = busy;
    if (shownPreset !== state.encounter || changedRun) {
      shownPreset = state.encounter; editor.fixCount(Boolean(entry));
      editor.set(entry?.chaos ? [{...defaults().customEnemyDefaults}] : entry ? entry.enemies : state.custom.enemies ?? [{...defaults().customEnemyDefaults}]);
      el('combatHero').value = entry ? entry.enemies[0].heroes ? 'both' : entry.enemies[0].hero : state.custom.hero ?? heroIds()[0];
      el('combatAbility').value = entry?.manualAbility ? '' : entry?.enemies[0].ability ?? state.custom.ability ?? Object.keys(defaults().abilityNames)[0];
      el('bonus').value = entry?.bonus ?? state.custom.bonus ?? 0;
    }
    editor.element.hidden = Boolean(entry?.chaos); editor.lock(busy);
    el('encounter').disabled = busy; el('combatHero').disabled = busy || Boolean(entry);
    el('combatAbility').disabled = busy || Boolean(entry && !entry.manualAbility); el('bonus').disabled = busy || Boolean(entry);
    el('note').textContent = entry?.note ?? '';
    el('helpers').hidden = !entry?.helpers;
    const helpers = state.groups[group(state)] ?? [];
    el('helperCount').value = helpers.length; el('helperCount').disabled = busy;
    const focused = document.activeElement?.id;
    el('helperRows').innerHTML = helpers.map((helper,index) => `<label class="bsim-checkbox"><input id="${ID}-helper-suit-${index}" type="checkbox"${helper.suit ? ' checked' : ''}${busy ? ' disabled' : ''}>${escape(helper.name)}: protective suit</label>`).join('');
    el('chaos').hidden = !entry?.chaos; el('rollChaos').disabled = busy;
    el('chaosRolls').textContent = state.burst ? `Bolts: ${state.burst.faces.join(', ')}. Opponent rating bonus: ${state.burst.blueBonus}.` : '';
    renderTargets(state);
    for (const input of el('chaosTargets').querySelectorAll('select')) input.disabled = busy;
    el('start').disabled = busy || Boolean(entry?.manualAbility && !el('combatAbility').value)
      || Boolean(entry?.chaos && (!state.burst || [...el('chaosTargets').querySelectorAll('select')].some(input => input.value === '')));
    el('attack').disabled = !busy; el('cancel').disabled = !busy; el('check').disabled = busy;
    const healthy = (state.fight?.helpers ?? []).map((helper,index) => !helper.knockedOut && !helper.mutated ? index : -1).filter(index => index >= 0);
    const previousTarget = el('helperTarget').value;
    el('helperTargetRow').hidden = !busy || !state.fight.config.helperHitSplit || !healthy.length;
    el('helperTarget').innerHTML = healthy.map(index => `<option value="${index}">${escape(state.fight.helpers[index].name)}</option>`).join('');
    if (healthy.includes(Number(previousTarget))) el('helperTarget').value = previousTarget;
    const fight = state.fight;
    el('status').textContent = fight ? fight.status + (fight.section ? ' · Section ' + fight.section : '') : 'Ready';
    el('heroStatus').textContent = heroIds().map(key => `${defaults().heroNames[key]}: ${state.heroes[key].lives} lives, ${state.heroes[key].rings} rings`).join(' · ');
    el('opponents').innerHTML = fight ? fight.config.enemies.map((enemy,index) => `<div>${escape(enemy.name)}: ${index < fight.opponentIndex ? 'defeated' : 'rating '+enemy.rating}</div>`).join('') : '';
    el('destinations').textContent = fight?.status === 'win' && fight.config.winChoices?.length ? 'Continue with the book: ' + fight.config.winChoices.join(' / ') : '';
    el('log').innerHTML = state.log.slice().reverse().map(line => `<div>${escape(line)}</div>`).join('');
    el('history').innerHTML = state.history.slice(-30).reverse().map(item => `<div>${escape(item.enemy)} · ${escape(item.outcome)}</div>`).join('');
    if (focused) document.getElementById(focused)?.focus();
  }
  const field = (key,label,control) => `<label class="inv-edit-row"${key ? ` id="${ID}-${key}Row"` : ''}><span>${escape(label)}</span>${control}</label>`;
  const select = (key,label,options) => field(key,label,`<select class="inv-edit-input" id="${ID}-${key}">${options}</select>`);
  const input = (key,label,value=0,min=0,max=1000000) => field(key,label,`<input class="inv-edit-input" id="${ID}-${key}" type="number" min="${min}" max="${max}" step="1" value="${value}">`);
  const button = (key,label) => `<button class="bsim-action-btn" type="button" id="${ID}-${key}">${escape(label)}</button>`;
  const actorOptions = () => heroIds().map(key => `<option value="${key}">${escape(defaults().heroNames[key])}</option>`).join('');
  const abilityOptions = () => Object.entries(defaults().abilityNames).map(([key,label]) => `<option value="${key}">${escape(label)}</option>`).join('');
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(t(definition.i18nPrefix+'.title'))}</span><button class="inv-close-btn" type="button" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left">
      <details open><summary>Characters</summary><p>${escape(defaults().note)}</p><p>${escape(defaults().startingGear)}</p><div id="${ID}-character">${select('hero','Hero',actorOptions())}${Object.keys(defaults().abilityNames).map(key => input('ability-'+key,defaults().abilityNames[key],0,0,99)).join('')}${input('lives','Lives')}${input('rings','Rings')}<label class="bsim-checkbox"><input type="checkbox" id="${ID}-shield">Shield</label><div class="bsim-btn-row">${button('applyHero','Apply character')}${button('takeHit','Take a hit')}</div></div></details>
      ${select('encounter','Encounter','<option value="">Custom fight</option>'+getRoster().map(entry => `<option value="${entry.section}">${escape(entry.label)}</option>`).join(''))}<p id="${ID}-note"></p>
      ${select('combatHero','Fighting',actorOptions()+'<option value="both">Together</option>')}${select('combatAbility','Ability','<option value="">Choose ability</option>'+abilityOptions())}${input('bonus','Combat bonus',0,-99,99)}<div id="${ID}-enemyEditor"></div>
      <details id="${ID}-helpers" open><summary>Companions</summary>${input('helperCount','Currently helping',0,0,100)}<div id="${ID}-helperRows"></div></details>
      <div id="${ID}-chaos">${button('rollChaos','Roll Chaos bolts')}<p id="${ID}-chaosRolls"></p><div id="${ID}-chaosTargets"></div></div>
      ${select('helperTarget','Companion at risk','')}<div class="bsim-btn-row">${button('start','Start fight')}${button('attack','Next round')}${button('cancel','End fight')}</div>
      <details><summary>Ability test</summary>${select('testHero','Testing',actorOptions()+'<option value="both">Together</option>')}${select('testAbility','Ability',abilityOptions())}${input('target','Target',1,1,999)}${input('testBonus','Bonus',0,-99,99)}${button('check','Roll test')}</details>
      </div><div class="bsim-col bsim-col-right"><div id="${ID}-status" role="status"></div><div id="${ID}-heroStatus" role="status"></div><div id="${ID}-opponents"></div><div id="${ID}-destinations" role="status"></div><div class="bsim-log" id="${ID}-log"></div><details><summary>Battle history</summary><div id="${ID}-history"></div></details></div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({document,id:ID,t,fields:[{key:'rating',label:'Rating',min:1,max:999}],
      presets:getRoster().flatMap(entry => entry.enemies.map(enemy => ({...enemy,displayName:enemy.name})))});
    el('enemyEditor').appendChild(editor.element);
    const launch = document.createElement('button'); launch.id = ID+'-btn'; launch.textContent = t('battlesim.title'); launch.style.display='none';
    getButtonRow().appendChild(launch); launch.addEventListener('click',open); el('close').addEventListener('click',close);
    let backdrop=false;
    overlay.addEventListener('mousedown',event => {backdrop=event.target===overlay;});
    overlay.addEventListener('click',event => {if(backdrop&&event.target===overlay)close();});
    overlay.addEventListener('keydown',event => {if(event.key==='Escape'){event.stopPropagation();close();}});
    registerShortcut({button:launch,overlay,open,close});
    el('character').addEventListener('change',event => action(state => {
      if(active(state))return;state.heroes=readHero(state);if(event.target===el('hero'))state.hero=el('hero').value;
    }));
    el('applyHero').addEventListener('click',()=>action(state=>{if(!active(state))state.heroes=readHero(state);}));
    el('takeHit').addEventListener('click',()=>action(state=>{if(!active(state))state.heroes=dualHit(readHero(state),state.hero).heroes;}));
    el('encounter').addEventListener('change',()=>action(state=>{
      if(active(state))return;state.heroes=readHero(state);state.encounter=el('encounter').value;state.burst=null;state.targets=[];ensureGroup(state);
      const actors=selected(state)?.enemies.map(enemy=>enemy.hero);if(actors?.length&&actors.every(actor=>actor===actors[0])&&state.heroes[actors[0]])state.hero=actors[0];
    }));
    el('helpers').addEventListener('change',()=>action(state=>{if(!active(state)){readHelpers(state);state.targets=[];}}));
    el('rollChaos').addEventListener('click',()=>action(state=>{
      if(active(state)||!selected(state)?.chaos)return;readHelpers(state);state.burst=dualChaosBurst(selected(state).chaos);state.targets=[];
      state.log.push('Chaos bolts: '+state.burst.faces.join(', '));
    }));
    el('chaosTargets').addEventListener('change',event=>action(state=>{
      if(!active(state)&&event.target.dataset.bolt!==undefined)state.targets[Number(event.target.dataset.bolt)]=event.target.value===''?null:Number(event.target.value);
    }));
    el('combatAbility').addEventListener('change',()=>{
      if(getRun()!==shownRun||Number(getBookId())!==definition.id)return;
      const state=data();
      if(state&&!active(state)&&selected(state)?.manualAbility)el('start').disabled=!el('combatAbility').value;
    });
    el('start').addEventListener('click',()=>action(start));el('attack').addEventListener('click',()=>action(round));
    el('check').addEventListener('click',()=>action(state=>{
      if(active(state))return;state.heroes=readHero(state);const actor=el('testHero').value;
      const result=dualAbilityCheck(state.heroes,actor==='both'?heroIds():[actor],el('testAbility').value,number('target'),undefined,number('testBonus'));
      state.log.push(`Test: ${result.total} against ${result.target} - ${result.success?'success':'failure'}.`);
    }));
    el('cancel').addEventListener('click',()=>{
      if(getRun()!==shownRun)return;const run=getRun(),original=data(),fight=original?.fight;if(!active(original))return;
      showConfirm('End this fight? Both characters and battle history will be kept.',()=>{
        if(getRun()===run&&data()===original&&data()?.fight===fight)action(state=>{state.fight.status='cancelled';});
      });
    });
  }
  return {init,render,setVisible(value){const launch=el('btn');if(launch)launch.style.display=value?'':'none';if(!value)close();}};
}
