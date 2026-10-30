// Restrict automatic updates to an idle main page with no work to lose.
import { currentBookId, hasUnsavedStateSaves } from '../core/state.js';

export function canRefreshMainPage() {
  if (!['/', '/index.html'].includes(location.pathname) ||
      location.hash.startsWith('#book/') || history.state?.view === 'book' ||
      currentBookId != null || document.visibilityState !== 'visible' || hasUnsavedStateSaves()) return false;
  const visible = element => !!element?.getClientRects().length;
  if (!visible(document.getElementById('landing-wrapper')) ||
      visible(document.getElementById('main-screen'))) return false;
  // Preserve dialogs, including simulator setup and text that has not been submitted.
  if ([...document.querySelectorAll('[id$="-overlay"].active, .modal-overlay.active, .pub-overlay.active, .inv-overlay.active, dialog[open], [role="dialog"]')].some(visible)) return false;
  return ![...document.querySelectorAll('input, textarea, select, [contenteditable="true"]')].some(field => {
    if (!visible(field) || field.disabled || field.readOnly) return false;
    if (field.isContentEditable) return true;
    if (field.type === 'file') return !!field.files?.length;
    if (['checkbox', 'radio'].includes(field.type)) return field.checked !== field.defaultChecked;
    if (field.tagName === 'SELECT') {
      const initial = [...field.options].findIndex(option => option.defaultSelected);
      return field.selectedIndex !== Math.max(0, initial);
    }
    return field.value !== field.defaultValue;
  });
}
