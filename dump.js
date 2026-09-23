const Database = require('/home/koldKat/Media/Shares/People/Alex/Work/Claude/gamebooks/node_modules/better-sqlite3');
const db = new Database('/home/koldKat/Media/Shares/People/Alex/Work/Claude/gamebooks/database.sqlite');
const bookId = process.argv[2];
const rows = db.prepare('SELECT section_id, html FROM book_sections WHERE book_id=? ORDER BY CAST(section_id AS INTEGER)').all(bookId);
let out = '';
for (const r of rows) {
  const paras = [...r.html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()).filter(Boolean);
  const body = paras.length ? paras.join('\n¶\n') : r.html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  out += '=== ' + r.section_id + ' (' + paras.length + ' paragraphs) ===\n' + body + '\n\n';
}
const path = `/tmp/claude-1000/-home-koldKat-Media-Shares-People-Alex-Work-Claude-gamebooks/ea80e192-4d54-4cf2-9cb4-5a07833f98c2/scratchpad/read${bookId}.txt`;
require('fs').writeFileSync(path, out);
console.log('sections:', rows.length, 'chars:', out.length, 'path:', path);
