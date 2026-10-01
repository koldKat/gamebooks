// State shared by screen navigation and event bindings. No DOM side effects.
// Mirrors the server's narrow app-XP visibility exception, not admin access.
export const APP_XP_EXTRA_USER_ID = 17;

export const bootState = {
  _isAdmin: false,
  _canSeeAppXp: false,
  _hasPdfAccess: false,
  _suppressHistory: false,
  _forumRevealPending: null,
  ctxNodeId: null,
  ctxCanvasPos: null,
  _currentBook: {
    isbn: null, issn: null, asin: null, pdfPath: null, pages: null,
    authors: null, description: null, discoverableSections: null,
    isPublic: false, seriesName: null, seriesNumber: null,
    isContainer: false, parentBookId: null, bookOrder: null,
    seriesId: null, isOpenWorld: false,
  },
  _currentUserId: null,
  _viewLockTarget: null,
  _viewLockUntil: 0,
  _mobilePanelWired: false,
  _mousedownOnOverlay: null,
};
