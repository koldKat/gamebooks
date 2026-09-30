// Shared admin editor chrome. Existing forms are moved, preserving their handlers.
let editorSequence = 0;

export function openEditor({ title, content, onClose, focus }) {
  const previousFocus = document.activeElement;
  const placeholder = document.createComment('editor form');
  const moved = !!content.parentNode;
  if (moved) content.before(placeholder);
  const oldDisplay = content.style.display;
  const dialog = document.createElement('dialog');
  dialog.className = 'admin-editor';
  const header = document.createElement('header');
  header.className = 'admin-editor-header';
  const heading = document.createElement('h2');
  heading.id = `admin-editor-title-${++editorSequence}`;
  heading.textContent = title;
  dialog.setAttribute('aria-labelledby', heading.id);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'admin-editor-close';
  closeButton.setAttribute('aria-label', 'Close editor');
  closeButton.textContent = '×';
  header.append(heading, closeButton);
  const body = document.createElement('div');
  body.className = 'admin-editor-body';
  content.style.display = '';
  body.append(content);
  dialog.append(header, body);
  document.body.append(dialog);
  let busy = false;
  let disabledControls = [];
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (moved) placeholder.replaceWith(content);
    content.style.display = oldDisplay;
    dialog.remove();
    onClose?.();
    if (previousFocus?.isConnected) previousFocus.focus();
  };
  const close = () => {
    if (busy || !dialog.open) return;
    dialog.close();
    // Native close events are queued; restore shared forms before a caller refreshes them.
    cleanup();
  };
  const setBusy = value => {
    if (busy === value) return;
    busy = value;
    dialog.setAttribute('aria-busy', String(value));
    if (value) {
      disabledControls = [...dialog.querySelectorAll('button, input, select, textarea')].filter(el => !el.disabled);
      disabledControls.forEach(el => { el.disabled = true; });
    } else {
      disabledControls.forEach(el => { el.disabled = false; });
      disabledControls = [];
    }
  };
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  closeButton.addEventListener('click', close);
  dialog.addEventListener('close', cleanup, { once: true });
  dialog.showModal();
  (focus ? content.querySelector(focus) : content.querySelector('input:not([type="hidden"]), textarea, select'))?.focus();
  return { close, setBusy, dialog };
}

export function editFields({ title, fields, save, afterSave }) {
  const form = document.createElement('form');
  form.className = 'admin-editor-fields';
  const controls = {};
  for (const field of fields) {
    const label = document.createElement('label');
    label.className = field.type === 'checkbox' ? 'admin-editor-toggle' : 'admin-editor-field';
    const text = document.createElement('span');
    text.textContent = field.label;
    const input = document.createElement(field.type === 'textarea' ? 'textarea' : field.options ? 'select' : 'input');
    if (input.tagName === 'INPUT') input.type = field.type || 'text';
    if (field.options) for (const value of field.options) {
      const option = document.createElement('option');
      option.value = value; option.textContent = value;
      input.append(option);
    }
    input.value = field.value ?? '';
    input.checked = !!field.value;
    input.required = !!field.required;
    if (field.type === 'textarea') input.rows = field.rows || 4;
    if (field.code) input.className = 'admin-editor-code';
    label.append(text, input);
    form.append(label);
    controls[field.key] = input;
  }
  const error = document.createElement('p');
  error.className = 'admin-editor-error';
  error.setAttribute('role', 'alert');
  const actions = document.createElement('div');
  actions.className = 'admin-editor-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.className = 'btn'; cancel.textContent = 'Cancel';
  const submit = document.createElement('button');
  submit.type = 'submit'; submit.className = 'btn btn-info'; submit.textContent = 'Save';
  actions.append(cancel, submit);
  form.append(error, actions);
  const editor = openEditor({ title, content: form });
  cancel.addEventListener('click', editor.close);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (editor.dialog.getAttribute('aria-busy') === 'true') return;
    const values = Object.fromEntries(fields.map(field => [field.key,
      field.type === 'checkbox' ? controls[field.key].checked : controls[field.key].value.trim()]));
    error.textContent = '';
    editor.setBusy(true);
    submit.textContent = 'Saving...';
    try {
      await save(values);
    } catch (err) {
      error.textContent = err.message || 'Save failed.';
      return;
    } finally {
      editor.setBusy(false);
      submit.textContent = 'Save';
    }
    editor.close();
    await afterSave?.();
  });
  return editor;
}
