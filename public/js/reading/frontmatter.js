// Book-specific presentation; imported text remains unchanged in the database.
export function formatFrontmatter(mount, bookId, text, document) {
  if (Number(bookId) !== 263) return false;
  mount.className += ' reading-frontmatter--structured';
  const headings = new Set(['SKILL, STAMINA AND LUCK', 'BATTLES', 'LUCK', 'STAMINA AND PROVISIONS', 'EQUIPMENT AND POTIONS']);
  const paragraphs = text.replace(/\r\n?/g, '\n')
    .replace(/ (YOU have been on the island|A wager brought you to the island)/g, '\n\n$1')
    .replace(/ (Before setting off on your adventure|SKILL, STAMINA and LUCK scores change constantly|You may also take one magic potion)/g, '\n\n$1')
    .split(/\n\s*\n/);
  for (const paragraph of paragraphs) {
    let pending = [], list = null;
    const flush = () => {
      if (!pending.length) return;
      const p = document.createElement('p');
      const value = pending.join(' ');
      const label = 'Using Luck in Battles:';
      if (value.startsWith(label)) {
        const strong = document.createElement('strong');
        strong.textContent = label;
        p.append(strong, document.createTextNode(value.slice(label.length)));
      } else p.textContent = value;
      mount.append(p);
      pending = [];
    };
    for (const raw of paragraph.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (headings.has(line)) {
        flush(); list = null;
        const heading = document.createElement('h3');
        heading.textContent = line;
        mount.append(heading);
      } else if (/^\d+\.\s/.test(line)) {
        flush();
        if (!list) { list = document.createElement('ol'); mount.append(list); }
        const item = document.createElement('li');
        item.textContent = line.replace(/^\d+\.\s+/, '');
        list.append(item);
      } else {
        list = null;
        pending.push(line);
      }
    }
    flush();
  }
  return true;
}
