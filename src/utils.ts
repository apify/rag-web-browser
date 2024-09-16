import { RequestOptions, log, ProxyConfiguration } from 'crawlee';
import { parse, ParsedUrlQuery } from 'querystring';
import { v4 as uuidv4 } from 'uuid';

import { OrganicResult, TimeMeasure, UserData } from './types.js';

const defaults = await import('./defaults.json', { assert: { type: 'json' } }).then((module) => module.default);

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
            delete params[key];
        }
    }
}

/**
 * Create a search request with the provided query and maxResults.
 * Add some overhead for the maxResults to account for the fact that some results are not Organic.
 *
 * The maxResults parameter is passed to the UserData object, when the request is handled it is used to limit
 * the number of search results without the created overhead.
 *
 * Also add the playwrightCrawlerKey to the UserData object to be able to identify the playwright crawler should
 * handle the crawling .
 */
export function createSearchRequest(
    query: string,
    maxResults: number,
    playwrightCrawlerKey: string,
    proxyConfiguration: ProxyConfiguration | undefined,
): RequestOptions<UserData> {
    // add some overhead for the maxResults to account for the fact that some results are not Organic
    const n = Number(maxResults) + 5;

    // @ts-expect-error is there a better way to get group information?
    // (e.g. to  create extended CheerioCrawlOptions and pass it there?)
    const groups = proxyConfiguration?.groups || [];
    const protocol = groups.includes('GOOGLE_SERP') ? 'http' : 'https';
    const urlSearch = `${protocol}://www.google.com/search?q=${query}&num=${n}`;
    return {
        url: urlSearch,
        uniqueKey: uuidv4(),
        userData: { maxResults, timeMeasures: [], query, playwrightCrawlerKey },
    };
}

export function createRequest(
    result: OrganicResult,
    responseId: string,
    timeMeasures: TimeMeasure[] | null,
): RequestOptions<UserData> {
    return {
        url: result.url!,
        uniqueKey: uuidv4(),
        userData: {
            responseId,
            googleSearchResult: result,
            timeMeasures: timeMeasures ? [...timeMeasures] : [],
        },
    };
}

export function addTimeMeasureEvent(userData: UserData, event: TimeMeasure['event'], time: number | null = null) {
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
