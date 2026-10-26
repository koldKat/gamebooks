import {definition} from './definition.js';
import {createDestinyState} from '../../engines/destinyquest/state.js';
export const createState=getContext=>createDestinyState(definition,getContext);
