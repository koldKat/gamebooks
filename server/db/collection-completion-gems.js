'use strict';

// Permanent discovery and mapping rewards for public series and anthologies.
function initializeCollectionCompletionGems(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS collection_completion_gems (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    collection_id INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('series','anthology')),
    milestone TEXT NOT NULL CHECK(milestone IN ('discovery','mapping')),
    created_at INTEGER NOT NULL DEFAULT(unixepoch()),
    PRIMARY KEY(user_id,collection_id,kind,milestone));
    CREATE TRIGGER IF NOT EXISTS award_collection_discovery_ruby
    AFTER INSERT ON collection_completion_gems WHEN NEW.milestone='discovery' BEGIN
      INSERT INTO user_diamonds(user_id,diamonds_earned) VALUES(NEW.user_id,1)
        ON CONFLICT(user_id) DO UPDATE SET diamonds_earned=diamonds_earned+1;
    END;
    CREATE TRIGGER IF NOT EXISTS award_series_mapping_diamond
    AFTER INSERT ON collection_completion_gems WHEN NEW.milestone='mapping' AND NEW.kind='series' BEGIN
      INSERT INTO user_rubies(user_id,rubies_earned) VALUES(NEW.user_id,1)
        ON CONFLICT(user_id) DO UPDATE SET rubies_earned=rubies_earned+1;
      UPDATE ruby_market SET rubies=rubies+(completions+1)/10-completions/10,
        rubies_generated=rubies_generated+(completions+1)/10-completions/10,
        completions=completions+1 WHERE id=1;
    END;`);
}

function createCollectionCompletionChecker(db, completion, discovery) {
  const series = db.prepare(`SELECT s.id,s.is_public FROM series s WHERE s.id IN (
    SELECT series_id FROM books WHERE id=? UNION
    SELECT p.series_id FROM books b JOIN books p ON p.id=b.parent_book_id WHERE b.id=?)`);
  const seriesMembers = db.prepare(`SELECT b.*,e.section_id AS uncounted_entry FROM books b
    LEFT JOIN books p ON p.id=b.parent_book_id
    LEFT JOIN book_reading_entries e ON e.book_id=b.id AND e.counts_as_section=0
    WHERE b.is_container=0 AND (b.series_id=? OR (b.series_id IS NULL AND p.series_id=?))`);
  const parents = db.prepare(`SELECT id,is_public FROM books WHERE is_container=1 AND
    (id=? OR id IN (SELECT parent_book_id FROM books WHERE id=? UNION
    SELECT anthology_id FROM book_anthology_memberships WHERE book_id=?))`);
  const anthologyMembers = db.prepare(`SELECT b.*,e.section_id AS uncounted_entry FROM books b
    LEFT JOIN book_reading_entries e ON e.book_id=b.id AND e.counts_as_section=0
    WHERE b.is_container=0 AND (b.parent_book_id=? OR b.id IN
      (SELECT book_id FROM book_anthology_memberships WHERE anthology_id=?))`);
  const award = db.prepare(`INSERT OR IGNORE INTO collection_completion_gems
    (user_id,collection_id,kind,milestone) VALUES(?,?,?,?)`);
  const rewarded = db.prepare(`SELECT 1 FROM collection_completion_gems
    WHERE user_id=? AND collection_id=? AND kind=? AND milestone=?`);
  return (userId,bookId,minimum) => {
    let earned=0;
    const groups = series.all(bookId,bookId).map(row=>({...row,kind:'series'}));
    // Mapping anthology diamonds retain their existing permanent ruby_rewards ledger.
    if (discovery) groups.push(...parents.all(bookId,bookId,bookId).map(row=>({...row,kind:'anthology'})));
    const milestone=discovery?'discovery':'mapping';
    for (const group of groups) {
      if (!group.is_public || rewarded.get(userId,group.id,group.kind,milestone)) continue;
      const members=(group.kind==='series'?seriesMembers:anthologyMembers).all(group.id,group.id);
      if (!members.length || members.some(row=>!row.is_public)
          || members.reduce((n,row)=>n+row.total_sections,0)<minimum) continue;
      if (members.every(row=>completion(userId,row).complete)) {
        earned+=award.run(userId,group.id,group.kind,milestone).changes;
      }
    }
    return earned;
  };
}

module.exports={initializeCollectionCompletionGems,createCollectionCompletionChecker};
