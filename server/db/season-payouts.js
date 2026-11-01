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
      const users = db.prepare(`SELECT d.user_id,COUNT(*) AS amount FROM seasonal_participation_days d
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
      db.prepare(`INSERT INTO seasonal_participation_payouts
        (season_id,starts_on,ends_on,status,total_gc,recipients,processed_at) VALUES(?,?,?,?,?,?,?)`)
        .run(season.season_id, season.starts_on, season.ends_on, status, total, users.length, Math.floor(now.getTime() / 1000));
      results.push({ seasonId: season.season_id, startsOn: season.starts_on, status, total, recipients: users.length });
    }
    return { results, userIds: [...userIds] };
  });
  return (appBirthAt, now = new Date()) => settle.immediate(appBirthAt, now);
}

module.exports = { createSeasonPayouts };
