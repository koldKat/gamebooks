import { registerTranslations } from './runtime.js';

const pending = new Map();
const failures = new Map();
const BULGARIAN_BOOKS = new Set([570, 644, 648, 654, 658, 663, 665, 671, 672, 700, 706, 710, 718, 722, 723, 724, 728, 735, 757, 768, 769, 773, 783, 797, 807, 808, 809, 810, 812, 817]);

export function loadBattleSimTranslations(bookId) {
  const id = Number(bookId);
  if (!Number.isSafeInteger(id) || id <= 0) return Promise.reject(new Error('Invalid simulator ID'));
  if (pending.has(id)) return pending.get(id);
  // Browsers cache failed module URLs; a retry needs a fresh URL.
  const attempt = failures.get(id) || 0;
  const suffix = attempt ? `?retry=${attempt}` : '';
  const language = BULGARIAN_BOOKS.has(id) ? 'bg' : 'en';
  const loading = import(`./${language}/battlesim/battlesim${id}.js${suffix}`).then(module => {
    registerTranslations(module.default);
    failures.delete(id);
  }).catch(error => {
    pending.delete(id);
    failures.set(id, attempt + 1);
    throw error;
  });
  pending.set(id, loading);
  return loading;
}
