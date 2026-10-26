import {definition} from './definition.js';
import {createCrossroadsState} from '../../engines/crossroads/state.js';
export const createState = getContext => createCrossroadsState(definition,getContext);
