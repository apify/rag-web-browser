import { log } from 'apify';
import { ServerResponse } from 'http';

// const responses = new Map<string, ServerResponse>();

// interface ResponseData {
//     response: ServerResponse;
//     resultsCount: number;
//     resultsRequired: number;
//     results: unknown[];
// }

class ResponseData {
    response: ServerResponse;
    resultCount: number;
    searchResultCount: number;
    results: unknown[];

    constructor(response: ServerResponse) {
        this.response = response;
        this.resultCount = 0;
        this.searchResultCount = 0;
        this.results = [];
    }
}

const responseData = new Map<string, ResponseData>();

const getResponseDataById = (responseId: string): ResponseData | null => {
    const res = responseData.get(responseId);
    if (!res) {
        log.info(`Response for request ${responseId} not found`);
        return null;
    }
    return res;
};

export const addSearchResultCount = (responseId: string, countRequired: number) => {
    const res = getResponseDataById(responseId);
    if (!res) return;
    res.searchResultCount = countRequired;
    log.info(`Response for request ${responseId} requires ${countRequired} results`);
};

export const sendSuccResponseById = (responseId: string, result: unknown, contentType: string) => {
    const res = responseData.get(responseId);
    if (!res) {
        log.info(`Response for request ${responseId} not found`);
        return;
    }
    res.response.writeHead(200, { 'Content-Type': contentType });
    res.response.end(result);
    responseData.delete(responseId);
};

export const sendErrorResponseById = (responseId: string, result: string, statusCode: number = 500) => {
    const res = responseData.get(responseId);
    if (!res) {
        log.info(`Response for request ${responseId} not found`);
        return;
    }
    // res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    // res.end(result);
    responseData.delete(responseId);
};

export const addResponse = (responseId: string, response: ServerResponse) => {
    responseData.set(responseId, new ResponseData(response));
};

export const addResultToResponse = (responseId: string, result: unknown) => {
    const res = responseData.get(responseId);
    if (!res) {
        log.info(`Response for request ${responseId} not found`);
        return;
    }

    if (res.searchResultCount === null) {
        log.info(`Response for request ${responseId} does not require any results`);
        return;
    }

    res.results.push(result);
    res.resultCount += 1;
    log.info(`Response for request ${responseId} has ${res.resultCount} results, ${res.searchResultCount} required`);

    if (res.resultCount >= res.searchResultCount) {
        sendSuccResponseById(responseId, JSON.stringify(res.results), 'application/json');
        responseData.delete(responseId);
    }
};

export const addTimeoutToAllResponses = (timeoutInSeconds: number = 60) => {
    const migrationErrorMessage = {
        errorMessage: `Actor had to migrate to another server. Please, retry your request.`,
    };

    const responseKeys = Object.keys(responseData);

    for (const key of responseKeys) {
        setTimeout(() => {
            sendErrorResponseById(key, JSON.stringify(migrationErrorMessage));
        }, timeoutInSeconds * 1000);
    }
};
