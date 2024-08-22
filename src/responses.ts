import { log } from 'apify';
import { ServerResponse } from 'http';

class ResponseData {
    createdAt: Date;
    response: ServerResponse;
    resultCount: number;
    results: unknown[];
    maxResults: number;

    constructor(response: ServerResponse, maxResults: number) {
        this.createdAt = new Date();
        this.response = response;
        this.resultCount = 0;
        this.results = [];
        this.maxResults = maxResults;
    }
}

const responseData = new Map<string, ResponseData>();

export const createResponse = (responseId: string, response: ServerResponse, maxResults: number) => {
    responseData.set(responseId, new ResponseData(response, maxResults));
};

const getResponse = (responseId: string): ResponseData | null => {
    const res = responseData.get(responseId);
    if (res) return res;

    log.info(`Response for request ${responseId} not found`);
    return null;
};

export const sendResponseOk = (responseId: string, result: unknown, contentType: string) => {
    const res = getResponse(responseId);
    if (!res) return;

    res.response.writeHead(200, { 'Content-Type': contentType });
    res.response.end(result);
    log.info(`Response for request ${responseId} has been sent`);
    responseData.delete(responseId);
};

export const sendResponseError = (responseId: string, result: string, statusCode: number = 500) => {
    const res = getResponse(responseId);
    if (!res) return;
    res.response.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.response.end(result);
    responseData.delete(responseId);
};

export const handleResponse = (responseId: string, result: unknown) => {
    const res = getResponse(responseId);
    if (!res) return;

    addResultToResponse(responseId, result);

    if (res.resultCount >= res.maxResults) {
        sendResponseOk(responseId, JSON.stringify(res.results), 'application/json');
        responseData.delete(responseId);
    }
};

const addResultToResponse = (responseId: string, result: unknown) => {
    const res = getResponse(responseId);
    if (!res) return;

    if (res.maxResults === null) {
        log.info(`Response for request ${responseId} does not require any results`);
        return;
    }
    res.results.push(result);
    res.resultCount += 1;
    log.info(`Updated request ${responseId} with result. ${res.resultCount} results, ${res.maxResults} required`);
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
