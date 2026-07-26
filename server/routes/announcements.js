'use strict';

// Announcement (admin-authored site banners) route handlers.

const db = require('../db');
const { send, readBody, requireLocalhost } = require('../request-helpers');
const { feedPush } = require('../sse');

async function handleAdminGetAnnouncements(req, res) {
  if (!requireLocalhost(req, res)) return;
  send(res, 200, db.getAnnouncements());
}

function trimAnn(s) {
  return (s || '').split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function handleAdminCreateAnnouncement(req, res) {
  if (!requireLocalhost(req, res)) return;
  const { title, body } = await readBody(req);
  const t = trimAnn(title), b = trimAnn(body);
  if (!t || !b) return send(res, 400, { error: 'title and body required' });
  send(res, 200, db.createAnnouncement(t, b));
}

async function handleAdminUpdateAnnouncement(req, res, id) {
  if (!requireLocalhost(req, res)) return;
  const { title, body } = await readBody(req);
  const t = trimAnn(title), b = trimAnn(body);
  if (!t || !b) return send(res, 400, { error: 'title and body required' });
  const row = db.updateAnnouncement(id, t, b);
  if (!row) return send(res, 404, { error: 'Not found' });
  send(res, 200, row);
  if (row.is_published) feedPush({ type: 'feed_changed', entity: 'announcement', action: 'update' });
}

async function handleAdminPublishAnnouncement(req, res, id) {
  if (!requireLocalhost(req, res)) return;
  const row = db.publishAnnouncement(id);
  if (!row) return send(res, 404, { error: 'Not found' });
  send(res, 200, row);
  feedPush({ type: 'feed_changed', entity: 'announcement', action: 'publish' });
}

async function handleAdminUnpublishAnnouncement(req, res, id) {
  if (!requireLocalhost(req, res)) return;
  const row = db.unpublishAnnouncement(id);
  if (!row) return send(res, 404, { error: 'Not found' });
  send(res, 200, row);
  feedPush({ type: 'feed_changed', entity: 'announcement', action: 'unpublish' });
}

async function handleAdminDeleteAnnouncement(req, res, id) {
  if (!requireLocalhost(req, res)) return;
  if (!db.deleteAnnouncement(id)) return send(res, 404, { error: 'Not found' });
  send(res, 200, { ok: true });
  feedPush({ type: 'feed_changed', entity: 'announcement', action: 'delete' });
}

async function handleAdminPinAnnouncement(req, res, id) {
  if (!requireLocalhost(req, res)) return;
  const row = db.pinAnnouncement(id);
  if (!row) return send(res, 404, { error: 'Not found or not published' });
  send(res, 200, row);
  feedPush({ type: 'feed_changed', entity: 'announcement', action: 'pin' });
}

async function handleAdminUnpinAnnouncement(req, res, id) {
  if (!requireLocalhost(req, res)) return;
  const row = db.unpinAnnouncement(id);
  if (!row) return send(res, 404, { error: 'Not found' });
  send(res, 200, row);
  feedPush({ type: 'feed_changed', entity: 'announcement', action: 'unpin' });
}

module.exports = {
  handleAdminGetAnnouncements,
  handleAdminCreateAnnouncement,
  handleAdminUpdateAnnouncement,
  handleAdminPublishAnnouncement,
  handleAdminUnpublishAnnouncement,
  handleAdminDeleteAnnouncement,
  handleAdminPinAnnouncement,
  handleAdminUnpinAnnouncement,
};
