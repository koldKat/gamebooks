import {definition, loadRoster, roster} from './definition.js';
import {advanceFight, makePlayer, meleeOptions, openingAvailable, startFight, statKeys, validateFight, validatePlayer} from './combat.js';
import {createQuestState} from '../../engines/super-endless-quest/state.js';
import {createD20Forms} from '../../engines/d20/forms.js';
import {createOpponentEditor} from '../../opponents.js';
import {decorateOutcome} from '../../outcome.js';
import {prepareBattleSimLayout} from '../../layout.js';
import {currentBookId, currentPlaythrough, saveState, apiFetch} from '../../run-context.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {ALL_PANEL_OVERLAY_IDS, registerPanelShortcut, shortcutLabel} from '../../../core/util.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {t} from '../../../i18n.js';

const id = definition.stateKey;
const ui = createD20Forms(document, id, key => t('battlesim32.' + key));
const store = createQuestState(() => ({definition, bookId:currentBookId, run:currentPlaythrough(), saveState}), {validateFight});
const opponentFields = [['attack',0,1000], ['hp',0,1000], ['damageDice',1,2], ['damageBonus',0,1000]];
const editorRow = enemy => ({...enemy, displayName:enemy.name});
let overlay, launch, left, right, mountedRun, mountedOriginal;

function close() {
  overlay?.classList.remove('active');
}

function save(token, change) {
  try {
    if (store.update(change, token)) render();
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    showAlert(ui.tr('invalid'));
  }
}

