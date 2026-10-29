'use strict';

const templates = [
  '{name} clocks in at Job Level {level} as a {title}. The tools look impressed.',
  'Promotion for {name}! Job Level {level}, {title}, and a slightly dustier hat.',
  'The workshop has a new {title}: {name}, now at Job Level {level}.',
  '{name} reaches Job Level {level}. Please address the toolbox to {title}.',
  'Fresh chalk on the guild board: {name}, {title}, Job Level {level}.',
  '{name} earns the title of {title} at Job Level {level}. Tea break well deserved.',
  'Someone ring the shift bell! {name} is a Job Level {level} {title}.',
  'The apprentice handbook needs an update. {name} is now a {title}, Job Level {level}.',
  '{name} steps up to Job Level {level} as a {title}. Mind the low beam.',
  'A round of applause, preferably with clean hands: {name}, {title}, Job Level {level}!',
  '{name} has a new job title: {title}. Job Level {level} looks good on the nameplate.',
  'The foreman checks the ledger twice. Yes, {name} really reached Job Level {level}: {title}.',
  '{name} trades beginner mistakes for professional mistakes. Job Level {level}, {title}!',
  'A fresh notch on the workbench for {name}: Job Level {level}, {title}.',
  'The guild welcomes its latest {title}. That would be {name}, Job Level {level}.',
  '{name} reaches Job Level {level} and becomes a {title}. Same boots, bigger ambitions.',
  'The dust settles on another promotion: {name}, Job Level {level}, {title}.',
  '{name} can now sign the paperwork as {title}. Job Level {level} makes it official.',
  'Tools down for a moment! {name} just became a Job Level {level} {title}.',
  'The next rung holds firm. {name} climbs to Job Level {level}: {title}.',
  '{name} adds {title} to the resume at Job Level {level}. References available from the rocks.',
  'A well-earned promotion emerges from the dust: {name}, {title}, Job Level {level}.',
  '{name} reaches Job Level {level}. The new {title} gets first pick of the biscuits.',
  'The guild stamp comes down with a satisfying thunk: {name}, Job Level {level}, {title}.',
  '{name} is now a {title} at Job Level {level}. The learning curve has tool marks.',
  'Another good day at the bench for {name}. Job Level {level}, title: {title}.',
  'The noticeboard has news, and sawdust: {name} reaches Job Level {level} as a {title}.',
  '{name} takes a bow, then picks the tools back up. Job Level {level}: {title}.',
  'New badge, familiar calluses. {name} becomes a Job Level {level} {title}.',
  '{name} reaches Job Level {level} and claims the title of {title}. Hard hat tipped.',
  'The workshop cat approves of {name}, the new Job Level {level} {title}.',
  'Progress with a practical streak: {name} earns Job Level {level} and the title {title}.',
  '{name} reports for duty as a {title}, Job Level {level}. Pencil behind the ear, naturally.',
  'The guild ledger gets a proud little underline: {name}, {title}, Job Level {level}.',
  '{name} reaches Job Level {level}. Becoming a {title} was clearly no desk job.',
  'The tools are seasoned, and so is {name}: Job Level {level}, {title}.',
  'A promotion worth washing up for! {name} is now a {title} at Job Level {level}.',
  '{name} reaches Job Level {level} as a {title}. The lunch pail remains reassuringly familiar.',
  'The shift ends on a high note for {name}: Job Level {level}, {title}.',
  '{name} makes the grade: {title}, Job Level {level}. The chalk squeaks in celebration.',
  'Another lesson learned, another tool mastered. {name} reaches Job Level {level}: {title}.',
  '{name} earns Job Level {level} and the title {title}. Even the stubborn drawer opens.',
  'The workshop has been expecting this: {name}, Job Level {level}, {title}.',
  '{name} moves up to Job Level {level}. There is a {title} in these very dusty boots.',
  'Guild records confirm a promotion for {name}: {title}, Job Level {level}. Ink still drying.',
  '{name} reaches Job Level {level} as a {title}. Measure twice, celebrate once.',
  'A new chapter in the trade manual stars {name}: Job Level {level}, {title}.',
  '{name} hangs a new {title} nameplate at Job Level {level}. Perfectly level, of course.',
  'The bellows pause for applause. {name} is now a Job Level {level} {title}.',
  '{name} has earned Job Level {level}: {title}. The work speaks louder than the hammer.',
  'Somebody fetch the good mug. {name} just reached Job Level {level} as a {title}.',
  '{name} becomes a {title} at Job Level {level}. A proud moment for the entire tool rack.',
  'The guild meeting has one cheerful agenda item: {name}, {title}, Job Level {level}.',
  '{name} reaches Job Level {level}. The {title} title is a much better fit than the gloves.',
  'A steady hand and a stubborn streak bring {name} to Job Level {level}: {title}.',
  '{name} checks another milestone off the clipboard: Job Level {level}, {title}.',
  'The workbench is crowded with congratulations for {name}, Job Level {level} {title}.',
  '{name} reaches Job Level {level} as a {title}. Nobody mention the first attempt.',
  'That is craftsmanship! {name} earns the title {title} at Job Level {level}.',
  '{name} joins the next shift as a Job Level {level} {title}. Same excellent sandwich.',
  'The guild seal finds its mark: {name} has become a {title}, Job Level {level}.',
  '{name} reaches Job Level {level}. The new {title} knows which end of the tool to hold.',
  'Practice has paid off for {name}: Job Level {level}, {title}. Splinters tell the story.',
  '{name} earns a place higher on the guild roll: {title}, Job Level {level}.',
  'A little grit goes a long way. {name} reaches Job Level {level} as a {title}.',
  '{name} is promoted to {title} at Job Level {level}. The safety lecture stays the same.',
  'The sharpening stone can take a rest. {name} has reached Job Level {level}: {title}.',
  '{name} puts another skill on the shelf: Job Level {level}, {title}. Shelf still standing.',
  'A promotion straight from the workshop floor: {name}, {title}, Job Level {level}.',
  '{name} reaches Job Level {level}. A {title} deserves a chair without the wobbly leg.',
  'The guild scribes have sharpened their quills for {name}: Job Level {level}, {title}.',
  '{name} takes the next step in the trade: {title} at Job Level {level}. Watch the shavings.',
  'A cheer travels down the workroom. {name} just reached Job Level {level}: {title}.',
  '{name} earns Job Level {level} as a {title}. The work apron has seen some things.',
  'Good work gets noticed. {name} is now a {title}, Job Level {level}.',
  '{name} reaches Job Level {level}. The {title} promotion comes with bragging rights at lunch.',
  'The guild roster gains a more impressive line: {name}, {title}, Job Level {level}.',
  '{name} returns from the workshop with a new title: {title}, Job Level {level}.',
  'One more rung, one less excuse for blunt tools. {name} reaches Job Level {level}: {title}.',
  '{name} becomes a {title} at Job Level {level}. An honest day of work has its moments.',
  'The clipboard does not lie: {name} has earned Job Level {level} and the title {title}.',
  '{name} reaches Job Level {level} as a {title}. Please keep the confetti out of the machinery.',
  'The guild raises a mug to {name}, its newest Job Level {level} {title}.',
  '{name} has worked up to Job Level {level}: {title}. The calluses were a clue.',
  'A new {title} is on the job. Congratulations to {name} on Job Level {level}!',
  '{name} reaches Job Level {level}. The {title} title has a nice professional ring to it.',
  'The workshop clock witnesses a fine moment: {name}, Job Level {level}, {title}.',
  '{name} earns the title {title} at Job Level {level}. That deserves a clean page in the ledger.',
  'A promotion slips out from under the sawdust: {name}, Job Level {level}, {title}.',
  '{name} reaches Job Level {level} as a {title}. The guild can spot good workmanship.',
  'Another trade milestone, another reason for tea. {name} is now a Job Level {level} {title}.',
];

