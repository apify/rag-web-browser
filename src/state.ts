import { TIMED_OUT_RESPONSE_ARRAY_SIZE } from './const.js';
import { BoundedArray } from './helpers/bouded-array.js';

export const timedOutResponses = new BoundedArray<string>(TIMED_OUT_RESPONSE_ARRAY_SIZE);
