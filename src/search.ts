import { CheerioCrawlerOptions, log, PlaywrightCrawlerOptions } from 'crawlee';
import { IncomingMessage, ServerResponse } from 'http';

import { PLAYWRIGHT_REQUEST_TIMEOUT_NORMAL_MODE_SECS, Routes } from './const.js';
import { addPlaywrightCrawlRequest, addSearchRequest, createAndStartCrawlers } from './crawlers.js';
import { UserInputError } from './errors.js';
import { processInput } from './input.js';
import { createResponsePromise } from './responses.js';
import { Input, PlaywrightScraperSettings } from './types.js';
import {
    addTimeMeasureEvent,
    checkAndRemoveExtraParams,
    createRequest,
    createSearchRequest,
    interpretAsUrl,
    parseParameters,
    randomId,
} from './utils.js';

/**
 * Prepares the request for the search.
 * Decide whether input.query is a URL or a search query. If it's a URL, we don't need to run the search crawler.
 * Return the request, isUrl and responseId.
 */
function prepareRequest(
    input: Input,
    cheerioCrawlerOptions: CheerioCrawlerOptions,
    playwrightCrawlerKey: string,
) {
    const interpretedUrl = interpretAsUrl(input.query);
    const query = interpretedUrl ?? input.query;
    const responseId = randomId();

    const req = interpretedUrl
        ? createRequest(
            { url: query },
            responseId,
            null,
        )
        : createSearchRequest(
            query,
            responseId,
            input.maxResults,
            playwrightCrawlerKey,
            cheerioCrawlerOptions.proxyConfiguration,
        );

    addTimeMeasureEvent(req.userData!, 'request-received', Date.now());
    return { req, isUrl: !!interpretedUrl, responseId };
}

/**
 * Internal function that handles the common logic for search.
 * Returns a promise that resolves to the final results array of Output objects.
 */
async function runSearchProcess(params: Partial<Input>): Promise<unknown> {
    // Process the query parameters the same way as normal inputs
    const {
        input,
        cheerioCrawlerOptions,
        playwrightCrawlerOptions,
        playwrightScraperSettings,
    } = await processInput(params);

    // Create and start crawlers
    const { playwrightCrawlerKey } = await createAndStartCrawlers(
        cheerioCrawlerOptions,
        playwrightCrawlerOptions,
        playwrightScraperSettings,
    );

    const { req, isUrl, responseId } = prepareRequest(input, cheerioCrawlerOptions, playwrightCrawlerKey);

    // Create a promise that resolves when all requests are processed
    const resultsPromise = createResponsePromise(responseId, input.requestTimeoutSecs);

    if (isUrl) {
        // If input is a direct URL, skip the search crawler
        log.info(`Skipping Google Search query as "${input.query}" is a valid URL`);
        await addPlaywrightCrawlRequest(req, responseId, playwrightCrawlerKey);
    } else {
        // If input is a search query, run the search crawler first
        await addSearchRequest(req, cheerioCrawlerOptions);
    }

    // Return promise that resolves when all requests are processed
    return resultsPromise;
}

/**
 * Handles the search request at the /search endpoint (HTTP scenario).
 * Uses the unified runSearchProcess function and then sends an HTTP response.
 */
export async function handleSearchRequest(request: IncomingMessage, response: ServerResponse) {
    try {
        const params = parseParameters(request.url?.slice(Routes.SEARCH.length) ?? '');
        log.info(`Received query parameters: ${JSON.stringify(params)}`);
        checkAndRemoveExtraParams(params);

        const results = await runSearchProcess(params);

        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(results));
    } catch (e) {
        const error = e as Error;
        const statusCode = error instanceof UserInputError ? 400 : 500;
        log.error(`Error occurred: ${error.message}`);
        response.writeHead(statusCode, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ errorMessage: error.message }));
    }
}

/**
 * Handles the model context protocol scenario (non-HTTP scenario).
 * Uses the same runSearchProcess function but just returns the results as a promise.
 */
export async function handleModelContextProtocol(params: Partial<Input>) {
    try {
        log.info(`Received parameters: ${JSON.stringify(params)}`);
        return await runSearchProcess(params);
    } catch (e) {
        const error = e as Error;
        log.error(`UserInputError occurred: ${error.message}`);
        return JSON.stringify({ errorMessage: error.message });
    }
}

/**
 * Runs the search and scrape in normal mode.
 */
export async function handleSearchNormalMode(input: Input,
    cheerioCrawlerOptions: CheerioCrawlerOptions,
    playwrightCrawlerOptions: PlaywrightCrawlerOptions,
    playwrightScraperSettings: PlaywrightScraperSettings,
) {
    const startedTime = Date.now();
    cheerioCrawlerOptions.keepAlive = false;
    playwrightCrawlerOptions.keepAlive = false;
    playwrightCrawlerOptions.requestHandlerTimeoutSecs = PLAYWRIGHT_REQUEST_TIMEOUT_NORMAL_MODE_SECS;

    // playwrightCrawlerKey is used to identify the crawler that should process the search results
    const { playwrightCrawlerKey, searchCrawler, playwrightCrawler } = await createAndStartCrawlers(
        cheerioCrawlerOptions,
        playwrightCrawlerOptions,
        playwrightScraperSettings,
        false,
    );

    const { req, isUrl } = prepareRequest(input, cheerioCrawlerOptions, playwrightCrawlerKey);
    if (isUrl) {
        // If the input query is a URL, we don't need to run the search crawler
        log.info(`Skipping Google Search query because "${input.query}" is a valid URL.`);
        await addPlaywrightCrawlRequest(req, '', playwrightCrawlerKey);
    } else {
        await addSearchRequest(req, cheerioCrawlerOptions);
        addTimeMeasureEvent(req.userData!, 'before-cheerio-run', startedTime);
        log.info(`Running Google Search crawler with request: ${JSON.stringify(req)}`);
        await searchCrawler!.run();
    }

    addTimeMeasureEvent(req.userData!, 'before-playwright-run', startedTime);
    log.info(`Running target page crawler with request: ${JSON.stringify(req)}`);
    await playwrightCrawler!.run();
}
