// Book-specific presentation; imported text remains unchanged in the database.
export function formatFrontmatter(mount, bookId, text, document) {
  const id = Number(bookId);
  if (id === 252 || id === 255 || id === 256 || id === 267) {
    mount.className += ' reading-frontmatter--structured';
    const headings = new Set(['INTRODUCTION', 'BACKGROUND', 'Skill, Stamina and Luck', 'Battles',
      'Fighting More Than One Opponent', 'Luck', 'Using Luck in Battles', 'More About Your Attributes',
      'Skill', 'Stamina', 'Special Skills', 'Warrior Skills', 'Priest Skills', 'Honour', 'Time',
      'Equipment', 'RUDDLESTONE', 'ADVENTURE SHEET', 'REGIONAL MAP', 'Poison',
      'Fighting More Than One Opponent', 'Stamina and Provisions', 'Alternative Dice',
      'PORT OF CRABS', 'Equipment and Gold', 'MONSTER ENCOUNTER BOXES',
      'HOW WILL YOU START YOUR ADVENTURE?', 'IF YOU ARE NEW TO FIGHTING FANTASY...',
      'IF YOU HAVE PLAYED FIGHTING FANTASY BEFORE...', 'ALLANSIA',
      'HOW TO FIGHT THE CREATURES IN THE DUNGEON ON BLOOD ISLAND',
      'SKILL, STAMINA AND LUCK', 'BATTLES', 'ESCAPING', 'LUCK', 'HOW TO TEST YOUR LUCK',
      'USING LUCK IN BATTLES', 'RESTORING SKILL, STAMINA AND LUCK', 'SKILL',
      'STAMINA AND PROVISIONS', 'POTIONS', 'HINTS ON PLAY', 'ALTERNATIVE DICE']);
    const mapAlt = ({252: 'Original map of Ruddlestone', 255: 'Original regional map of the Pirate Coast',
      256: 'Original map of the Port of Crabs', 267: 'Original map of Allansia'})[id];
    for (const paragraph of text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
      const image = paragraph.match(/^<figure><img src="(\/api\/books\/(\d+)\/reading-images\/[a-f0-9]{64}\.png)" alt="([^"]+)" loading="lazy"><\/figure>$/);
      if (image && Number(image[2]) === id && image[3] === mapAlt) {
        const figure = document.createElement('figure');
        const img = document.createElement('img');
        img.src = image[1];
        img.alt = mapAlt;
        img.loading = 'lazy';
        figure.append(img);
        mount.append(figure);
      } else {
        const node = document.createElement(headings.has(paragraph) ? 'h3' : 'p');
        node.textContent = paragraph;
        mount.append(node);
      }
    }
    return true;
  }
  if (Number(bookId) !== 263) return false;
  mount.className += ' reading-frontmatter--structured';
  const headings = new Set(['SKILL, STAMINA AND LUCK', 'BATTLES', 'LUCK', 'STAMINA AND PROVISIONS', 'EQUIPMENT AND POTIONS',
    'HOW WILL YOU START YOUR ADVENTURE?', 'IF YOU ARE NEW TO FIGHTING FANTASY...',
    'IF YOU HAVE PLAYED FIGHTING FANTASY BEFORE...', 'BACKGROUND', 'ALLANSIA',
    'HOW TO FIGHT THE CREATURES OF ASSASSINS OF ALLANSIA', 'USING LUCK IN BATTLES',
    'RESTORING SKILL, STAMINA AND LUCK', 'Skill', 'Luck', 'HINTS ON PLAY', 'ALTERNATIVE DICE',
    'ADVENTURE SHEET', 'ENEMY ENCOUNTER SHEET']);
  const paragraphs = text.replace(/\r\n?/g, '\n')
    .replace(/ (YOU have been on the island|A wager brought you to the island)/g, '\n\n$1')
    .replace(/ (Before setting off on your adventure|SKILL, STAMINA and LUCK scores change constantly|You may also take one magic potion)/g, '\n\n$1')
    .split(/\n\s*\n/);
  for (const paragraph of paragraphs) {
    const image = paragraph.match(/^<figure><img src="(\/api\/books\/263\/reading-images\/[a-f0-9]{64}\.png)" alt="Original map of Allansia" loading="lazy"><\/figure>$/);
    if (image) {
      const figure = document.createElement('figure');
      const img = document.createElement('img');
      img.src = image[1];
      img.alt = 'Original map of Allansia';
      img.loading = 'lazy';
      figure.append(img);
      mount.append(figure);
      continue;
    }
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
