// Remove retired sample data before the cached library is displayed.
export function retireSampleCache() {
  try { sessionStorage.removeItem('demoActive'); } catch {}
  try {
    const key = 'books_list_v1';
    const books = JSON.parse(localStorage.getItem(key) || 'null');
    if (!Array.isArray(books) || !books.some(book => book && typeof book === 'object' && 'is_demo' in book)) return;
    const realBooks = books.filter(book => !book?.is_demo).map(book => {
      if (!book || typeof book !== 'object') return book;
      const { is_demo, ...realBook } = book;
      return realBook;
    });
    try { localStorage.setItem(key, JSON.stringify(realBooks)); }
    catch { localStorage.removeItem(key); }
  } catch {}
}
