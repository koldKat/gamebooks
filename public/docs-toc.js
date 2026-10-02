// Shared documentation scroll-spy. Load externally because the public guide CSP blocks inline scripts.
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
    // Scroll the active entry into view within the TOC's own scrollbox.
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

// Hide Back to app inside embedded viewers; retain it for standalone pages.
(() => {
  if (window.self === window.top) return;
  document.documentElement.classList.add('in-app');
  const back = document.querySelector('header nav .doc-back');
  if (back) back.remove();
})();
