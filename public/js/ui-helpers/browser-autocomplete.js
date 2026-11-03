// Disable browser form-history suggestions while retaining credential autofill for login.
const loginFields = new Set(['login-username', 'login-password', 'm-login-user', 'm-login-pass']);
const loginForms = new Set(['login-form', 'm-login-form']);
const selector = 'input, textarea, form';

function disableHistory(field) {
  if (field.tagName === 'FORM') {
    if (!loginForms.has(field.id)) field.setAttribute('autocomplete', 'off');
    return;
  }
  if (loginFields.has(field.id)) return;
  // New-password tells password managers not to fill an existing saved password.
  if (field.getAttribute('autocomplete') === 'new-password') return;
  if (field.getAttribute('autocomplete') !== 'off') field.setAttribute('autocomplete', 'off');
}

function prepare(root) {
  if (root.nodeType !== 1) return;
  if (root.matches(selector)) disableHistory(root);
  if (root.childElementCount) root.querySelectorAll(selector).forEach(disableHistory);
}

prepare(document.body);
// Dialogs and editors are also created after startup. Watching inserted elements
// avoids scanning the whole page on every edit or changing custom suggestion lists.
new MutationObserver(records => {
  for (const record of records) for (const node of record.addedNodes) prepare(node);
}).observe(document.body, {childList: true, subtree: true});

document.addEventListener('focus', event => {
  if (event.target.matches?.('input, textarea')) disableHistory(event.target);
}, true);
