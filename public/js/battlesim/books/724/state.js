import { definition } from './definition.js';
import { createSimulatorState } from '../../engines/sorcery/state.js';

export function createState(getContext) {
  return createSimulatorState(getContext, definition);
}
