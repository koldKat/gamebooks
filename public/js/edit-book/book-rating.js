import { editState } from './state.js';
import { isDemoMode, apiFetch } from '../state.js';
import { t } from '../i18n.js';
import { _starLabelHtml } from '../books.js';
import { refreshCoinsDisplay } from '../shop.js';

export function initBookRating(bookId) {
  const requestSeq = ++editState._editStarRequestSeq;
  const isCurrent = () => editState._editStarBookId === bookId && editState._editStarRequestSeq === requestSeq;
  // Star rating widget
  const _esw = document.getElementById('edit-book-star-widget');
  editState._editStarBookId        = bookId;
  editState._editStarCurrentRating = null;
  editState._editStarAvgRating     = null;
  editState._editStarVoteCount     = 0;
  _esw.querySelectorAll('.star').forEach(s => s.className = 'star');
  _esw.querySelector('.star-label').textContent = '…';

  if (!editState._editStarInitialized) {
    editState._editStarInitialized = true;
    editState._editStarUpdateFn = (hoverVal) => {
      const displayVal = hoverVal !== null ? hoverVal : editState._editStarAvgRating;
      _esw.querySelectorAll('.star').forEach(s => {
        const p = +s.dataset.pos;
        s.className = (displayVal !== null && displayVal >= p) ? 'star on'
                    : (displayVal !== null && displayVal >= p - 0.5) ? 'star half'
                    : 'star';
      });
      const lbl = _esw.querySelector('.star-label');
      if (hoverVal !== null) {
        lbl.innerHTML = `<span class="star-avg">${hoverVal % 1 === 0 ? hoverVal.toFixed(1) : hoverVal}</span>`;
      } else {
        lbl.innerHTML = _starLabelHtml(editState._editStarAvgRating, editState._editStarVoteCount);
      }
    };
    _esw.querySelectorAll('.star').forEach(star => {
      star.addEventListener('mousemove', e => {
        const left = e.offsetX < star.offsetWidth / 2;
        editState._editStarUpdateFn(+star.dataset.pos - (left ? 0.5 : 0));
      });
      star.addEventListener('click', async e => {
        // Demo mode has no real account to attach a rating to - this
        // widget's whole point is rating books you don't own, which
        // doesn't apply to the fake demo book, and the PATCH below would
        // 401 and silently log the demo out like everywhere else on this
        // page (see the fetch below, and the Create-dialog guards).
        if (isDemoMode) return;
        const left      = e.offsetX < star.offsetWidth / 2;
        const newRating = +star.dataset.pos - (left ? 0.5 : 0);
        const toSave    = newRating === editState._editStarCurrentRating ? null : newRating;
        const prevRating = editState._editStarCurrentRating;
        const ratingBookId = editState._editStarBookId;
        const saveSeq = ++editState._editStarRequestSeq;
        const isCurrentSave = () => editState._editStarBookId === ratingBookId && editState._editStarRequestSeq === saveSeq;
        editState._editStarCurrentRating = toSave;
        _esw.dataset.userRating = toSave ?? '';
        editState._editStarUpdateFn(null);
        try {
          const res = await apiFetch(`/api/books/${ratingBookId}/rating`, {
            method: 'PATCH', body: JSON.stringify({ rating: toSave }),
          });
          if (res.ok) {
            const d = await res.json();
            if (d.xpAwarded) refreshCoinsDisplay();
            if (!isCurrentSave()) return;
            editState._editStarAvgRating = d.avgRating;
            editState._editStarVoteCount = d.voteCount;
            editState._editStarUpdateFn(null);
          } else {
            if (!isCurrentSave()) return;
            editState._editStarCurrentRating = prevRating;
            _esw.dataset.userRating = prevRating ?? '';
            editState._editStarUpdateFn(null);
          }
        } catch {
          if (!isCurrentSave()) return;
          editState._editStarCurrentRating = prevRating;
          _esw.dataset.userRating = prevRating ?? '';
          editState._editStarUpdateFn(null);
        }
      });
    });
    _esw.addEventListener('mouseleave', () => editState._editStarUpdateFn(null));
  }

  // Same isDemoMode reasoning as the star click handler above - this fetch
  // fires unconditionally every time the modal opens, so a demo book (fake
  // string id like "demo_1") would 401 the moment Edit is clicked on it.
  if (isDemoMode) {
    editState._editStarUpdateFn(null);
  } else {
    apiFetch(`/api/books/${bookId}/rating`).then(async r => {
      if (!isCurrent()) return;
      if (r.ok) {
        const d = await r.json();
        if (!isCurrent()) return;
        editState._editStarCurrentRating = d.rating ?? null;
        editState._editStarAvgRating     = d.avgRating ?? null;
        editState._editStarVoteCount     = d.voteCount ?? 0;
        _esw.dataset.userRating = editState._editStarCurrentRating ?? '';
      }
      editState._editStarUpdateFn(null);
    }).catch(() => { if (isCurrent()) editState._editStarUpdateFn(null); });
  }


}
