'use strict';

// Private series owned by different accounts may have the same name.
function migrateSeriesNames(db) {
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'series'").get();
  if (!schema || !/name\s+TEXT\s+NOT NULL\s+UNIQUE/i.test(schema.sql)) return false;
  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  const sequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'series'").get()?.seq;
  const objects = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name = 'series' AND type IN ('index', 'trigger') AND sql IS NOT NULL").all();
  const create = schema.sql
    .replace(/^(CREATE TABLE\s+(?:IF NOT EXISTS\s+)?)(?:"series"|`series`|\[series\]|series)/i, '$1series_name_migration')
    .replace(/(name\s+TEXT\s+NOT NULL)\s+UNIQUE/i, '$1');
  // Rebuild without renaming the old table: existing foreign keys keep targeting series.
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(create);
      db.exec('INSERT INTO series_name_migration SELECT * FROM series');
      db.exec('DROP TABLE series');
      db.exec('ALTER TABLE series_name_migration RENAME TO series');
      if (sequence !== undefined) db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'series'").run(sequence);
      for (const object of objects) db.exec(object.sql);
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
  }
  return true;
}

module.exports = { migrateSeriesNames };
