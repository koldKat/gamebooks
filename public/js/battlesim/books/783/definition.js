export const definition = Object.freeze({
  id: 783,
  title: 'Самсон',
  family: 'samson',
  stateKey: 'sim783',
  i18nPrefix: 'battlesim783',
});

export const RULES_REVISION = 1;
export const CHARACTER_FIELDS = ['strength', 'life', 'faith', 'wisdom', 'charm', 'justice', 'debate'];
const enemy = (displayName, strength, life) => ({ displayName, strength, life,
  ...(life == null ? { unavailableStats: ['life'] } : {}) });

export const ENCOUNTERS = [
  { section: 99, name: 'Тълпа филистимци', bonus: 10, win: 219, lose: 200, enemies: [enemy('Тълпа филистимци', 18, 38)] },
  { section: 176, name: 'Двама стражи', win: 138, lose: 200, enemies: [enemy('Първи страж', 8, 7), enemy('Втори страж', 7, 9)] },
  { section: 187, name: 'Млад лъв', bonus: 20, win: 38, lose: 200, enemies: [enemy('Млад лъв', 28, 14)] },
  { section: 210, name: 'Циклоп', kratuna: true, win: 257, lose: 200, enemies: [enemy('Циклоп', 9, 12)] },
  { section: 217, name: 'Десятник', lossLimit: 3, win: 95, lose: 304, enemies: [enemy('Десятник', 8, null)] },
  { section: 220, name: 'Три цербера', win: 112, lose: 200, enemies: [enemy('Първи цербер', 8, 6), enemy('Втори цербер', 9, 4), enemy('Трети цербер', 6, 9)] },
  { section: 225, name: 'Брахмапутра', win: 238, lose: 200, enemies: [enemy('Брахмапутра', 5, 21)] },
  { section: 239, name: 'Харон', entryLoss: 3, win: 143, lose: 200, enemies: [enemy('Харон', 18, 25)] },
  { section: 247, name: 'Ашгарот', lossLimit: 5, win: 168, lose: 340, enemies: [enemy('Ашгарот', 9, null)] },
  { section: 300, name: 'Египетски военачалник', win: 56, lose: 200, enemies: [enemy('Египетски военачалник', 7, 11)] },
  { section: 308, name: 'Филистимски предводители', win: 205, lose: 200, enemies: [enemy('Първи филистимец', 8, 7), enemy('Втори филистимец', 8, 7), enemy('Трети филистимец', 8, 7), enemy('Космат гигант', 10, 11)] },
  { section: 319, name: 'Двама наемници', win: 232, lose: 200, enemies: [enemy('Първи наемник', 6, 10), enemy('Втори наемник', 8, 6)] },
];

export const encounterFor = section => ENCOUNTERS.find(entry => entry.section === Number(section));
