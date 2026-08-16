'use strict';

// Outgoing admin-notification and feedback-reply email via nodemailer, configured
// from admin settings (falling back to env vars). No-ops silently if unconfigured.

const db = require('./db');
const { escapeHtml } = require('./html-escape');

let _transporter = null;

function reinitTransporter() {
  const host   = db.getAdminSetting('smtp_host')   || process.env.SMTP_HOST;
  const port   = db.getAdminSetting('smtp_port')   || process.env.SMTP_PORT;
  const secure = db.getAdminSetting('smtp_secure') ?? process.env.SMTP_SECURE;
  const user   = db.getAdminSetting('smtp_user')   || process.env.SMTP_USER;
  const pass   = db.getAdminSetting('smtp_pass')   || process.env.SMTP_PASS;
  if (!host || !user || !pass) { _transporter = null; return; }
  try {
    const nodemailer = require('nodemailer');
    _transporter = nodemailer.createTransport({
      host,
      port:   Number(port) || 465,
      secure: secure === 'true' || secure === true,
      auth:   { user, pass },
    });
  } catch (e) { console.warn('nodemailer init failed:', e.message); _transporter = null; }
}

reinitTransporter();

async function sendAdminEmail(subject, text, bodyHtml) {
  if (!_transporter) return;
  const adminAddr = db.getAdminSetting('smtp_user') || process.env.SMTP_USER;
  if (!adminAddr) return;
  const fromAddr = db.getAdminSetting('smtp_from') || adminAddr;
  const from = `Gamebook Tracker <${fromAddr}>`;
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Georgia,serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
        <tr><td style="background:#111827;padding:24px 32px">
          <span style="font-size:1.1rem;font-weight:700;color:#f5a623;letter-spacing:0.5px">Gamebook Tracker</span>
        </td></tr>
        <tr><td style="padding:28px 32px 24px">
          <p style="margin:0 0 12px;font-size:1rem;font-weight:600;color:#111827">${subject}</p>
          <div style="background:#f9fafb;border-left:3px solid #d1d5db;padding:12px 16px;border-radius:0 4px 4px 0;font-size:0.95rem;color:#374151;line-height:1.6;white-space:pre-wrap">${bodyHtml}</div>
        </td></tr>
        <tr><td style="padding:0 32px 28px;text-align:center">
          <a href="https://pathmap.net" style="display:inline-block;background:#111827;color:#f5a623;text-decoration:none;padding:10px 28px;border-radius:5px;font-size:0.9rem;font-weight:600">Open Gamebook Tracker →</a>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:14px 32px;text-align:center;border-top:1px solid #e5e7eb">
          <span style="font-size:0.78rem;color:#9ca3af">Admin notification - Gamebook Tracker</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  await _transporter.sendMail({ from, to: adminAddr, subject, text, html }).catch(() => {});
}

async function sendReplyEmail(to, username, originalMessage, reply) {
  if (!_transporter) return;
  const fromAddr = db.getAdminSetting('smtp_from') || db.getAdminSetting('smtp_user') || process.env.SMTP_FROM || process.env.SMTP_USER;
  const from = fromAddr ? `Gamebook Tracker <${fromAddr}>` : undefined;
  const esc  = s => escapeHtml(s).replace(/\n/g, '<br>');
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Georgia,serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">

        <tr><td style="background:#111827;padding:24px 32px">
          <span style="font-size:1.1rem;font-weight:700;color:#f5a623;letter-spacing:0.5px">Gamebook Tracker</span>
        </td></tr>

        <tr><td style="padding:28px 32px 8px">
          <p style="margin:0 0 4px;font-size:0.85rem;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Your message</p>
          <div style="background:#f9fafb;border-left:3px solid #d1d5db;padding:12px 16px;border-radius:0 4px 4px 0;font-size:0.95rem;color:#374151;line-height:1.6">
            ${esc(originalMessage)}
          </div>
        </td></tr>

        <tr><td style="padding:16px 32px 28px">
          <p style="margin:0 0 4px;font-size:0.85rem;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Reply</p>
          <div style="background:#f0fdf4;border-left:3px solid #86efac;padding:12px 16px;border-radius:0 4px 4px 0;font-size:0.95rem;color:#374151;line-height:1.6">
            ${esc(reply)}
          </div>
        </td></tr>

        <tr><td style="padding:0 32px 28px;text-align:center">
          <a href="https://pathmap.net" style="display:inline-block;background:#111827;color:#f5a623;text-decoration:none;padding:10px 28px;border-radius:5px;font-size:0.9rem;font-weight:600">
            View in inbox →
          </a>
        </td></tr>

        <tr><td style="background:#f9fafb;padding:14px 32px;text-align:center;border-top:1px solid #e5e7eb">
          <span style="font-size:0.78rem;color:#9ca3af">You received this because you submitted feedback on Gamebook Tracker.</span>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
  await _transporter.sendMail({
    from,
    to,
    subject: 'Reply to your feedback - Gamebook Tracker',
    text:    `Hi ${username},\n\nYour message:\n"${originalMessage}"\n\nReply:\n${reply}\n\nView the full conversation:\nhttps://pathmap.net`,
    html,
  });
}

function getTransporter() { return _transporter; }

module.exports = { reinitTransporter, sendAdminEmail, sendReplyEmail, getTransporter };
