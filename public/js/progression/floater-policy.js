// Allow personal reward feedback; the shared floaties preference controls display.
const personalTypes = Object.freeze({
  xp:true, survival:true, 'survival-green':true,
  coins:true, rubies:true, diamonds:true, level:true,
});

export function rewardFloaterTypeEnabled(channel, type) {
  return channel === 'admin' || channel === 'personal' && personalTypes[type] === true;
}