function renderSetup(token) {
  const {setup, encounters} = roster;
  let player = token.state.player ? structuredClone(token.state.player) : makePlayer(setup.heroes[0]);
  const heroField = ui.field(left, 'hero', {value:player.hero, entries:setup.heroes.map(hero => [hero.section, hero.name])});
  const heroSetup = document.createElement('div');
  left.append(heroSetup);
  let encounter = encounters.find(entry => entry.section === token.state.setup?.section);
  const encounterField = ui.field(left, 'encounter', {value:encounter?.section ?? '',
    entries:[['',ui.tr('custom')], ...encounters.map(entry => [entry.section, entry.section + ' · ' + entry.name])]});
  const editor = createOpponentEditor({document, id, t, language:'bg',
    fields:opponentFields.map(([key,min,max]) => ({key,min,max,label:ui.tr(key)})),
    presets:encounters.flatMap(entry => entry.opponents.map(editorRow)),
  });
  left.append(editor.element);
  const openingSetup = document.createElement('div');
  const meleeSetup = document.createElement('div');
  left.append(openingSetup, meleeSetup);
  let weaponId = token.state.setup?.weaponId;
  let shield = token.state.setup?.shield ?? true;
  const openings = new Map();
  const start = ui.button(left, 'start', () => save(token, state => {
    const enemies = editor.read().map(({displayName, ...row}) => ({...row, name:displayName || ui.tr('opponent')}));
    state.fight = startFight({player, setup, encounter, enemies, weaponId, shield, openings:[...openings.values()]});
    state.setup = {section:encounter?.section, weaponId, shield};
    return state;
  }));
  function renderMelee() {
    meleeSetup.replaceChildren();
    const discarded = encounter?.openings?.filter(row => openings.get(row.group)?.id === row.id).map(row => row.discard) ?? [];
    const remaining = player.items.filter(item => !discarded.includes(item));
    const weapons = meleeOptions(setup, remaining, encounter);
    const weapon = weapons.find(row => row.id === weaponId) ?? weapons[0];
    weaponId = weapon?.id;
    if (weapon) {
      const input = ui.field(meleeSetup, 'weapon', {value:weaponId, entries:weapons.map(row => [row.id,row.name])});
      const shieldInput = ui.checkbox(meleeSetup, 'shield', shield);
      function updateShield() {
        const enabled = remaining.includes(setup.shield) && weapons.find(row => row.id === weaponId).shield;
        shieldInput.closest('label').hidden = !enabled;
        shieldInput.disabled = !enabled;
      }
      input.addEventListener('change', () => { weaponId = input.value; updateShield(); });
      shieldInput.addEventListener('change', () => { shield = shieldInput.checked; });
      updateShield();
    } else ui.text(meleeSetup, ui.tr('noWeapon'));
    start.disabled = !weapon || !validatePlayer(player, setup);
    prepareBattleSimLayout(overlay);
  }
  function renderOpenings() {
    openingSetup.replaceChildren();
    const options = (encounter?.openings ?? []).filter(row => !row.automatic && openingAvailable(setup, row, player.items, encounter));
    const groups = new Map();
    for (const row of options) {
      if (!groups.has(row.group)) groups.set(row.group, []);
      groups.get(row.group).push(row);
    }
    for (const [key, action] of openings) {
      if (!options.some(row => row.id === action.id)) openings.delete(key);
    }
    for (const [group, rows] of groups) {
      const selected = openings.get(group);
      const input = ui.field(openingSetup, 'opening', {value:selected?.id ?? '',
        entries:[['',ui.tr('none')], ...rows.map(row => [row.id,row.label])]});
      input.addEventListener('change', () => {
        if (input.value) openings.set(group, {id:input.value,target:0});
        else openings.delete(group);
        renderOpenings();
        renderMelee();
      });
      if (rows.find(row => row.id === selected?.id)?.targeted) {
        const target = ui.field(openingSetup, 'target', {value:selected.target,
          entries:encounter.opponents.map((enemy,index) => [index, enemy.name + ' ' + (index + 1)])});
        target.addEventListener('change', () => { selected.target = Number(target.value); });
      }
    }
  }
  function renderHero() {
    heroSetup.replaceChildren();
    const hero = setup.heroes.find(row => row.section === player.hero);
    const stats = ui.group(heroSetup, 'attributes', true);
    if (!hero.attributes && player.initialGear) ui.text(stats, ui.tr('allocation'));
    for (const key of statKeys) {
      const min = key === 'armor' ? 0 : 1;
      const max = !hero.attributes && player.initialGear && key !== 'hp' ? (key === 'armor' ? 4 : 5) : 1000;
      const input = ui.field(stats, key, {type:'number', value:player[key], min, max});
      input.addEventListener('input', () => {
        player[key] = input.value === '' ? NaN : Number(input.value);
        start.disabled = !weaponId || !validatePlayer(player, setup);
      });
    }
    const gear = ui.group(heroSetup, 'gear', true);
    const startingItems = () => [...new Set([...hero.fixedItems,
      ...hero.selections.flatMap(({options}, index) => player.choices[index].flatMap(choice => options[choice]))])];
    const gearChange = () => { renderOpenings(); renderMelee(); };
    ui.checkbox(gear, 'currentGear', !player.initialGear).addEventListener('change', event => {
      player.initialGear = !event.target.checked;
      if (player.initialGear) player.items = startingItems();
      renderHero();
      gearChange();
    });
    const namedCheckbox = (name, checked) => {
      const input = ui.checkbox(gear, 'equipmentItem', checked);
      input.nextElementSibling.textContent = name;
      return input;
    };
    if (player.initialGear) {
      if (hero.fixedItems.length) ui.text(gear, ui.tr('fixed') + ' ' + hero.fixedItems.join(', '));
      hero.selections.forEach(({pick,options}, index) => {
        ui.text(gear, ui.tr('choose') + ' ' + pick);
        const choices = new Set(player.choices[index]);
        const boxes = options.map((items, option) => {
          const input = namedCheckbox(items.join(' + '), choices.has(option));
          input.addEventListener('change', () => {
            if (input.checked) choices.add(option);
            else choices.delete(option);
            player.choices[index] = [...choices];
            player.items = startingItems();
            sync();
            gearChange();
          });
          return input;
        });
        function sync() {
          boxes.forEach((input, index) => { input.disabled = !choices.has(index) && choices.size >= pick; });
        }
        sync();
      });
    } else {
      for (const item of setup.items) {
        const input = namedCheckbox(item, player.items.includes(item));
        input.addEventListener('change', () => {
          player.items = input.checked ? [...player.items, item] : player.items.filter(value => value !== item);
          gearChange();
        });
      }
    }
  }
  function selectEncounter() {
    editor.set(encounter ? encounter.opponents.map(editorRow) : [{displayName:'',attack:6,hp:5,damageDice:1,damageBonus:0}]);
    editor.fixCount(Boolean(encounter));
    openings.clear();
    renderOpenings();
    renderMelee();
  }
  encounterField.addEventListener('change', () => {
    encounter = encounters.find(entry => entry.section === Number(encounterField.value));
    selectEncounter();
  });
  heroField.addEventListener('change', () => {
    player = makePlayer(setup.heroes.find(row => row.section === Number(heroField.value)));
    openings.clear();
    renderHero();
    renderOpenings();
    renderMelee();
  });
  renderHero();
  selectEncounter();
}

