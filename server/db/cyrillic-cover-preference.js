'use strict';

const countryCode = value => {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'ZZ' ? code : null;
};

function cyrillicCoverDefault(activeCountry, lastCountry) {
  const country = countryCode(activeCountry) ?? countryCode(lastCountry);
  return country === null ? undefined : country === 'BG' ? '0' : '1';
}

function backfillCyrillicCoverPreference(db) {
  const key = 'hide_cyrillic_covers_country_backfill';
  return db.transaction(() => {
    if (db.prepare('SELECT 1 FROM admin_settings WHERE key = ?').get(key)) return 0;
    const users = db.prepare('SELECT id, active_country, last_country FROM users').all();
    const enable = db.prepare(`
      UPDATE users SET ui_prefs = json_set(
        CASE WHEN json_valid(ui_prefs) THEN
               CASE WHEN json_type(ui_prefs) = 'object' THEN ui_prefs ELSE '{}' END
             ELSE '{}' END,
        '$.hideCyrillicCovers', '1'
      ) WHERE id = ?
    `);
    let updated = 0;
    for (const user of users) {
      if (cyrillicCoverDefault(user.active_country, user.last_country) === '1') {
        updated += enable.run(user.id).changes;
      }
    }
    db.prepare('INSERT INTO admin_settings (key, value) VALUES (?, ?)').run(key, '1');
    return updated;
  }).immediate();
}

module.exports = { cyrillicCoverDefault, backfillCyrillicCoverPreference };
