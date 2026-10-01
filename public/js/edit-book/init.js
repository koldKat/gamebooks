import { initBookBindings } from './book-bindings.js';
import { initStashBindings } from './stash-bindings.js';
import { initAnthologyBindings } from './anthology.js';
import { initSeriesBindings } from './series.js';

export function initEditBook(mousedownOnOverlayRef) {
  initBookBindings();
  initStashBindings(mousedownOnOverlayRef);
  initAnthologyBindings(mousedownOnOverlayRef);
  initSeriesBindings(mousedownOnOverlayRef);
}
