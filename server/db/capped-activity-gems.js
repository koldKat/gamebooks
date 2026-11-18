'use strict';

// Preserve activity crystal milestones when both XP buffers are full.
function recordCappedActivityGems(db, userId, event, ref) {
  const table = ({
    win_run: 'completed_run_gem_runs',
    death_run: 'completed_run_gem_runs',
    battle_run: 'completed_run_gem_runs',
    battlesim_win: 'sim_battle_gem_battles',
    battlesim_loss: 'sim_battle_gem_battles',
    share_run: 'shared_run_gem_runs',
  })[event];
  if (!table || !ref) return;
  // XP migrations can run before the permanent crystal ledgers initialize.
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) return;
  if (table === 'sim_battle_gem_battles') {
    db.prepare(`INSERT INTO sim_battle_gem_battles(user_id,ref,outcome) VALUES(?,?,?)
      ON CONFLICT(user_id,ref) DO UPDATE SET outcome=COALESCE(outcome,excluded.outcome)`)
      .run(userId, ref, event === 'battlesim_win' ? 'win' : 'loss');
  } else {
    db.prepare(`INSERT OR IGNORE INTO ${table}(user_id,ref) VALUES(?,?)`).run(userId, ref);
  }
}

module.exports = { recordCappedActivityGems };
