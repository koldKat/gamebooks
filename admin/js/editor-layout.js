// Organize existing admin edit controls without replacing their data or handlers.
function section(title, hint, parent) {
  const node = document.createElement('section');
  node.className = 'admin-editor-section';
  parent.append(node);
  const heading = document.createElement('h3');
  heading.textContent = title;
  node.append(heading);
  if (hint) {
    const text = document.createElement('p');
    text.className = 'admin-editor-hint';
    text.textContent = hint;
    node.append(text);
  }
  const fields = document.createElement('div');
  fields.className = 'admin-editor-grid';
  node.append(fields);
  return { node, fields };
}

function field(id, wide = false) {
  const input = document.getElementById(id);
  const row = input.parentElement;
  row.classList.add('admin-editor-field');
  row.style.removeProperty('grid-column');
  if (wide) row.classList.add('admin-editor-wide');
  const oldLabel = row.querySelector('.section-title');
  if (oldLabel && oldLabel.tagName !== 'LABEL') {
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = oldLabel.textContent;
    oldLabel.replaceWith(label);
  } else oldLabel?.classList.remove('section-title');
  input.setAttribute('autocomplete', id === 'ue-password' ? 'new-password' : 'off');
  return row;
}

export function prepareBookEditor() {
  const form = document.getElementById('book-edit-form');
  if (form.dataset.organized) return;
  form.dataset.organized = 'true';
  const actions = form.lastElementChild;
  const error = document.getElementById('bef-error');
  error.setAttribute('role', 'alert');
  const cover = document.getElementById('bef-cover-img').parentElement.parentElement;
  cover.className = 'admin-editor-cover';
  const identity = section('Book details', '', form);
  identity.fields.append(field('bef-name', true), field('bef-authors', true), field('bef-description', true));
  const overview = document.createElement('div');
  overview.className = 'admin-editor-overview';
  form.append(overview);
  overview.append(cover, identity.node);
  const reading = section('Reading', 'Section counts control progress and completion.', form);
  reading.fields.append(...['bef-sections', 'bef-max-section', 'bef-discoverable', 'bef-pages'].map(id => field(id)));
  const files = section('Files', 'Uploads and removals take effect when you save.', form);
  files.fields.append(document.getElementById('bef-pdf-link').parentElement);
  files.fields.firstElementChild.classList.add('admin-editor-wide');
  const identifiers = section('Identifiers', '', form);
  identifiers.fields.append(...['bef-isbn', 'bef-asin', 'bef-issn'].map(id => field(id)));
  const collection = section('Series & anthology', '', form);
  collection.fields.append(field('bef-series'), field('bef-series-num'), field('bef-parent'), field('bef-order'));
  // Keep the existing datalist and parent-row hook used during population.
  const datalist = document.getElementById('bef-series-list');
  const parentRow = document.getElementById('bef-parent-row');
  const parentField = collection.fields.children[2];
  const orderField = collection.fields.children[3];
  parentRow.replaceChildren(parentField, orderField);
  parentRow.className = 'admin-editor-parent-row';
  parentRow.removeAttribute('style');
  collection.fields.append(parentRow);
  const visibility = section('Visibility & type', '', form);
  visibility.fields.append(document.getElementById('bef-public').closest('label'), document.getElementById('bef-container').closest('label'));
  const type = document.getElementById('bef-container').closest('label');
  type.lastChild.textContent = ' Anthology';
  form.replaceChildren(overview, reading.node, files.node, collection.node, identifiers.node, visibility.node, datalist, error, actions);
  actions.classList.add('admin-editor-actions');
  actions.prepend(document.getElementById('bef-cancel'));
}

export function prepareUserEditor() {
  const form = document.getElementById('user-edit-form');
  if (form.dataset.organized) return;
  form.dataset.organized = 'true';
  const actions = form.lastElementChild;
  const error = document.getElementById('ue-error');
  error.setAttribute('role', 'alert');
  const account = section('Account', '', form);
  account.fields.append(...['ue-username', 'ue-display-name', 'ue-email', 'ue-password'].map(id => field(id)));
  document.getElementById('ue-password').type = 'password';
  const visibility = section('Visibility', '', form);
  visibility.fields.append(document.getElementById('ue-public-profile').closest('label'), document.getElementById('ue-hide-feed').closest('label'));
  form.replaceChildren(account.node, visibility.node, error, actions);
  actions.classList.add('admin-editor-actions');
  actions.prepend(document.getElementById('ue-cancel'));
}
