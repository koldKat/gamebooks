export const definition = Object.freeze({
  id: 2116, title: 'Пълнолуние', family: 'full-moon', stateKey: 'sim2116', i18nPrefix: 'battlesim2116',
});

export const QUALITIES = ['intuition', 'reflex', 'speed', 'strength', 'punch', 'kick', 'knife', 'stick', 'evilKnowledge'];
export const ITEMS = ['pipe', 'knife', 'spray', 'stake', 'holyWater'];
export const ENCOUNTERS = Object.freeze({
  skinhead: [26, 27, 28, 29, 30], goblins: [114, 113, 118, 117, 119], collie: [135, 140, 143, 144, 145, 146],
});
export const CHECKS = Object.freeze({
  26: {terms: {stick: 2, speed: 1, reflex: 1}, threshold: 16, success: 31, failure: 44, item: 'pipe'},
  27: {terms: {knife: 2, speed: 1, reflex: 1}, threshold: 18, success: 32, failure: 45, item: 'knife'},
  28: {terms: {kick: 2, speed: 1, strength: 1}, threshold: 17, success: 33, failure: 46},
  29: {terms: {punch: 2, speed: 1, strength: 1}, threshold: 20, success: 34, failure: 47},
  30: {terms: {speed: 1, reflex: 1}, threshold: 4, success: 35, failure: 48, item: 'spray'},
  114: {terms: {stick: 2, reflex: 1, strength: 1}, threshold: 18, success: 116, failure: 115, item: 'pipe'},
  135: {terms: {stick: 2, strength: 1, reflex: 1}, threshold: 18, success: 137, failure: 136, item: 'pipe'},
  137: {terms: {speed: 1}, threshold: 3, success: 139, failure: 138},
  140: {terms: {stick: 2, strength: 1, reflex: 1}, threshold: 16, success: 142, failure: 141, item: 'stake'},
});
