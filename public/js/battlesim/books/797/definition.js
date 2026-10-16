export const definition = Object.freeze({
  id: 797,
  title: 'Сгреши пътя, обърни!',
  family: 'fighting-fantasy',
  stateKey: 'sim797',
  i18nPrefix: 'battlesim797',
});

export const RULES_REVISION = 1;
export const ENCOUNTERS = [27, 60].map(section => ({
  section, name: 'Космически пират', seconds: section === 27 ? 120 : 90,
  win: 11, loss: 36, threshold: 2, stun: true,
  enemies: [{ displayName: 'Космически пират', skill: 9, stamina: 12 }],
}));
export const encounterFor = section => ENCOUNTERS.find(entry => entry.section === Number(section));
