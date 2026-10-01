import { initShell } from './shell.js';
import { initPlayFeatures } from './play-features.js';
import { initGuideAndForum } from './forum.js';
import { initFeatureHooks } from './hooks.js';
import { initLibraryBindings } from './library-bindings.js';
import { initNodeBindings } from './node-bindings.js';
import { initGraphBindings } from './graph-bindings.js';
import { initDialogBindings } from './dialog-bindings.js';
import { initRouting } from './routing.js';
import { initVideoModal } from './video.js';

export async function initApp() {
  // Preserve startup order: all hooks and bindings precede initial navigation.
  initShell();
  initPlayFeatures();
  const openForumModal = initGuideAndForum();
  initFeatureHooks();
  initLibraryBindings();
  initNodeBindings();
  initGraphBindings();
  initDialogBindings(openForumModal);
  await initRouting();
  initVideoModal();
}
