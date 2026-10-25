export function createDestinyState(definition, getContext) {
  const current = () => {
    const context = getContext();
    return Number(context.getBookId()) === definition.id ? context.getRun() : null;
  };
  const read = () => current()?.[definition.stateKey] ?? null;
  const capture = () => {
    const run = current(), value = read();
    return {run, value, fight:value?.fight};
  };
  const matches = snapshot => Boolean(snapshot.run && current() === snapshot.run && read() === snapshot.value && read()?.fight === snapshot.fight);
  const commit = (snapshot, value) => {
    if (!matches(snapshot)) return false;
    snapshot.run[definition.stateKey] = value;
    getContext().saveState();
    return true;
  };
  return {current, read, capture, matches, commit};
}
