// play.js - Stable public API for the desktop play screen.
import './play/init.js';

export { showConfirm, showAlert } from './ui-helpers/confirm.js';
export { setDiscoverableLimit, setTrailCollapsed, setOnTrailToggle, setOnViewPublicRun, setOpenWorldContext, setAfterRenderFn, CHOICES_PULSE_THRESHOLD, setChoicesRecordedCount, setOnChoicesRecorded, suppressAutoNav, setFastTravelHandler, setAltStartHandler } from './play/settings.js';
export { confirmAlphanumericSwitch, showTwoChoice, showFastTravelDialog } from './play/dialogs.js';
export { render } from './play/render.js';
export { startPlaythrough, startPortalRun, loadRun, deleteRun } from './play/runs.js';
export { commitChoices, handleRecordChoices } from './play/choices.js';
export { wouldAutoNav, navigate, undoRun } from './play/navigation.js';
export { maxFastTravels } from './play/limits.js';
export { endPlaythrough } from './play/completion.js';
export { openEditModal, closeEditModal, openNoteModal, closeNoteModal } from './play/node-dialogs.js';
export { openPortalModal } from './play/portal-dialog.js';
