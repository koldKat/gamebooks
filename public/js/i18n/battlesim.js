import { registerTranslations } from './runtime.js';

const pending = new Map();
const failures = new Map();

export function loadBattleSimTranslations(bookId) {
  const id = Number(bookId);
  if (!Number.isSafeInteger(id) || id <= 0) return Promise.reject(new Error('Invalid simulator ID'));
  if (pending.has(id)) return pending.get(id);
  // Browsers cache failed module URLs; a retry needs a fresh URL.
  const attempt = failures.get(id) || 0;
  const suffix = attempt ? `?retry=${attempt}` : '';
  const loading = import(`./en/battlesim/battlesim${id}.js${suffix}`).then(module => {
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
