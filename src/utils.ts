import { RequestOptions, log, ProxyConfiguration } from 'crawlee';
import { parse, ParsedUrlQuery } from 'querystring';

import { defaults } from './const.js';
import { OrganicResult, ContentScraperSettings, TimeMeasure, ContentCrawlerUserData, SearchCrawlerUserData } from './types.js';
import inputSchema from '../.actor/input_schema.json' with { type: 'json' };

export function parseParameters(url: string): ParsedUrlQuery {
    const params = parse(url.slice(1));

    // Parse non-primitive parameters following input schema
    type SupportedParams = keyof typeof inputSchema.properties
    for (const [key, value] of Object.entries(params)) {
        // If the key is not supported by schema, skip it
        if (!Object.keys(inputSchema.properties).includes(key)) {
            log.warning(`Unknown parameter: '${key}', skipping it. Supported parameters: ${Object.keys(defaults).join(', ')}`);
            continue;
        }
        const typedKey = key as SupportedParams;
        if (['object', 'array'].includes(inputSchema.properties[typedKey].type) && typeof value === 'string') {
            try {
                params[key] = JSON.parse(value);
            } catch (e) {
                log.warning(`Failed to parse parameter ${key}, it must be valid JSON. Skipping it: ${e}`);
            }
        }
    }

    return params;
}

/**
 * Check whether the query parameters are valid (do not support extra parameters)
 */
export function checkAndRemoveExtraParams(params: ParsedUrlQuery) {
    const keys = Object.keys(defaults);
    keys.push('token', '?token'); // token is a special parameter
    for (const key of Object.keys(params)) {
        if (!keys.includes(key)) {
            log.warning(`Unknown parameter: ${key}. Supported parameters: ${Object.keys(defaults).join(', ')}`);
            delete params[key];
        }
    }
}

export function randomId() {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let counter = 0; counter < 10; counter++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

/**
 * Create a search request with the provided query and maxResults.
 * Add some overhead for the maxResults to account for the fact that some results are not Organic.
 *
 * The maxResults parameter is passed to the UserData object, when the request is handled it is used to limit
 * the number of search results without the created overhead.
 *
 * Also add the contentCrawlerKey to the UserData object to be able to identify which content crawler should
 * handle the crawling .
 */
export function createSearchRequest(
    query: string,
    responseId: string,
    maxResults: number,
    contentCrawlerKey: string,
    proxyConfiguration: ProxyConfiguration | undefined,
    contentScraperSettings: ContentScraperSettings,
): RequestOptions<SearchCrawlerUserData> {
    // add some overhead for the maxResults to account for the fact that some results are not Organic
    const n = Number(maxResults) + 5;

    // @ts-expect-error is there a better way to get group information?
    // (e.g. to  create extended CheerioCrawlOptions and pass it there?)
    const groups = proxyConfiguration?.groups || [];
    const protocol = groups.includes('GOOGLE_SERP') ? 'http' : 'https';
    const urlSearch = `${protocol}://www.google.com/search?q=${query}&num=${n}`;
    return {
        url: urlSearch,
        uniqueKey: randomId(),
        userData: {
            maxResults,
            timeMeasures: [],
            query,
            contentCrawlerKey,
            contentScraperSettings,
            responseId,
        },
    };
}

/**
 * Create a request for content crawler with the provided query, result, responseId and timeMeasures.
 */
export function createRequest(
    query: string,
    result: OrganicResult,
    responseId: string,
    contentScraperSettings: ContentScraperSettings,
    timeMeasures: TimeMeasure[] | null = null,
): RequestOptions<ContentCrawlerUserData> {
    return {
        url: result.url!,
        uniqueKey: randomId(),
        userData: {
            query,
            responseId,
            searchResult: result.url && result.title ? result : undefined,
            timeMeasures: timeMeasures ? [...timeMeasures] : [],
            contentScraperSettings,
        },
    };
}

export function addTimeMeasureEvent(userData: ContentCrawlerUserData, event: TimeMeasure['event'], time: number | null = null) {
    let timePrev = 0;
    if (!userData.timeMeasures?.length) {
        userData.timeMeasures = [];
    } else {
        timePrev = userData.timeMeasures[userData.timeMeasures.length - 1].timeMs;
    }
    time = time ?? Date.now();
    userData.timeMeasures.push({ event, timeMs: time, timeDeltaPrevMs: timePrev ? time - timePrev : 0 });
}

export function transformTimeMeasuresToRelative(timeMeasures: TimeMeasure[]): TimeMeasure[] {
    const firstMeasure = timeMeasures[0].timeMs;
    return timeMeasures
        .map((measure) => {
            return {
                event: measure.event,
                timeMs: measure.timeMs - firstMeasure,
                timeDeltaPrevMs: measure.timeDeltaPrevMs,
            };
        })
        .sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * Interpret the input as a URL (valid URL starts with http:// or https://).
 * If the input is a URL, return it; otherwise, try to decode it and check if it's a valid URL.
 * Attempt to decode the input string up to 3 times, as users may encode the URL multiple times.
 * @param input - The input string to interpret as a URL.
 * @returns The valid URL string or null if invalid.
 */
export function interpretAsUrl(input: string): string | null {
    if (!input) return null;

    function tryValid(s: string): string | null {
        try {
            const url = new URL(s);
            return /^https?:/i.test(url.protocol) ? url.href : null;
        } catch {
            return null;
        }
    }

    let candidate = input;
    for (let i = 0; i < 3; i++) {
        const result = tryValid(candidate);
        if (result) return result;
        try {
            candidate = decodeURIComponent(candidate);
        } catch {
            break;
        }
    }
    return null;
}
