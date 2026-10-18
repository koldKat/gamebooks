import {definition} from './definition.js';
import {createState as createSharedState} from '../../engines/lucas-grey/state.js';

export function createState(getContext) {
  return createSharedState(definition, getContext);
}
