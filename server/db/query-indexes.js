'use strict';

// Index filtered, ordered notification and discussion lookups without changing rows.
function installQueryIndexes(db) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_feedback_messages_thread_created ON feedback_messages(thread_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_forum_posts_thread_created ON forum_posts(thread_id, created_at);
  `);
  if (db.prepare('PRAGMA table_info(forum_threads)').all().some(column => column.name === 'category_id')) {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_forum_threads_category_pinned_last
      ON forum_threads(category_id, is_pinned DESC, last_post_at DESC)`);
  }
}

module.exports = { installQueryIndexes };
