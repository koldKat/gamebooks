'use strict';

// Settle each festival once, paying every participation day or permanently skipping all.
const { dayKey } = require('./season-participation');

function createSeasonPayouts({ db, getSupply, gift }) {
  const settle = db.transaction((appBirthAt, now) => {
    const today = dayKey(now), userIds = new Set(), results = [];
    const pending = db.prepare(`SELECT d.season_id,d.starts_on,d.ends_on,MIN(d.event_name) AS event_name
      FROM seasonal_participation_days d
      WHERE d.ends_on<? AND NOT EXISTS (SELECT 1 FROM seasonal_participation_payouts p
        WHERE p.season_id=d.season_id AND p.starts_on=d.starts_on)
      GROUP BY d.season_id,d.starts_on ORDER BY d.ends_on,d.season_id`).all(today);
    for (const season of pending) {
      const users = db.prepare(`SELECT d.user_id,u.username,COUNT(*) AS amount FROM seasonal_participation_days d
        JOIN users u ON u.id=d.user_id WHERE d.season_id=? AND d.starts_on=? GROUP BY d.user_id ORDER BY d.user_id`)
        .all(season.season_id, season.starts_on);
      const total = users.reduce((sum, user) => sum + user.amount, 0);
      const status = total <= getSupply(appBirthAt).available ? 'paid' : 'skipped';
      if (status === 'paid') {
        for (const user of users) {
          if (!gift(user.user_id, user.amount, `Thank you for participating in the ${season.event_name} event!`)) {
            throw Error('Season reward recipient disappeared');
          }
          userIds.add(user.user_id);
        }
      }
      const saveRecipient = db.prepare(`INSERT INTO seasonal_participation_recipients
        (season_id,starts_on,user_id,username,qualifying_days,paid_gc) VALUES(?,?,?,?,?,?)`);
      for (const user of users) {
        saveRecipient.run(season.season_id, season.starts_on, user.user_id, user.username,
          user.amount, status === 'paid' ? user.amount : 0);
      }
      db.prepare(`INSERT INTO seasonal_participation_payouts
        (season_id,starts_on,ends_on,status,total_gc,recipients,processed_at,event_name) VALUES(?,?,?,?,?,?,?,?)`)
        .run(season.season_id, season.starts_on, season.ends_on, status, total, users.length,
          Math.floor(now.getTime() / 1000), season.event_name);
      results.push({ seasonId: season.season_id, startsOn: season.starts_on, status, total, recipients: users.length });
    }
    return { results, userIds: [...userIds] };
  });
  return (appBirthAt, now = new Date()) => settle.immediate(appBirthAt, now);
}

function getSeasonPayoutReports(db) {
  const recipients = db.prepare(`SELECT user_id,username,qualifying_days,paid_gc
    FROM seasonal_participation_recipients WHERE season_id=? AND starts_on=?
    ORDER BY paid_gc DESC,qualifying_days DESC,username COLLATE NOCASE,user_id`);
  return db.prepare(`SELECT * FROM seasonal_participation_payouts ORDER BY processed_at DESC,ends_on DESC,season_id`).all()
    .map(row => ({
      seasonId: row.season_id, name: row.event_name || row.season_id,
      startsOn: row.starts_on, endsOn: row.ends_on, processedAt: row.processed_at,
      status: row.status, eligibleGc: row.total_gc, paidGc: row.status === 'paid' ? row.total_gc : 0,
      recipientCount: row.recipients, recipients: recipients.all(row.season_id, row.starts_on),
    }));
}

module.exports = { createSeasonPayouts, getSeasonPayoutReports };
