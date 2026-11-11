import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { sectionLabel } from '../../../public/js/core/section-labels.js';

function setup() {
  const state = { graph: {}, playthroughs: [{ path: ['opening'], completed: false }], activePtIndex: 0,
    startSection: 'opening', uncountedSections: ['opening'], totalSections: 34 };
  let saves = 0;
  const context = vm.createContext({ state, Date, Set, String,
    parseSecId: value => /^\d+$/.test(String(value)) ? Number(value) : value,
    isTerminal: value => value === 0 || value === -1,
    isValidSecId: value => value != null && value !== 0 && value !== -1,
    currentPlaythrough: () => state.playthroughs[0], allDiscoveredSections: () => new Set(),
    isSectionMapped: sec => !!state.graph[sec] && !state.graph[sec].discovered,
    saveState: () => saves++, render() {}, network: null, showAlert() {}, endPlaythrough() {},
    naturalCompare: (a,b) => String(a).localeCompare(String(b)), t: value => value,
    playContext: {}, maxUndos: () => 3,
  });
  for (const file of ['choices', 'navigation']) {
    const source = readFileSync(new URL(`../../../public/js/play/${file}.js`, import.meta.url), 'utf8');
    vm.runInContext(source.replace(/^import .*;$/gm, '').replace(/^export /gm, ''), context);
  }
  return { state, context, saves: () => saves };
}

test('noncounting opening waits for a choice and string choices navigate to numeric section 1', () => {
  const s = setup();
  s.context.commitChoices('opening', ['1', 1]);
  assert.deepEqual([...s.state.graph.opening.choices], [1]);
  assert.equal(s.context.wouldAutoNav('opening', s.state.playthroughs[0]), false);
  s.context.navigate(1);
  assert.deepEqual(s.state.playthroughs[0].path, ['opening', 1]);
  const saves = s.saves();
  s.context.navigate('1');
  assert.deepEqual(s.state.playthroughs[0].path, ['opening', 1]);
  assert.equal(s.saves(), saves);
});

test('reopening after reader discovery does not walk into an unmapped destination', () => {
  const scheduled = [];
  const context = vm.createContext({ console, Date, Set, String,
    localStorage: { getItem: () => null },
    setTimeout: fn => scheduled.push(fn), clearTimeout() {},
    network: null, playContext: {}, render() {}, showAlert() {}, endPlaythrough() {},
    maxUndos: () => 3, maxFastTravels: () => 3, renderPathTrail() {},
    computeOutcomes: () => ({}), escapeHtml: String, sectionLabel: value => value,
    currentBookId: 1, CHOICES_PULSE_THRESHOLD: 3, t: key => key,
  });
  const load = file => vm.runInContext(readFileSync(new URL(`../../../public/js/${file}.js`, import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, ''), context);
  load('core/state');
  load('play/navigation');
  load('play/markup');
  vm.runInContext(`state.graph = {1: {choices: [2]}, 2: {choices: [], discovered: true}};
    state.playthroughs = [{path: [1], completed: false}]; state.activePtIndex = 0;`, context);
  const panel = () => vm.runInContext('renderPanelMarkup(currentPlaythrough(), currentSection())', context);
  assert.match(panel(), /data-choice="2"/);
  assert.equal(scheduled.length, 0, 'reopening must not schedule an automatic move');
  assert.equal(vm.runInContext('currentSection()', context), 1);
  vm.runInContext('delete state.graph[2]', context);
  panel();
  assert.equal(scheduled.length, 0, 'missing destination is also only discovered');
  vm.runInContext('state.graph[2] = {choices: [3]}; state.graph[3] = {choices: [], discovered: true}', context);
  panel();
  assert.equal(scheduled.length, 1, 'previously mapped forced steps still work');
  scheduled.shift()();
  assert.equal(vm.runInContext('currentSection()', context), 2);
  panel();
  assert.equal(scheduled.length, 0, 'a mapped chain stops before its unread destination');
});

test('manual choices cannot record a numeric self-link against a string current section', () => {
  const s = setup();
  s.state.graph[1] = { choices: [], note: 'Keep my note' };
  s.context.handleRecordChoices('1', '1');
  assert.equal(s.saves(), 0);
  s.context.handleRecordChoices('1', '1, 2, 3');
  assert.deepEqual([...s.state.graph[1].choices], [2,3]);
  assert.equal(s.state.graph[1].note, 'Keep my note');
});

test('Bulgarian opening label changes presentation without changing IDs or other books', () => {
  assert.equal(sectionLabel('opening', 988), 'Начало');
  assert.equal(sectionLabel('opening', 989), 'opening');
  assert.equal(sectionLabel(1, 988), 1);
});

test('long named starting sections have compact display labels without changing IDs', () => {
  for (const id of ['introduction', 'Introduction', 'prologue', 'opening-prologue']) {
    assert.equal(sectionLabel(id, 1445), 'Intro');
  }
  assert.equal(sectionLabel('quest-map', 1286), 'Map');
  assert.equal(sectionLabel('quest-map-2', 1286), 'quest-map-2');
  assert.equal(sectionLabel('epilogue', 895), 'epilogue');
  assert.equal(sectionLabel('Т1', 725), 'Т1');
  assert.equal(sectionLabel('42', 1445), '42');
});

test('loading legacy imported paths normalizes numeric IDs and removes existing self-links', async () => {
  const original = { graph:{opening:{choices:['1']},1:{choices:['1','2']}},
    playthroughs:[{path:['opening','1'],completed:false}],activePtIndex:0 };
  const context = vm.createContext({ console, setTimeout, clearTimeout,
    localStorage:{getItem:()=>null},
    fetch:async()=>({ok:true,json:async()=>structuredClone(original)}) });
  const source = readFileSync(new URL('../../../public/js/core/state.js',import.meta.url),'utf8');
  vm.runInContext(source.replace(/^export /gm,''),context);
  await context.loadState(988);
  const result=JSON.parse(vm.runInContext('JSON.stringify(state)',context));
  assert.deepEqual(result.playthroughs[0].path,['opening',1]);
  assert.deepEqual(result.graph.opening.choices,[1]);
  assert.deepEqual(result.graph[1].choices,[2]);
  assert.deepEqual(original.playthroughs[0].path,['opening','1'],'source snapshot is not mutated');
});
