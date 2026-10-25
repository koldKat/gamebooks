import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 728, title: 'Златния галеон срещу Веселия Роджър',
  family: 'golden-galleon', stateKey: 'sim728', i18nPrefix: 'battlesim728',
});

export const RULE_VERSION = 1;
export const SHIPS = Object.freeze({
  large: { speed: 10, manoeuvre: 10, durability: 100, cargo: 200 },
  medium: { speed: 12, manoeuvre: 10, durability: 80, cargo: 160 },
  small: { speed: 16, manoeuvre: 16, durability: 60, cargo: 120 },
});
export const ARCS = Object.freeze({
  bow: { power: [6, 4, 2], range: [6, 4, 2], cost: 1 },
  fore: { power: [12, 8, 6], range: [8, 6, 6], cost: 1 },
  broadside: { power: [24, 16, 12], range: [8, 6, 6], cost: 2 },
  aft: { power: [18, 12, 8], range: [8, 6, 6], cost: 1 },
  stern: { power: [8, 6, 4], range: [6, 4, 4], cost: 1 },
});
export let PIRATES = Object.freeze({});
export const loadRoster = createRosterLoader(728, 'PIRATES', entries => {
  PIRATES = Object.freeze(Object.fromEntries(entries.map(({key, profile}) => [key, profile])));
});
export const DIAGRAMS = Object.freeze({
  56: '82c8196999db22496c2fccc1b00ac59bcc812699535780f7171ad1c84146c65e',
  57: 'b6a511057dc9ff32938f6edbf06cd2f3c883874f922c177aa614436e8abaa2ca',
  66: '2e76dd4491e4b3fb3dfe18362db8b17aea7bd53ed0ba8501bc6f67b723db9aae',
  67: '5ce0359d2598555afca5daca1ae0d685e154ddebee444e2352f7d7807d89a53f',
  76: '8467a1e1995973219ee66d5e50effd1442ff9920c2d7fa89377e242f3b37ea3d',
  77: '434d4366b88e5fd28bb1c0dc119fc926c4a02fef18d37b4edd49b639e2ed7722',
  86: 'e88e2ec00c3e745d54b5fe27d8fd3f785884bdee34163bbd5c2889be6729bc2c',
  87: '54ec32af6f4215b121f99d20be3f6c1914c29972f76841d20a61429187638bf4',
  95: '37b5dad8ef48ad5bef88665e42a6df6ddb156d4a4c82375dfe0aff011c6bc481',
  96: '59d2d965afe7f716161b64317ea3154fa6847ebf14350ee6bdcb6b375712cba2',
  97: '9ee0ca92fe50bac26dd8a950a136fb8704c39cf6b17df3a02d548fc5bf2a187d',
});
export const TACTICS = Object.freeze([95, 56, 66, 76, 86, 67, 77, 57, 96, 97]);
export const SHOT_LIMITS = Object.freeze({ 95: 2, 56: null, 66: 2, 76: 2, 86: 2, 67: 2, 77: 1, 57: 1, 96: 2, 97: 1 });