export function render() {
  if (!overlay) return;
  const token = store.snapshot();
  if (!token) {
    mountedRun = mountedOriginal = null;
    close();
    return;
  }
  if (mountedRun === token.run && mountedOriginal === token.original) return;
  mountedRun = token.run;
  mountedOriginal = token.original;
  const {fight, history} = token.state;
  left.replaceChildren();
  right.replaceChildren();
  ui.text(left, ui.tr('rules'));
  if (fight?.status === 'fighting') {
    ui.text(left, roster.setup.heroes.find(row => row.section === fight.player.hero).name + ' · ' + fight.weapon.name);
    ui.button(left, 'roll', () => save(token, state => {
      state.fight = advanceFight(state.fight);
      return state;
    }));
    ui.button(left, 'cancel', () => showConfirm(ui.tr('cancelConfirm'), () => save(token, state => {
      state.fight = null;
      return state;
    })));
  } else renderSetup(token);
  const status = ui.text(right, ui.tr('status.' + (fight?.status ?? 'ready')));
  status.className = 'bsim-status';
  decorateOutcome(status, fight?.status);
  if (fight) {
    ui.text(right, ui.tr('hp') + ': ' + fight.player.hp + ' · ' + ui.tr('round') + ': ' + fight.round);
    fight.opponents.forEach((enemy,index) => {
      const line = ui.text(right, enemy.name + ': ' + enemy.hp, 'div');
      if (fight.status === 'fighting' && fight.cursor === index) line.className = 'bsim-log-success';
    });
    for (const line of fight.log.slice(-50).reverse()) {
      const score = line.kind === 'opening' ? line.score ?? ui.tr('automatic') : line.playerScore + ' / ' + line.enemyScore;
      const entry = ui.text(right, line.name + ' · ' + (line.weapon ? line.weapon + ' · ' : '') +
        score + ' · ' + ui.tr(line.kind) + (line.damage ? ' (' + line.damage + ')' : ''), 'div');
      entry.className = 'bsim-log-' + (line.kind === 'hurt' ? 'danger' : line.damage ? 'success' : 'muted');
    }
  }
  const past = ui.group(right, 'history');
  for (const row of history.slice(-40).reverse()) {
    decorateOutcome(ui.text(past, row.enemy + ' · ' + ui.tr('status.' + row.outcome), 'div'), row.outcome);
  }
  prepareBattleSimLayout(overlay);
}

export function init() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = id + '-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = '<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
  overlay.querySelector('.inv-modal-title').textContent = ui.tr('title');
  const closer = overlay.querySelector('.inv-close-btn');
  closer.setAttribute('aria-label', t('btn.close'));
  closer.addEventListener('click', close);
  left = overlay.querySelector('.bsim-col-left');
  right = document.createElement('div');
  right.className = 'bsim-report';
  overlay.querySelector('.bsim-col-right').append(right);
  document.body.append(overlay);
  launch = document.createElement('button');
  launch.id = id + '-btn';
  launch.style.display = 'none';
  launch.setAttribute('aria-keyshortcuts','S');
  launch.innerHTML = shortcutLabel(t('battlesim.title'));
  launch.addEventListener('click', () => {
    if (!store.snapshot()) return;
    render();
    overlay.classList.add('active');
  });
  getPlayBtnRow().append(launch);
  registerPanelShortcut('KeyS', {getButton:() => launch, getOverlay:() => overlay,
    otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(key => key !== overlay.id), open:() => launch.click(), close});
  let backdrop = false;
  overlay.addEventListener('pointerdown', event => { backdrop = event.target === overlay; });
  overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
}

export function setVisible(value) {
  if (launch) launch.style.display = value ? '' : 'none';
  if (!value) close();
}

export const loadData = () => loadRoster(apiFetch);
