// Display the permanent admin-pool payout record for each finished seasonal event.
import { api } from './core.js';

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export async function loadSeasonReports() {
  const target = document.getElementById('season-payout-reports');
  try {
    const { reports } = await api('GET', '/api/admin/seasons/payouts');
    const expanded = new Set([...target.querySelectorAll('details[open]')].map(node => node.dataset.report));
    target.replaceChildren();
    if (!reports.length) {
      target.append(element('p', 'No completed event payouts yet. Reports appear automatically after an event ends.', 'muted'));
      return;
    }
    for (const report of [...reports].sort((a, b) => b.processedAt - a.processedAt
      || b.endsOn.localeCompare(a.endsOn) || a.seasonId.localeCompare(b.seasonId))) {
      const details = element('details', undefined, 'season-payout-report');
      details.dataset.report = `${report.seasonId}:${report.startsOn}`;
      details.open = expanded.has(details.dataset.report);
      const summary = element('summary');
      summary.append(element('strong', `${report.name} · ${report.startsOn} to ${report.endsOn}`),
        element('span', `${report.paidGc.toLocaleString()} GC paid · ${report.status === 'paid' ? `${report.recipientCount} players` : 'Skipped: insufficient admin pool'}`));
      const processed = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Sofia', dateStyle: 'medium', timeStyle: 'short',
      }).format(new Date(report.processedAt * 1000));
      details.append(summary, element('p', `Processed ${processed} (Sofia). ${report.status === 'paid'
        ? `${report.paidGc.toLocaleString()} gold coins deducted from the admin pool.`
        : `The event required ${report.eligibleGc.toLocaleString()} GC. No coins were deducted; this payout was permanently skipped.`}`));
      const table = element('table');
      const head = element('thead'), headings = element('tr');
      for (const label of ['Player', 'Qualifying days', 'Gold paid']) {
        const th = element('th', label); th.scope = 'col'; headings.append(th);
      }
      head.append(headings);
      const body = element('tbody');
      for (const recipient of report.recipients) {
        const row = element('tr');
        row.append(element('td', `${recipient.username} (#${recipient.user_id})`),
          element('td', recipient.qualifying_days.toLocaleString()),
          element('td', `${recipient.paid_gc.toLocaleString()} GC`));
        body.append(row);
      }
      table.append(head, body); details.append(table); target.append(details);
    }
  } catch (_) {
    target.replaceChildren(element('p', 'Could not load payout reports. Use Refresh reports to retry.'));
  }
}
