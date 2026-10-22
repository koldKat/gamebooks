// Shared SVG role badges for player and admin views.
const star = 'M10 0L13.09 7.64L20 7.64L14.41 12.36L16.18 20L10 15.28L3.82 20L5.59 12.36L0 7.64L6.91 7.64Z';
const roles = {
  admin: { label: 'Gamemaster', path: star },
  author: { label: 'Fateweaver', path: star },
  contributor: { label: 'Pathmaker', path: 'M10 0C11.5 7 13 8.5 20 10C13 11.5 11.5 13 10 20C8.5 13 7 11.5 0 10C7 8.5 8.5 7 10 0Z' },
  moderator: { label: 'Lorekeeper', path: 'M10 0L20 10L10 20L0 10Z' },
  squire: { label: 'Squire', path: 'M10 0L18 3V9C18 14 14 18 10 20C6 18 2 14 2 9V3Z' },
};

export function renderRoleBadge(role) {
  const badge = roles[role];
  if (!badge) return '';
  return `<span class="${role}-badge" data-tooltip="${badge.label}"><svg aria-hidden="true" viewBox="0 0 20 20"><path fill="currentColor" d="${badge.path}"/></svg></span>`;
}
