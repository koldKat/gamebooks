// Gate reward types before preparing personal feedback; admin monitoring keeps every type.
const personalTypes = Object.freeze({
  xp:true, survival:true, 'survival-green':true,
  coins:false, rubies:false, diamonds:false, level:false,
});

export function rewardFloaterTypeEnabled(channel, type) {
  return channel === 'admin' || channel === 'personal' && personalTypes[type] === true;
}
