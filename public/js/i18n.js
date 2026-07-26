// ── Translations ─────────────────────────────────────────────────────────────

const translations = {
  en: {
    'app.title':   'Gamebook Tracker',
    'app.tagline': 'Map every branch across all your playthroughs',

    'auth.username': 'Username',
    'auth.password': 'Password',
    'auth.login':    'Log In',
    'auth.register': 'Create Account',
    'auth.logout':   'Log out',

    'books.title':        'My Books',
    'books.untitled':     'Untitled Book',
    'books.empty':        'No books yet. Create one below.',
    'books.open':         'Open',
    'books.sections':     '{n} sections',

    'stats.mapped':       'Mapped',
    'stats.discovered':   'Discovered',
    'stats.playthroughs': 'Playthroughs',

    'runs.header':  'Runs',
    'runs.new':     '+ New',
    'runs.empty':   'No runs yet.',
    'runs.run':     'Run {n}',
    'runs.section': 'Section {n}',
    'runs.victory':     '★ Victory',
    'runs.death':       '✝ Loss',
    'runs.battle':      '⚔ Battle',
    'runs.battle_death': 'Battle Death ⚔',
    'runs.load':    'Load',
    'runs.this':    'This run',
    'runs.path':    'Run {n} path',
    'runs.undo':        'Undo ({n} left)',
    'runs.fasttravel':  'Fast Travel ({n} left)',
    'runs.pick_start':         'Choose a starting section',
    'runs.pick_start_default': 'default',
    'runs.pick_start_custom':  'Type a section',

    'record.choices.label':       'Choices from this section:',
    'record.choices.placeholder': 'e.g. 34,45,78 or -1 loss or 0 win',
    'record.btn':     'Record & Choose',
    'record.where':   'Where did you go?',
    'record.auto':    'Auto-advancing to {dest}\u2026',
    'record.section': 'Current section',
    'record.death':   'Loss',
    'record.victory': 'Victory',

    'ctx.edit':                 'Edit choices',
    'ctx.note':                 'Edit note',
    'ctx.priority':             'Priority',
    'ctx.priority.high':        'High',
    'ctx.priority.normal':      'Normal',
    'ctx.priority.low':         'Low',
    'ctx.fasttravel':           'Fast Travel',
    'ctx.fasttravel.high':      'High priority',
    'ctx.fasttravel.shortest':  'Shortest',
    'ctx.fasttravel.normal':    'Normal',
    'ctx.fasttravel.low':       'Low priority',
    'ctx.fasttravel.no_path':   'No path found to that section.',
    'ft.section_placeholder':   'Section number',
    'ft.tooltip':               'You can also right-click any mapped node on the graph to fast travel directly to it',
    'ctx.battle':               'Toggle battle ⚔',
    'ctx.delete':               'Delete node',

    'ctrl.reset':  'Reset Book',

    'legend.title':      'Legend',
    'legend.current':    'Current section',
    'legend.visited':    'Visited this run',
    'legend.mapped':     'Mapped',
    'legend.discovered': 'Discovered',
    'legend.candie':     'Can lose here',
    'legend.canwin':     'Can win here',
    'legend.deathrun':   'Lost here',
    'legend.winrun':     'Victory run ended here',
    'legend.battle':     'Battle here',
    'legend.battlerun':  'Battle death ended here',

    'modal.edit.title': 'Edit Section {n}',
    'modal.edit.label': 'Choices (comma-separated):',

    'modal.note.title':       'Note \u2014 Section {n}',
    'modal.note.placeholder': 'e.g. need the brass key to reach this',

    'modal.book.title':            'Edit Book',
    'modal.book.name':             'Book name:',
    'modal.book.sections':         'Total sections:',

    'modal.profile.title':      'Edit Profile',
    'modal.profile.avatar':     'Change Avatar',
    'modal.profile.username':   'Username:',
    'modal.profile.changepass': 'Change Password',
    'modal.profile.current':    'Current password:',
    'modal.profile.new':        'New password:',
    'modal.profile.confirm':    'Confirm new password:',

    'modal.crop.title':   'Position Avatar',
    'modal.crop.hint':    'Drag to reposition. The square area will be used.',
    'modal.crop.confirm': 'Use This',

    'btn.save':     'Save',
    'btn.cancel':   'Cancel',
    'btn.ok':       'OK',
    'btn.delete':   'Delete',
    'btn.reset':    'Reset',
    'btn.send':     'Send',
    'btn.close':    'Close',
    'btn.feedback': 'Feedback',
    'btn.inbox':    'Inbox',
    'btn.back':     '← Back',

    'modal.feedback.title':    'Send Feedback',
    'modal.feedback.username': 'Username:',
    'modal.feedback.email':    'Email (optional):',
    'modal.feedback.message':  'Message:',
    'modal.inbox.title':       'Inbox',

    'feedback.message_required': 'Please enter a message.',
    'feedback.submit_error':     'Failed to send. Please try again.',

    'inbox.empty':          'No messages yet.',
    'inbox.confirm_delete': 'Delete this thread?',

    'err.username_password':  'Enter a username and password.',
    'err.connect':            'Could not connect to server.',
    'err.create_book':        'Could not create book.',
    'err.save':               'Could not save changes.',
    'err.avatar':             'Could not upload avatar.',
    'err.name_empty':         'Name cannot be empty.',
    'err.sections_invalid':   'Enter a valid number of sections.',
    'err.sections_min':       'Cannot go below {min} \u2014 that section is already in use.',
    'err.isbn_invalid':       'Invalid ISBN \u2014 check the digits and try again.',
    'err.issn_invalid':       'Invalid ISSN \u2014 must be 8 digits (e.g. 1234-5679).',
    'err.asin_invalid':       'Invalid ASIN \u2014 must be 10 alphanumeric characters.',
    'err.passwords_mismatch': 'New passwords do not match.',
    'err.name_sections':      'Enter a name and a section count of at least 5.',
    'msg.error':              'Error',

    'confirm.delete_book':       'Delete "{name}"? All progress will be lost.',
    'confirm.delete_run':        'Delete Run {n}? This cannot be undone.',
    'confirm.delete_node':       'Delete Section {id}{extra}?',
    'confirm.delete_node_extra': ' and {n} dependent node(s)',
    'confirm.reset_book':        'Reset all progress for this book? The book will remain but all graph data and runs will be cleared.',
    'confirm.reset_series':      'This book is part of an open-world series. Resetting will clear ALL runs and progress for every book in the series. This cannot be undone.',

    'cs.title':           'Character Sheet',
    'cs.btn':             'Character Sheet',
    'cs.add':             'Add field',
    'cs.empty':           'No fields yet. Click \u201c+ Add field\u201d to begin.',
    'cs.field_name':      'Field name',
    'cs.value_placeholder': 'Value',
    'cs.enum_placeholder':  'opt1, opt2 \u2026',
    'cs.no_options':      '(no options)',
    'cs.toggle_visible':  'Toggle display visibility',
    'cs.delete_field':    'Delete field',
    'cs.cancel':          'Cancel',
    'cs.save':            'Save',
    'cs.save_template':   'Save as template',

    'node.unmapped': 'Section {n} \u2014 not yet mapped',
    'node.goes_to':  'goes to: {list}',
    'node.can_die':  'can lose here',
    'node.can_win':  'can win here',
    'node.battle':   'Battle here',
    'node.section':  'Section {n} \u2014 {parts}',
  },

  // To add a language: insert a new key here with a full translation object matching `en`.
  // e.g.  fr: { 'app.title': 'Suivi de livres-jeux', ... }
};

let _lang = localStorage.getItem('gamebook_lang') || 'en';

const _overrides = {};
export function setTranslationOverride(key, value) { _overrides[key] = value; }

export function t(key, params = {}) {
  const str = _overrides[key] ?? translations[_lang]?.[key] ?? translations.en[key] ?? key;
  return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? params[k] : `{${k}}`));
}

export function applyTranslations() {
  document.documentElement.lang = _lang;
  document.title = t('app.title');
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}
