import { log } from 'apify';
import { RequestOptions } from 'crawlee';
import { ServerResponse } from 'http';

import { ContentCrawlerStatus } from './const.js';
import { Output, UserData } from './types.js';

class ResponseData {
    response: ServerResponse;
    resultsMap: Map<string, Output>;

    constructor(response: ServerResponse) {
        this.response = response;
        this.resultsMap = new Map<string, Output>();
    }
}

const responseData = new Map<string, ResponseData>();

/**
 * Helper function to get response object by responseId.
 */
const getResponse = (responseId: string): ResponseData | null => {
    const res = responseData.get(responseId);
    if (res) return res;

    return null;
};

/**
 * Create a response object for a search request
 * (for content crawler requests there is no need to create a response object).
 */
export const createResponse = (responseId: string, response: ServerResponse) => {
    responseData.set(responseId, new ResponseData(response));
};

/**
 * Add empty result to response object when the content crawler request is created.
 * This is needed to keep track of all results and to know that all results have been handled.
 */
export const addEmptyResultToResponse = (responseId: string, request: RequestOptions<UserData>) => {
    const res = getResponse(responseId);
    if (!res) return;

    const result: Partial<Output> = {
        searchResult: request.userData?.searchResult,
        metadata: { url: request.url },
        crawl: { createdAt: new Date(), requestStatus: ContentCrawlerStatus.PENDING, uniqueKey: request.uniqueKey! },
    };
    res.resultsMap.set(request.uniqueKey!, result as Output);
};

export const addResultToResponse = (responseId: string, uniqueKey: string, result: Output) => {
    const res = getResponse(responseId);
    if (!res) return;

    if (!res.resultsMap.get(uniqueKey)) {
        log.info(
            `Result for request ${result.metadata.url} (key: ${uniqueKey}) were not found in response ${responseId}`,
        );
        return;
    }
    res.resultsMap.set(uniqueKey, { ...res.resultsMap.get(uniqueKey), ...result });
    log.info(`Updated request ${responseId} with result.`);
};

export const sendResponseOk = (responseId: string, result: unknown, contentType: string) => {
    const res = getResponse(responseId);
    if (!res) return;

    res.response.writeHead(200, { 'Content-Type': contentType });
    res.response.end(result);
    log.info(`Response for request ${responseId} has been sent`);
    responseData.delete(responseId);
};

/**
 * Check if all results have been handled. It is used to determine if the response can be sent.
 */
const checkAllResultsHandled = (responseId: string) => {
    const res = getResponse(responseId);
    if (!res) return;

    for (const key of res.resultsMap.keys()) {
        if (res.resultsMap.get(key)!.crawl.requestStatus === ContentCrawlerStatus.PENDING) {
            return false;
        }
    }
    return true;
};

/**
 * Sort results by rank.
 */
const sortResultsByRank = (res: ResponseData): Output[] => {
    const resultsArray = Array.from(res.resultsMap.values());
    resultsArray.sort((a, b) => {
        const ra = a.searchResult.rank ?? Infinity;
        const rb = b.searchResult.rank ?? Infinity;
        return ra - rb;
    });
    return resultsArray;
};

/**
 * Send response with error status code. If the response contains some handled requests,
 * return 200 status otherwise 500.
 */
export const sendResponseError = (responseId: string, message: string) => {
    const res = getResponse(responseId);
    if (!res) return;

    let returnStatusCode = 500;
    for (const key of res.resultsMap.keys()) {
        const { requestStatus } = res.resultsMap.get(key)!.crawl;
        if (requestStatus === ContentCrawlerStatus.PENDING) {
            const r = res.resultsMap.get(key)!;
            r.crawl.httpStatusCode = 500;
            r.crawl.httpStatusMessage = message;
            r.crawl.requestStatus = ContentCrawlerStatus.FAILED;
            r.metadata.title = '';
            r.text = '';
        } else if (requestStatus === ContentCrawlerStatus.HANDLED) {
            returnStatusCode = 200;
        }
    }
    res.response.writeHead(returnStatusCode, { 'Content-Type': 'application/json' });
    if (returnStatusCode === 200) {
        log.warning(`Response for request ${responseId} has been sent with partial results`);
        res.response.end(JSON.stringify(sortResultsByRank(res)));
    } else {
        log.error(`Response for request ${responseId} has been sent with error: ${message}`);
        res.response.end(JSON.stringify({ errorMessage: message }));
    }
    responseData.delete(responseId);
};

/**
 * Send response if all results have been handled or failed.
 */
export const sendResponseIfFinished = (responseId: string) => {
    const res = getResponse(responseId);
    if (!res) return;

    if (checkAllResultsHandled(responseId)) {
        sendResponseOk(responseId, JSON.stringify(sortResultsByRank(res)), 'application/json');
        responseData.delete(responseId);
    }
};
/**
 * Add timeout to all responses when actor is migrating (source: SuperScraper).
 */
export const addTimeoutToAllResponses = (timeoutSeconds: number = 60) => {
    const migrationErrorMessage = {
        errorMessage: `Actor had to migrate to another server. Please, retry your request.`,
    };

    const responseKeys = Object.keys(responseData);

    for (const key of responseKeys) {
        setTimeout(() => {
            sendResponseError(key, JSON.stringify(migrationErrorMessage));
        }, timeoutSeconds * 1000);
    }
};
