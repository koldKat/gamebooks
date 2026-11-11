// Show the themed book preview and permanent reading purchase confirmation.
import { t } from '../i18n.js';
import { COIN_SVG } from '../ui-helpers/coin-icon.js';

export function openReadingUnlock(access, { onConfirm, isCurrent, onCancel }) {
  const dialog = document.createElement('dialog');
  let confirmed = false;
  dialog.className = 'reading-unlock-dialog';
  dialog.setAttribute('aria-labelledby', 'reading-unlock-title');
  const title = document.createElement('h2');
  title.id = 'reading-unlock-title';
  title.textContent = access.name;
  const preview = document.createElement('div');
  preview.className = 'reading-unlock-preview';
  if (access.coverUrl) {
    const cover = document.createElement('img');
    cover.src = access.coverUrl;
    cover.alt = access.name;
    const enlarged = document.createElement('img');
    enlarged.className = 'reading-unlock-cover-hover';
    enlarged.alt = access.name;
    const hideCover = () => { enlarged.removeAttribute('src'); enlarged.remove(); };
    cover.addEventListener('mouseenter', () => {
      if (!matchMedia('(hover: hover)').matches) return;
      enlarged.src = access.coverUrl;
      dialog.append(enlarged);
      const box = cover.getBoundingClientRect();
      const width = Math.min(280, innerWidth - 16);
      enlarged.style.left = Math.max(8, Math.min(box.right + 8, innerWidth - width - 8)) + 'px';
      enlarged.style.top = Math.max(8, Math.min(box.top, innerHeight - Math.min(420, innerHeight - 16) - 8)) + 'px';
    });
    cover.addEventListener('mouseleave', hideCover);
    preview.append(cover);
  }
  const details = document.createElement('div');
  if (access.authors) {
    const author = document.createElement('p');
    author.className = 'reading-unlock-author';
    author.textContent = access.authors;
    details.append(author);
  }
  const blurb = document.createElement('p');
  blurb.textContent = access.description;
  details.append(blurb);
  preview.append(details);
  const message = document.createElement('p');
  message.className = 'reading-unlock-question';
  message.textContent = t('reading_access.permanent');
  const status = document.createElement('p');
  status.className = 'reading-unlock-status';
  status.setAttribute('role', 'status');
  const actions = document.createElement('div');
  actions.className = 'reading-confirm-actions';
  const cancel = document.createElement('button');
  cancel.className = 'reading-confirm-cancel';
  cancel.textContent = t('btn.cancel');
  const unlock = document.createElement('button');
  unlock.className = 'reading-unlock-button';
  const label = document.createElement('span');
  const amount = document.createElement('span');
  amount.className = 'reading-unlock-cost';
  const coin = document.createElement('span');
  coin.innerHTML = COIN_SVG;
  unlock.append(label, amount, coin);
  actions.append(cancel, unlock);
  dialog.append(title, preview, message, status, actions);
  const close = () => {
    confirmed = true;
    if (dialog.open) dialog.close();
    for (const image of dialog.querySelectorAll('img')) image.removeAttribute('src');
    dialog.remove();
  };
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { if (access.busy) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    for (const image of dialog.querySelectorAll('img')) image.removeAttribute('src');
    dialog.remove();
    if (!confirmed) onCancel?.();
  });
  unlock.addEventListener('click', () => {
    if (unlock.disabled || !isCurrent()) return;
    const cost = access.cost;
    onConfirm(cost);
  });
  const update = latest => {
    access = { ...access, ...latest };
    label.textContent = t('reading_access.unlock_action');
    amount.textContent = access.cost;
    unlock.setAttribute('aria-label', t('reading_access.unlock_action') + ' ' + t('reading_access.coin_cost', { cost: access.cost }));
    unlock.disabled = access.busy || !access.canAfford;
    cancel.disabled = !!access.busy;
    status.textContent = access.error || (access.busy ? t('reading_access.unlocking') : access.canAfford ? '' : t('reading_access.insufficient'));
  };
  update(access);
  document.body.append(dialog);
  dialog.showModal();
  cancel.focus();
  return { close, update };
}
