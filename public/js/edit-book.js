// Compatibility facade. Dialog implementations live in edit-book/.
export { formatFileSize, _acceptPdfSelection, _setPdfInlineLabel, _setPdfCurrentLink, _setModalUploadProgress, _setButtonsDisabled, _uploadPdfWithProgress, _adminPdfHref } from './edit-book/uploads.js';
export { validateIsbn, validateIssn, validateAsin } from './edit-book/validators.js';
export { _populateParentBookSelect, _populateSeriesSelect } from './edit-book/selectors.js';
export { _openEditStash, _closeEditStash, _closeAddStash } from './edit-book/stash-dialogs.js';
export { openEditBookModal, closeEditBookModal } from './edit-book/book.js';
export { openEditCompModal } from './edit-book/anthology.js';
export { openEditSeriesModal } from './edit-book/series.js';
export { maxSectionInUse } from './edit-book/graph-analysis.js';
export { setEditBookHooks } from './edit-book/state.js';
export { initEditBook } from './edit-book/init.js';
