

export function initVideoModal() {
  // ── Tutorial video modal ──────────────────────────────────────────────────
  (function() {
    const trigger  = document.getElementById('login-video-trigger');
    const modal    = document.getElementById('video-modal');
    const backdrop = document.getElementById('video-modal-backdrop');
    const closeBtn = document.getElementById('video-modal-close');
    const frame    = document.getElementById('video-modal-frame');
    if (!trigger || !modal) return;

    function openVideoModal() {
      const iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube.com/embed/RGCu5Gdx5oU?autoplay=1&mute=1&controls=1&rel=0&modestbranding=1';
      iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
      iframe.setAttribute('allowfullscreen', '');
      iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;';
      frame.innerHTML = '';
      frame.appendChild(iframe);
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      closeBtn.focus();
    }

    function closeVideoModal() {
      modal.style.display = 'none';
      frame.innerHTML = '';
      document.body.style.overflow = '';
    }

    trigger.addEventListener('click', openVideoModal);
    backdrop.addEventListener('click', closeVideoModal);
    closeBtn.addEventListener('click', closeVideoModal);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.style.display === 'flex') closeVideoModal();
    });
  })();
}
