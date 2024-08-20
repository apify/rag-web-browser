import { log } from 'apify';
import { ServerResponse } from 'http';

const responses = new Map<string, ServerResponse>();

export const sendSuccResponseById = (responseId: string, result: unknown, contentType: string) => {
    const res = responses.get(responseId);
    if (!res) {
        log.info(`Response for request ${responseId} not found`);
        return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(result);
    responses.delete(responseId);
};

export const sendErrorResponseById = (responseId: string, result: string, statusCode: number = 500) => {
    const res = responses.get(responseId);
    if (!res) {
        log.info(`Response for request ${responseId} not found`);
        return;
    }
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(result);
    responses.delete(responseId);
};

export const addResponse = (responseId: string, response: ServerResponse) => {
    responses.set(responseId, response);
};

export const addTimeoutToAllResponses = (timeoutInSeconds: number = 60) => {
    const migrationErrorMessage = {
        errorMessage: `Actor had to migrate to another server. Please, retry your request.`,
    };

    const responseKeys = Object.keys(responses);

    for (const key of responseKeys) {
        setTimeout(() => {
            sendErrorResponseById(key, JSON.stringify(migrationErrorMessage));
        }, timeoutInSeconds * 1000);
    }
};