function initializeJobLevelTemplates(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS job_level_up_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );`);
  if (db.prepare('SELECT COUNT(*) AS n FROM job_level_up_templates').get().n === 0) {
    const insert = db.prepare('INSERT INTO job_level_up_templates(template) VALUES(?)');
    for (const template of templates) insert.run(template);
  }
  if (!db.prepare('PRAGMA table_info(job_level_events)').all().some(c => c.name === 'template_id')) {
    db.exec('ALTER TABLE job_level_events ADD COLUMN template_id INTEGER REFERENCES job_level_up_templates(id) ON DELETE SET NULL');
  }
  // Backfill existing promotions once without changing their original dates or levels.
  const unassigned = db.prepare('SELECT user_id,level FROM job_level_events WHERE template_id IS NULL').all();
  const choose = db.prepare('SELECT id FROM job_level_up_templates WHERE active=1 ORDER BY RANDOM() LIMIT 1');
  const assign = db.prepare('UPDATE job_level_events SET template_id=? WHERE user_id=? AND level=?');
  for (const event of unassigned) {
    const selected = choose.get();
    if (selected) assign.run(selected.id, event.user_id, event.level);
  }
  db.exec(`DROP TRIGGER IF EXISTS record_job_level;
    CREATE TRIGGER record_job_level AFTER UPDATE OF xp ON user_job_xp
      WHEN CAST((sqrt(1+8*NEW.xp/1000.0)-1)/2 AS INTEGER) >
        CAST((sqrt(1+8*OLD.xp/1000.0)-1)/2 AS INTEGER) BEGIN
      INSERT OR IGNORE INTO job_level_events(user_id,level,template_id)
        VALUES(NEW.user_id,CAST((sqrt(1+8*NEW.xp/1000.0)-1)/2 AS INTEGER),
          (SELECT id FROM job_level_up_templates WHERE active=1 ORDER BY RANDOM() LIMIT 1));
    END;`);
}

module.exports = { initializeJobLevelTemplates };
