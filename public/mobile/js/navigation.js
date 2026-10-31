// Return to the existing main app entry without adding another page to Back history.
export function initMainAppReturn() {
  if (!document.referrer || history.length < 2) return;
  const from = new URL(document.referrer);
  if (from.origin === location.origin && from.pathname === '/')
    history.replaceState({ ...history.state, mainAppReturn: true }, '');
}

export function returnToMainApp() {
  if (history.state?.mainAppReturn && history.length > 1) history.back();
  else location.replace('/');
}
