import { log } from 'apify';
import { ServerResponse } from 'http';

import { ContentCrawlerStatus } from './const.js';
import { Output } from './types.js';

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
export const addEmptyResultToResponse = (responseId: string, uniqueKey: string, url: string) => {
    const res = getResponse(responseId);
    if (!res) return;

    const result: Partial<Output> = {
        crawl: { createdAt: new Date(), requestStatus: ContentCrawlerStatus.PENDING, uniqueKey },
        metadata: { url },
    };
    res.resultsMap.set(uniqueKey, result as Output);
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
            res.resultsMap.get(key)!.crawl.httpStatusCode = 500;
            res.resultsMap.get(key)!.crawl.httpStatusMessage = message;
            res.resultsMap.get(key)!.crawl.requestStatus = ContentCrawlerStatus.FAILED;
        } else if (requestStatus === ContentCrawlerStatus.HANDLED) {
            returnStatusCode = 200;
        }
    }
    res.response.writeHead(returnStatusCode, { 'Content-Type': 'application/json' });
    if (returnStatusCode === 200) {
        log.warning(`Response for request ${responseId} has been sent with partial results`);
        res.response.end(JSON.stringify(Array.from(res.resultsMap.values())));
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

    // Check if all results have been handled or failed
    const allResults = Array.from(res.resultsMap.values());
    const allResultsHandled = allResults.every((_r) => _r.crawl.requestStatus !== ContentCrawlerStatus.PENDING);
    if (allResultsHandled) {
        sendResponseOk(responseId, JSON.stringify(allResults), 'application/json');
        responseData.delete(responseId);
    }
};
/**
 * Add timeout to all responses when actor is migrating (source: SuperScraper).
 */
export const addTimeoutToAllResponses = (timeoutInSeconds: number = 60) => {
    const migrationErrorMessage = {
        errorMessage: `Actor had to migrate to another server. Please, retry your request.`,
    };

    const responseKeys = Object.keys(responseData);

    for (const key of responseKeys) {
        setTimeout(() => {
            sendResponseError(key, JSON.stringify(migrationErrorMessage));
        }, timeoutInSeconds * 1000);
    }
};
