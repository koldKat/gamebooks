import { bootState } from './state.js';
import { apiFetch } from '../core/state.js';
import { _ensureLiveTabControllerStarted } from '../core/livetab.js';
import { getCachedBooks, setCachedBooks, setCachedAllSeries } from '../books.js';
import { _cancelForumReveal } from './helpers.js';
import { showBooks, loadSessionProfile } from './landing.js';
import { showMain } from './play-screen.js';

export async function navigateToBook(bookId) {
  // Close the forum before navigating to the play view.
  document.getElementById('forum-modal-overlay')?.classList.remove('active');
  _cancelForumReveal();
  _ensureLiveTabControllerStarted();
  const numId = /^\d+$/.test(String(bookId)) ? +bookId : bookId;
  let book = getCachedBooks()?.find(b => b.id === numId || b.id === bookId);
  if (!book) {
    try {
      const needProfile = bootState._currentUserId === null;
      const [booksRes, , seriesRes] = await Promise.all([
        apiFetch('/api/books'),
        needProfile ? loadSessionProfile() : Promise.resolve(null),
        apiFetch('/api/series'),
      ]);
      const books = await booksRes.json();
      setCachedBooks(books);
      const seriesData = seriesRes.ok ? await seriesRes.json() : [];
      if (Array.isArray(seriesData)) setCachedAllSeries(seriesData);
      book = books.find(b => b.id === numId || b.id === bookId);
    } catch {}
  }
  if (book) {
    const id = /^\d+$/.test(String(book.id)) ? +book.id : book.id;
    const isCreator = book.created_by === null || book.created_by === bootState._currentUserId;
    const ownCover = book.cover_path ? `/covers/${book.cover_path}` : null;
    const parentCover = (!ownCover && book.parent_book_id)
      ? (() => {
          const parent = getCachedBooks()?.find(b => b.id === book.parent_book_id && b.cover_path);
          return parent?.cover_path ? `/covers/${parent.cover_path}` : null;
        })()
      : null;
    await showMain(id,
      book.isbn   || null, book.issn   || null, book.asin || null,
      ownCover || parentCover || null,
      book.pdf_path || null,
      book.pages  || null, book.authors || null, book.description || null,
      book.discoverable_sections ?? null, !!book.is_public, isCreator,
      book.series_name || null, book.series_number || null,
      !!book.is_container, book.parent_book_id ?? null, book.book_order ?? null,
      book.epub_path || null);
  } else {
    await showBooks();
  }
}

export { showLogin, showBooks } from './landing.js';
export { showMain } from './play-screen.js';
export { _lockView, _openMobilePanel } from './navigation.js';
