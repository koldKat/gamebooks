import { bootState } from './state.js';
import { setUsername, apiFetch, setCurrentUserLevel, setBonusUndos, setBonusFastTravels } from '../core/state.js';
import { updateCoinsDisplay } from '../progression/shop.js';
import { updateAvatarUI } from '../account/profile.js';
import { _ensureLiveTabControllerStarted, _connectAppXpSSE } from '../core/livetab.js';
import { refreshAppXp } from '../progression/app-xp.js';
import { getCachedBooks, setCachedBooks, setCachedAllSeries, setCurrentUserId } from '../books.js';
import { _processRewardSnapshot } from '../progression/rewards.js';
import { resolveIsAdmin, registerAuthor, registerContributor } from '../account/user.js';
import { _cancelForumReveal } from './helpers.js';
import { showBooks } from './landing.js';
import { showMain } from './play-screen.js';
import { APP_XP_EXTRA_USER_ID } from './state.js';

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
      const [booksRes, profileRes, seriesRes] = await Promise.all([
        apiFetch('/api/books'),
        needProfile ? apiFetch('/api/profile') : Promise.resolve(null),
        apiFetch('/api/series'),
      ]);
      const books = await booksRes.json();
      setCachedBooks(books);
      const seriesData = seriesRes.ok ? await seriesRes.json() : [];
      if (Array.isArray(seriesData)) setCachedAllSeries(seriesData);
      if (profileRes) {
        const profile = await profileRes.json();
        _processRewardSnapshot(profile);
        if (profile.id) { bootState._currentUserId = profile.id; setCurrentUserId(bootState._currentUserId); }
        bootState._isAdmin = resolveIsAdmin(profile);
        bootState._canSeeAppXp = bootState._isAdmin || profile.id === APP_XP_EXTRA_USER_ID;
        bootState._hasPdfAccess = !!profile.pdfAccess || bootState._isAdmin;
        refreshAppXp();
        _connectAppXpSSE();
        if (profile.username) {
          setUsername(profile.username);
          registerAuthor(profile.username, !!profile.isAuthor, profile.displayName);
          registerContributor(profile.username, !!profile.isContributor);
        }
        setBonusUndos(profile.bonusUndos || 0);
        setBonusFastTravels(profile.bonusFastTravels || 0);
        setCurrentUserLevel(profile.level || 0);
        updateCoinsDisplay(profile.coinsBalance || 0);
        updateAvatarUI(profile.avatarUrl || null);
      }
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

export { showLogin, showBooks, _updateUsernameTooltip } from './landing.js';
export { showMain } from './play-screen.js';
export { _lockView, _openMobilePanel } from './navigation.js';
