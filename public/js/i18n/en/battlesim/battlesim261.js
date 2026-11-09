// Shared family labels with this book's wound amounts and optional entry changes.
import familyLabels from './battlesim1362.js';
const labels = Object.fromEntries(Object.entries(familyLabels).map(([key,value])=>[key.replace('battlesim1362.','battlesim261.'),value]));
Object.assign(labels, {
  'battlesim261.itemNote':'Enter your current scores. Encounter bonuses and penalties apply only where printed; this tool never changes your shared inventory or story progress.',
  'battlesim261.applyEntry':'Apply the printed pre-combat score changes (uncheck if already recorded)',
  'battlesim261.pending.outgoing':'You wounded your opponent. Accept {damage} damage or Test Luck for {lucky} if lucky, {unlucky} if unlucky.',
  'battlesim261.pending.incoming':'You were wounded. Accept {damage} damage or Test Luck for {lucky} if lucky, {unlucky} if unlucky.',
  'battlesim261.automatic.outgoing':'You automatically win the first Attack Round.',
  'battlesim261.automatic.incoming':'You automatically lose the first Attack Round.',
  'battlesim261.entryResult':'Entry: lose {n} STAMINA and {luck} LUCK; SKILL change {skillChange}.',
  'battlesim261.bypassConfirm':'Skip this encounter?',
});
export default labels;
