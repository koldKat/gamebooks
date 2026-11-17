'use strict';

// Authenticate collection reads, discoveries and item interactions.
const { authenticate, send, isRequestImpersonating } = require('../request-helpers');
const { db } = require('../db/connection');
const { createCollectibles } = require('../db/collectibles');
const { userBadgePush } = require('../sse');
let store;
async function handleCollectibles(req,res,itemId,action) {
  const userId=await authenticate(req,res);
  if (userId === null) return;
  store ||= createCollectibles(db);
  const collection=()=>({userId,items:store.list(userId),collectedAt:store.collectedAt(userId),quantities:store.quantities(userId),showSingleQuantity:store.canTestCompanions(userId),companionShopEnabled:store.canTestCompanions(userId)&&!isRequestImpersonating(req)});
  res.setHeader('Cache-Control','no-store');
  if (!action) return send(res,200,collection());
  if (isRequestImpersonating(req)) return send(res,403,{error:'Not available'});
  const changed=action==='seen' ? store.discover(userId,itemId) : store.claim(userId,itemId);
  send(res,200,{...collection(),...(action==='claim'?{awarded:changed}:{newlyCollected:changed,collectedForOccurrence:store.collectedForOccurrence(userId,itemId)})});
  if (changed) userBadgePush(userId);
}
module.exports = { handleCollectibles };
