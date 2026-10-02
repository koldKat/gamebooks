import en from './en/index.js';

const translations = { en };

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
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  // Same idea as data-i18n-title, but for the app's own themed data-tooltip
  // system (tooltip.js) instead of the native browser title tooltip -
  // static HTML can't call t() at parse time, so this attribute defers the
  // translation to this runtime pass, same as data-i18n-title already does.
  document.querySelectorAll('[data-i18n-tooltip]').forEach(el => {
    el.dataset.tooltip = t(el.dataset.i18nTooltip);
  });
}
