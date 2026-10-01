// bindings.js - Internal play-screen module; use ../play.js externally.

import { state, setViewingPt, saveState, parseSecId, isValidSecId, currentSection, apiFetch } from '../state.js';
import { network } from '../graph.js';
import { t } from '../i18n.js';
import { showConfirm } from '../confirm.js';
import { playContext } from './context.js';
import { startPlaythrough, loadRun, deleteRun } from './runs.js';
import { undoRun, navigate } from './navigation.js';
import { endPlaythrough } from './completion.js';
import { knownStartSections, showStartPicker } from './dialogs.js';
import { handleRecordChoices } from './choices.js';
import { openPortalModal } from './portal-dialog.js';
import { render } from './render.js';

export function bindPanelEvents(panel, pt, sec) {
  panel.querySelector('.pre-series-runs-header')?.addEventListener('click', () => {
    playContext._preSeriesCollapsed = !playContext._preSeriesCollapsed;
    localStorage.setItem('preSeriesCollapsed', playContext._preSeriesCollapsed ? '1' : '0');
    panel.querySelector('.pre-series-runs-section')?.classList.toggle('pre-series-collapsed', playContext._preSeriesCollapsed);
  });

  // ── Attach events ────────────────────────────────────────────
  document.getElementById('new-pt-btn').addEventListener('click', () => {
    if (playContext._owIsOpenWorld && playContext._onNewSeriesRun) {
      playContext._onNewSeriesRun();
    } else {
      const known = knownStartSections();
      if (known.length >= 2) {
        showStartPicker(known);
      } else {
        startPlaythrough();
      }
    }
  });

  const newPtAltBtn = document.getElementById('new-pt-alt-btn');
  if (newPtAltBtn && playContext._altStartHandler) newPtAltBtn.addEventListener('click', playContext._altStartHandler);

  const undoBtn = document.getElementById('undo-run-btn');
  if (undoBtn) undoBtn.addEventListener('click', undoRun);

  const ftBtn = document.getElementById('fasttravel-btn');
  if (ftBtn && playContext._fastTravelHandler) ftBtn.addEventListener('click', playContext._fastTravelHandler);

  const winBtn = document.getElementById('win-run-btn');
  if (winBtn) winBtn.addEventListener('click', () =>
    showConfirm('Mark this run as a Victory?', () => endPlaythrough('success'),
      { confirmLabel: '★ Victory', danger: false, win: true }));

  const lossBtn = document.getElementById('loss-run-btn');
  if (lossBtn) lossBtn.addEventListener('click', () =>
    showConfirm('Mark this run as a Loss?', () => endPlaythrough('death'),
      { confirmLabel: '✝ Loss', danger: true }));

  const battleBtn = document.getElementById('battle-death-btn');
  if (battleBtn) battleBtn.addEventListener('click', () =>
    showConfirm('Mark this run as a Battle Death?', () => {
      const sec = currentSection();
      if (sec && !state.graph[sec]?.battle) {
        if (!state.graph[sec]) state.graph[sec] = { choices: [] };
        state.graph[sec].battle = true;
      }
      endPlaythrough('battle');
    }, { confirmLabel: 'Battle Death', danger: true }));

  if (pt) {
    const recBtn = document.getElementById('record-btn');
    if (recBtn) {
      const inp = document.getElementById('choices-input');
      inp.focus();
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') recBtn.click(); });
      recBtn.addEventListener('click', () => {
        const raw = inp.value.trim();
        if (raw) {
          playContext._choicesRecordedCount++;
          playContext._onChoicesRecordedFn?.(playContext._choicesRecordedCount);
        }
        handleRecordChoices(sec, raw);
      });
    }

    const addPortalBtn = document.getElementById('add-portal-btn');
    if (addPortalBtn) {
      addPortalBtn.addEventListener('click', () => openPortalModal(sec, null));
    }

    panel.querySelectorAll('.portal-travel-btn').forEach(btn => {
      const idx = +btn.dataset.portalIdx;
      btn.addEventListener('click', () => {
        const portals = state.graph[sec]?.portals || [];
        const p = portals[idx];
        if (!p || !playContext._owPortalHandler) return;
        const bk = playContext._owSeriesBooks.find(b => b.id === p.targetBookId);
        const bkName = bk ? bk.name : `Book #${p.targetBookId}`;
        const fromSec = currentSection();
        showConfirm(
          `Travel from ${fromSec} to "${bkName}" ${p.targetSection}?\n\nYour character sheet and run number travel with you. This run pauses here at ${fromSec} until you return.`,
          () => playContext._owPortalHandler(p),
          { confirmLabel: '⇒ Travel', danger: false }
        );
      });
    });

    panel.querySelectorAll('.portal-edit-btn').forEach(btn => {
      const idx = +btn.dataset.portalIdx;
      btn.addEventListener('click', () => openPortalModal(sec, idx));
    });

    panel.querySelectorAll('.portal-del-btn').forEach(btn => {
      const idx = +btn.dataset.portalIdx;
      btn.addEventListener('click', () => {
        const node = state.graph[sec];
        if (!node?.portals) return;
        node.portals.splice(idx, 1);
        if (!node.portals.length) delete node.portals;
        saveState();
        render();
      });
    });

    document.querySelectorAll('.choice-btn').forEach(btn => {
      const nodeId = parseSecId(btn.dataset.choice);
      btn.addEventListener('click', () => navigate(nodeId));
      if (isValidSecId(nodeId)) {
        btn.addEventListener('mouseenter', () => { if (network) network.selectNodes([nodeId]); });
        btn.addEventListener('mouseleave', () => { if (network) network.selectNodes([]); });
      }
    });
  }

  document.querySelectorAll('.run-load-btn').forEach(btn => {
    btn.addEventListener('click', () => loadRun(Number(btn.dataset.index)));
  });

  document.querySelectorAll('.run-del-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteRun(Number(btn.dataset.index)));
  });

  panel.querySelectorAll('.run-public-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.index;
      const pt = state.playthroughs[i];
      if (!pt || !pt.completed) return;
      pt.isPublic = !pt.isPublic;
      // For open world series: immediately push public status to series_runs
      if (playContext._owIsOpenWorld && playContext._owSeriesId) {
        apiFetch(`/api/series/${playContext._owSeriesId}/runs/${i}`, {
          method: 'PUT',
          body: JSON.stringify({ is_public: pt.isPublic }),
        }).catch(() => {});
      }
      saveState();
      btn.classList.toggle('is-public', pt.isPublic);
    });
  });

  panel.querySelectorAll('.run-load-preseries').forEach(btn => {
    btn.addEventListener('click', () => {
      const i  = +btn.dataset.preIndex;
      const pt = (state.preSeriesRuns || [])[i];
      if (!pt) return;
      // View completed pre-series runs; resume incomplete ones
      if (pt.completed) {
        state._viewingPreSeriesIdx = i;
        setViewingPt(pt);
        render();
      } else {
        state._viewingPreSeriesIdx = null;
        setViewingPt(null, true);
        state.activePtIndex = null; // pre-series runs are not series runs
        render();
        const sec = pt.path[pt.path.length - 1];
        if (sec && network) network.focus(sec, { animation: true, scale: 1.2 });
      }
    });
  });

  panel.querySelectorAll('.run-del-preseries').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.preIndex;
      showConfirm(t('confirm.delete_run', { n: -(((state.preSeriesRuns || []).length) - i) }), () => {
        if (state._viewingPreSeriesIdx === i) {
          state._viewingPreSeriesIdx = null;
          setViewingPt(null);
        }
        (state.preSeriesRuns || []).splice(i, 1);
        saveState();
        render();
      });
    });
  });
}
