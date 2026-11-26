import { apiFetch } from '../../../core/state.js';
import { bindWrongTurnPanel } from '../797/panel.js';
import { definition, loadRoster, roster } from './definition.js';

export const { init, render, setVisible } = bindWrongTurnPanel(definition, roster);
export const loadData = () => loadRoster(apiFetch);
