// Encounter setup, opponent ordering and chainmail choices for this panel.
import { createOpponentEditor } from '../../opponents.js';

export function createSetup(getContext) {
  let editor, preset, select, note, apply, choices, armor, stamp = '';
  async function mount(overlay) {
    const { t, _loadEnemyList, _data, _startEncounter, _chooseOpponent, _resolveEnemyAttack, escapeHtml, showAlert } = getContext();
    const box = document.createElement('div');
    box.className = 'bsim-side';
    box.innerHTML = `<label class="inv-edit-row"><span>${t('battlesim8.ui.encounter')}</span><select id="s8-encounter" class="inv-edit-input"><option value="">${t('battlesim8.ui.custom')}</option></select></label><div id="s8-encounter-note" class="s8-rules-note"></div><div id="s8-editor"></div><button id="s8-apply" class="inv-add-btn">${t('battlesim8.btn.prepare')}</button><div id="s8-opponent-choices"></div><div id="s8-chainmail-choice"></div>`;
    overlay.querySelector('.bsim-col-left').prepend(box);
    select = box.querySelector('select'); note = box.querySelector('#s8-encounter-note');
    apply = box.querySelector('#s8-apply'); choices = box.querySelector('#s8-opponent-choices'); armor = box.querySelector('#s8-chainmail-choice');
    const rows = await _loadEnemyList();
    const presets = rows.filter(row => row.stats?.encounter);
    presets.sort((a, b) => Number.parseInt(a.stats.encounter.section) - Number.parseInt(b.stats.encounter.section) || a.name.localeCompare(b.name, 'bg', {numeric:true}));
    select.insertAdjacentHTML('beforeend', presets.map(row => `<option value="${row.id}">${escapeHtml(row.name)}</option>`).join(''));
    editor = createOpponentEditor({ document, id: 's8', t, language: 'bg',
      fields: [{key:'skill',label:t('battlesim8.ui.skill'),min:2,max:5}, {key:'lifeMax',label:t('battlesim8.ui.life'),min:1,max:1000000}],
      presets: rows.filter(row => !row.stats?.encounter).map(row => ({displayName:row.name,skill:row.attack,lifeMax:row.hp})),
    });
    box.querySelector('#s8-editor').append(editor.element);
    const d = _data();
    editor.set(d?.group?.initial || [{...d?.enemy, displayName:d?.enemy.name}]);
    editor.element.open = false;
    select.addEventListener('change', () => {
      if (getContext()._fightActive(_data())) return;
      preset = presets.find(row => String(row.id) === select.value);
      const encounter = preset?.stats.encounter;
      editor.fixCount(Boolean(encounter));
      editor.set(encounter?.opponents || [{displayName:'',skill:3,lifeMax:6}]);
      editor.element.open = true;
      note.textContent = encounter?.note || '';
    });
    apply.addEventListener('click', () => {
      try {
        if (_startEncounter(editor.read(), {...preset?.stats.encounter, name:preset?.name})) editor.element.open = false;
      } catch { showAlert(t('battlesim8.ui.invalid')); }
    });
    choices.addEventListener('click', event => {
      const button = event.target.closest('[data-opponent]');
      if (button) _chooseOpponent(Number(button.dataset.opponent));
    });
    armor.addEventListener('click', event => {
      const button = event.target.closest('[data-reroll]');
      if (button) _resolveEnemyAttack(Number(button.dataset.reroll));
    });
    render();
  }
  function render() {
    if (!editor) return;
    const { _data, _fightActive, t, escapeHtml } = getContext(), d = _data();
    if (!d) return;
    const locked = !!_fightActive(d);
    editor.lock(locked); select.disabled = locked; apply.disabled = locked;
    for (const input of document.querySelectorAll('#s8-overlay [data-group], #s8-overlay [id^="s8-item-"], #s8-arrows, #s8-arrows-dec, #s8-arrows-inc, #s8-six-wins, #s8-enemy-pick, #s8-enemy-foe-first')) {
      input.disabled = locked || (!!d.group && (input.dataset.group === 'enemy' || input.id === 's8-enemy-pick' || input.id === 's8-enemy-foe-first'));
    }
    const nextStamp = JSON.stringify([d.group?.remaining, d.enemy, d.awaitingOpponent, d.battleStarted, d.outcomeRecorded, d.pendingAttack, d.player.life]);
    if (nextStamp === stamp) return;
    stamp = nextStamp;
    const canChoose = d.group && d.player.life > 0 && !d.outcomeRecorded && (!d.battleStarted || d.awaitingOpponent);
    choices.innerHTML = d.group ? `<p class="s8-rules-note">${t('battlesim8.ui.group_rule')}<br>${escapeHtml(d.enemy.name)}: ${d.enemy.life}/${d.enemy.lifeMax} · ${t('battlesim8.ui.remaining', {n:d.group.remaining.length})}</p>` : '';
    if (canChoose && d.group.remaining.length) choices.insertAdjacentHTML('beforeend', `<div class="inv-modal-ftr">${d.group.remaining.map((enemy, index) => `<button class="inv-add-btn" data-opponent="${index}">${escapeHtml(enemy.name || t('battlesim8.ui.enemy'))} (${enemy.skill}/${enemy.life})</button>`).join('')}</div>`);
    armor.innerHTML = d.pendingAttack ? `<p class="s8-rules-note">${t('battlesim8.ui.chainmail_choice')}</p><div class="inv-modal-ftr">${d.pendingAttack.dice.map((die, index) => die >= 4 ? `<button class="inv-add-btn" data-reroll="${index}">${t('battlesim8.btn.reroll', {n:die})}</button>` : '').join('')}<button class="inv-add-btn" data-reroll="-1">${t('battlesim8.btn.keep')}</button></div>` : '';
  }
  return { mount, render };
}
