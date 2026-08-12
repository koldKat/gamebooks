// Scroll-spy for the generated docs pages (public/guide.html, admin/admin-guide.html,
// admin/technical.html) - highlights whichever section's heading the user has scrolled
// to in the sticky sidebar TOC. Shared as one external file (not inlined per-page)
// because public/guide.html is served with a CSP of script-src 'self', which silently
// blocks inline <script> blocks - an external same-origin file is the only way this
// runs there at all. See scripts/generate-docs.js, which emits <script src="/docs-toc.js">
// on every generated page.
(() => {
  const menu = document.querySelector('.toc');
  if (!menu) return;
  const entries = [...menu.querySelectorAll('a[href^="#"]')]
    .map(link => ({ link, section: document.getElementById(decodeURIComponent(link.hash.slice(1))) }))
    .filter(entry => entry.section);
  let active = null;
  const select = entry => {
    if (!entry || entry === active) return;
    if (active) { active.link.classList.remove('active'); active.link.removeAttribute('aria-current'); }
    active = entry;
    active.link.classList.add('active');
    active.link.setAttribute('aria-current', 'location');
    // Keep the active entry visible within the TOC's own scrollbox - a long
    // doc's sidebar (technical.html has 88 entries) is itself scrollable, so
    // without this the highlight can be applied correctly and still be
    // invisible, scrolled out of view in the sidebar.
    const top = active.link.offsetTop;
    const bottom = top + active.link.offsetHeight;
    if (top < menu.scrollTop + 10) menu.scrollTop = Math.max(0, top - 10);
    else if (bottom > menu.scrollTop + menu.clientHeight - 10) menu.scrollTop = bottom - menu.clientHeight + 10;
  };
  const update = () => {
    let current = entries[0];
    for (const entry of entries) {
      if (entry.section.getBoundingClientRect().top <= 90) current = entry;
      else break;
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = entries[entries.length - 1];
    select(current);
  };
  let queued = false;
  const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; update(); }); };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  addEventListener('hashchange', schedule);
  for (const entry of entries) entry.link.addEventListener('click', () => select(entry));
  update();
})();
