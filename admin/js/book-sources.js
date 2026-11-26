import {
  _pageState, _tableData, api, emptyRow, getFiltered, mkEditBtn, naturalCompareByName,
  renderPaged, setRowFilter, setSearchFields, storeData, wireTableSearch,
} from './core.js';
import { editFields } from './editor.js';
import { liveReadingBadge } from '/js/covers/badges.js';
import { loadingHtml } from '/js/ui-helpers/loading.js';

const kindLabels = { buy: 'Buy', play: 'Play Online', download: 'Download' };

function renderSource(cell, url) {
  if (!url) {
    cell.textContent = 'Missing';
    cell.classList.add('book-source-missing');
    return;
  }
  const source = document.createElement('a');
  source.href = url;
  source.textContent = url;
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  cell.append(source);
}

function renderBookSources(books) {
  const body = document.getElementById('book-sources-body');
  body.replaceChildren();
  if (!books.length) {
    emptyRow(body, 4, 'No matching books.');
    return;
  }
  const rows = document.createDocumentFragment();
  for (const book of books) {
    const row = document.createElement('tr');
    const name = row.insertCell();
    name.textContent = book.name;
    if (book.hasLiveReading) {
      name.insertAdjacentHTML('beforeend', liveReadingBadge(book.restrictedReadingBadge));
    }
    const id = document.createElement('small');
    id.textContent = ` #${book.id}`;
    name.append(id);
    if (book.sourceBookId !== book.id) {
      const anthology = document.createElement('small');
      anthology.className = 'book-source-owner';
      anthology.textContent = `Source: ${book.sourceBookName}`;
      name.append(anthology);
    }
    const type = row.insertCell();
    type.className = 'book-source-type';
    type.textContent = kindLabels[book.kind] ?? '';
    const url = row.insertCell();
    url.className = 'book-source-url';
    renderSource(url, book.url);
    row.insertCell().append(mkEditBtn(() => editFields({
      title: `Edit Source: ${book.sourceBookName}`,
      fields: [
        { key: 'url', label: 'Source URL', type: 'url', value: book.url },
        { key: 'kind', label: 'Source Type', options: Object.values(kindLabels), value: kindLabels[book.kind] ?? kindLabels.buy },
      ],
      async save({ url, kind }) {
        const sourceKind = Object.keys(kindLabels).find(key => kindLabels[key] === kind);
        const saved = await api('PUT', `/api/admin/books/${book.sourceBookId}/source`, { url, kind: sourceKind });
        for (const related of _tableData['book-sources']) {
          if (related.sourceBookId === book.sourceBookId) Object.assign(related, saved);
        }
      },
      afterSave: renderCurrentPage,
    })));
    rows.append(row);
  }
  body.append(rows);
}

function renderCurrentPage() {
  const books = _tableData['book-sources'];
  const missing = books.filter(book => !book.url).length;
  document.getElementById('book-sources-meta').textContent =
    `${(books.length - missing).toLocaleString()} available · ${missing.toLocaleString()} missing`;
  renderPaged('book-sources', getFiltered('book-sources'), renderBookSources);
}

export async function loadBookSources() {
  const body = document.getElementById('book-sources-body');
  body.replaceChildren();
  document.getElementById('book-sources-pagination').replaceChildren();
  const status = body.insertRow().insertCell();
  status.colSpan = 4;
  status.innerHTML = loadingHtml();
  try {
    const books = await api('GET', '/api/admin/book-sources');
    books.sort((a, b) => naturalCompareByName(a, b) || a.id - b.id);
    storeData('book-sources', books);
    renderCurrentPage();
  } catch (error) {
    body.replaceChildren();
    emptyRow(body, 4, error.message);
  }
}

setSearchFields('book-sources', ['name', 'id', 'url', 'kind', 'sourceBookName']);
wireTableSearch('book-sources', 'book-sources-search', 'book-sources-search-clear', renderBookSources);
const filter = document.getElementById('book-sources-filter');
const kindFilter = document.getElementById('book-sources-kind');
setRowFilter('book-sources', book => {
  const matchesAvailability = filter.value === 'all' || Boolean(book.url) === (filter.value === 'available');
  return matchesAvailability && (kindFilter.value === 'all' || book.kind === kindFilter.value);
});
function applyFilters() {
  if (!_tableData['book-sources']) return;
  _pageState['book-sources'].page = 0;
  renderCurrentPage();
}
filter.addEventListener('change', applyFilters);
kindFilter.addEventListener('change', applyFilters);
