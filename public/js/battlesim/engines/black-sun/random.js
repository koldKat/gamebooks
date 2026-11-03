// Draw complete original page combinations without separating their dice or moon.
const moons = ['new', 'crescent', 'half', 'gibbous', 'full'];

export function validateBlackSunPages(pages) {
  if (!Array.isArray(pages) || !pages.length || pages.length > 10000
      || new Set(pages.map(page => page.sourcePdfPage)).size !== pages.length) throw new RangeError('Invalid original page deck');
  for (const page of pages) {
    if (!Number.isSafeInteger(page.sourcePdfPage) || page.sourcePdfPage < 1 || !moons.includes(page.moon)
        || ['base', 'attack', 'defense'].some(key => !Number.isSafeInteger(page[key]) || page[key] < 1 || page[key] > 6)) throw new RangeError('Incomplete original page combination');
  }
  return pages;
}

function choose(pages, random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid random draw');
  return structuredClone(pages[Math.floor(value * pages.length)]);
}

export function drawBlackSunPage(pages, random = Math.random) {
  validateBlackSunPages(pages);
  return choose(pages, random);
}

export function rerollBlackSunPage(page, pages, enabled, random = Math.random) {
  validateBlackSunPages([page]);
  if (!enabled || page.base !== 1) throw new RangeError('Keeper’s Charm cannot reroll this page');
  return drawBlackSunPage(pages, random);
}

// Filtering pages is equivalent to redrawing until the moon leads to an unused attack.
export function drawBlackSunSpecialPage(pages, routes, used, random = Math.random) {
  validateBlackSunPages(pages);
  if (!routes || moons.some(moon => typeof routes[moon] !== 'string' || !routes[moon])
      || !Array.isArray(used) || used.some(route => typeof route !== 'string')) throw new RangeError('Invalid special attack deck');
  const eligible = pages.filter(page => !used.includes(routes[page.moon]));
  if (!eligible.length) throw new RangeError('All moon attacks have already been used');
  const page = choose(eligible, random);
  return {page, section: routes[page.moon]};
}
