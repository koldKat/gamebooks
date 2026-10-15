const installed = new WeakMap();
const overlays = 'dialog[open], [id$="-overlay"].active, [id$="-dialog"].active, .modal-overlay.active, .inv-overlay.active, .pub-overlay.active, .img-lightbox.active, .inv-ctx-menu, #video-modal';
const closeButtons = 'button[data-dialog-close], .modal-close-btn, .inv-close-btn, .pub-close-btn, .admin-editor-close, button[id$="-close"], button[id$="-close-btn"], button[id$="-close-x"]';
const cancelButtons = 'button[id$="-cancel"], button[id$="-cancel-btn"], #inv-edit-done, #eq-edit-done';

export function installEscapeHandling(win = window) {
  const doc = win.document;
  if (installed.get(win) === doc) return;
  installed.set(win, doc);
  const visible = element => element.getClientRects().length > 0
    && win.getComputedStyle(element).visibility !== 'hidden';
  const topmost = elements => [...elements].filter(visible).reduce((top, element) => {
    if (!top) return element;
    if (top.matches('dialog[open]') !== element.matches('dialog[open]')) return element.matches('dialog[open]') ? element : top;
    const z = node => Number.parseInt(win.getComputedStyle(node).zIndex, 10) || 0;
    return z(element) >= z(top) ? element : top;
  }, null);

  // Window capture runs before legacy input/document handlers can dismiss several layers.
  win.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
    // Native select menus own their first Escape; do not dismiss the enclosing dialog.
    try {
      if (event.target.closest?.('select')?.matches(':open')) {
        event.stopImmediatePropagation();
        return;
      }
    } catch { /* Older browsers do not expose native select popup state. */ }
    const overlay = topmost(doc.querySelectorAll(overlays));
    const dropdown = topmost((overlay || doc).querySelectorAll('.autocomplete-dropdown.open, .party-invite-dropdown'));
    if (!dropdown && !overlay) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    if (dropdown) {
      dropdown.classList.remove('open');
      dropdown.querySelectorAll('.ac-active').forEach(item => item.classList.remove('ac-active'));
      for (const input of doc.querySelectorAll('[aria-controls]')) {
        if (input.getAttribute('aria-controls') !== dropdown.id) continue;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
      }
      if (dropdown.classList.contains('party-invite-dropdown')) dropdown.remove();
      dropdown.dispatchEvent(new win.Event('autocomplete-dismiss'));
      return;
    }
    if (overlay.getAttribute('aria-busy') === 'true') return;
    if (overlay.classList.contains('inv-ctx-menu')) {
      overlay.dispatchEvent(new win.Event('escape-dismiss'));
      return;
    }
    if (overlay.matches('dialog[open]')) {
      const cancel = new win.Event('cancel', { cancelable: true });
      if (overlay.dispatchEvent(cancel)) overlay.close();
      return;
    }
    const button = overlay.querySelector(closeButtons) || overlay.querySelector(cancelButtons);
    // Reuse close callbacks and their busy/upload guards, never strip overlay classes here.
    if (button) {
      if (!button.disabled) button.click();
    } else if (overlay.classList.contains('img-lightbox')) {
      overlay.click();
    }
  }, true);

  win.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
    const frame = win.frameElement;
    if (!frame) return;
    const parent = frame.ownerDocument.defaultView;
    const forwarded = new parent.KeyboardEvent('keydown', { key: 'Escape', bubbles: true,
      cancelable: true, repeat: event.repeat });
    if (!frame.dispatchEvent(forwarded)) event.preventDefault();
  });
  const wireFrame = frame => {
    try { installEscapeHandling(frame.contentWindow); } catch { /* Cross-origin frames own their keyboard events. */ }
  };
  doc.querySelectorAll('iframe').forEach(wireFrame);
  doc.addEventListener('load', event => {
    if (event.target.tagName === 'IFRAME') wireFrame(event.target);
  }, true);
}

if (typeof window !== 'undefined') installEscapeHandling();
