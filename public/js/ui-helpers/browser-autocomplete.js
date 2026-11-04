// Disable browser form-history suggestions while retaining credential autofill for login.
const loginFields = new Set(['login-username', 'login-password', 'm-login-user', 'm-login-pass']);
const loginForms = new Set(['login-form', 'm-login-form']);
const selector = 'input, textarea, form';
const isolatedTypes = new Set(['text', 'search', 'number', 'tel', 'url', 'email', 'password']);

function isolatedForm(id) {
  const form = document.createElement('form');
  form.id = id;
  form.hidden = true;
  form.autocomplete = 'off';
  form.noValidate = true;
  form.addEventListener('submit', event => event.preventDefault());
  document.body.append(form);
  return form;
}

// Unowned fields otherwise share a browser autofill group with the profile's
// password fields. Chrome can mistake section entry and searches for signup email.
const ordinaryFields = isolatedForm('app-ordinary-fields');
const accountFields = isolatedForm('app-account-fields');

function disableHistory(field) {
  if (field.tagName === 'FORM') {
    if (!loginForms.has(field.id)) field.setAttribute('autocomplete', 'off');
    return;
  }
  if (loginFields.has(field.id)) return;
  if (field.tagName === 'TEXTAREA' || isolatedTypes.has(field.type)) {
    if (!field.form || field.form === ordinaryFields || field.form === accountFields) {
      const owner = field.type === 'password' || field.type === 'email' ? accountFields : ordinaryFields;
      field.setAttribute('form', owner.id);
    }
    field.setAttribute('data-lpignore', 'true');
    field.setAttribute('data-1p-ignore', '');
  }
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
