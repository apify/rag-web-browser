import { RequestOptions, log } from 'crawlee';
import { parse, ParsedUrlQuery } from 'querystring';
import { v4 as uuidv4 } from 'uuid';

import defaults from './defaults.json' assert { type: 'json' };
import { UserData } from './types.js';

export function parseParameters(url: string): ParsedUrlQuery {
    return parse(url.slice(1));
}

/**
 * Check whether the query parameters are valid (do not support extra parameters)
 */
export function checkForExtraParams(params: ParsedUrlQuery) {
    for (const key of Object.keys(params)) {
        if (!defaults.hasOwnProperty(key)) {
            log.warning(`Unknown parameter: ${key}. Supported parameters: ${Object.keys(defaults).join(', ')}`);
        }
    }
}

export function createRequestSearch(queries: string, maxResults: number): RequestOptions<UserData> {
    // add some overhead for the maxResults to account for the fact that some results are not Organic
    const n = maxResults + 5;
    const urlSearch = `http://www.google.com/search?q=${queries}&num=${n}`;
    return { url: urlSearch, uniqueKey: uuidv4(), userData: { maxResults } };
}

export function createRequest(url: string, responseId: string): RequestOptions<UserData> {
    return { url, uniqueKey: uuidv4(), userData: { responseId },
    };
}
