import { _initCoverSettings } from './settings-bindings.js';
import { _initCoverNavigation } from './panel-bindings.js';
import { _initCoverPreview } from './preview.js';
import { _initCoverSearch } from './search-bindings.js';

export function initCoversPanel() {
  _initCoverSettings();
  _initCoverNavigation();
  _initCoverPreview();
  _initCoverSearch();
}
