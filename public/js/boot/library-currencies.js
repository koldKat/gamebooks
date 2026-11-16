// Put compact-screen currencies above the library heading, below player progress.
let initialized = false;
export function initLibraryCurrencyLayout() {
  if (initialized) return;
  const currencies = document.querySelector('.books-currencies');
  const header = document.querySelector('.books-header-right');
  const titleRow = document.querySelector('.books-header');
  if (!currencies || !header || !titleRow) return;
  initialized = true;
  const query = matchMedia('(max-width: 1366px)');
  const place = () => {
    if (query.matches) titleRow.prepend(currencies);
    else header.prepend(currencies);
  };
  query.addEventListener('change', place);
  place();
}
