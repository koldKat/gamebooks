// Show aggregate country counts with the same flag images used in admin.
import { setTooltipContent } from './tooltip.js';

const names = new Intl.DisplayNames(['en'], { type: 'region' });

export function bindCountryTooltip(element, countries = []) {
  const totals = new Map();
  for (const row of countries) {
    const code = /^[A-Z]{2}$/.test(row.country) ? row.country : '';
    totals.set(code, (totals.get(code) || 0) + row.count);
  }
  const rows = [...totals].map(([code, count]) => ({
    code, count, name: code ? names.of(code) : 'Unknown',
  })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  element.dataset.tooltip = 'Users by country';
  setTooltipContent(element, tip => {
    const list = document.createElement('div');
    list.className = 'tooltip-country-list';
    for (const row of rows) {
      const item = document.createElement('div');
      item.className = 'tooltip-country-row';
      const flag = document.createElement(row.code ? 'img' : 'span');
      if (row.code) {
        flag.src = `https://flagcdn.com/w20/${row.code.toLowerCase()}.png`;
        flag.width = 20; flag.height = 15; flag.alt = '';
      }
      const label = document.createElement('span');
      label.textContent = row.name;
      const count = document.createElement('span');
      count.textContent = row.count.toLocaleString();
      item.append(flag, label, count);
      list.append(item);
    }
    tip.append(list);
  });
}
