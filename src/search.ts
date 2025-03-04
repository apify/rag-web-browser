import { CheerioCrawlerOptions, log, PlaywrightCrawlerOptions } from 'crawlee';
import { IncomingMessage, ServerResponse } from 'http';

import { PLAYWRIGHT_REQUEST_TIMEOUT_NORMAL_MODE_SECS, Routes } from './const.js';
import { addContentCrawlRequest, addSearchRequest, createAndStartCrawlers } from './crawlers.js';
import { UserInputError } from './errors.js';
import { processInput } from './input.js';
import { createResponsePromise } from './responses.js';
import { Input, Output, ContentScraperSettings } from './types.js';
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
    searchCrawlerOptions: CheerioCrawlerOptions,
    contentCrawlerKey: string,
    contentScraperSettings: ContentScraperSettings,
) {
    const interpretedUrl = interpretAsUrl(input.query);
    const query = interpretedUrl ?? input.query;
    const responseId = randomId();

    const req = interpretedUrl
        ? createRequest(
            query,
            { url: query },
            responseId,
            contentScraperSettings,
            null,
        )
        : createSearchRequest(
            query,
            responseId,
            input.maxResults,
            contentCrawlerKey,
            searchCrawlerOptions.proxyConfiguration,
            contentScraperSettings,
        );

    addTimeMeasureEvent(req.userData!, 'request-received', Date.now());
    return { req, isUrl: !!interpretedUrl, responseId };
}

/**
 * Internal function that handles the common logic for search.
 * Returns a promise that resolves to the final results array of Output objects.
 */
async function runSearchProcess(params: Partial<Input>): Promise<Output[]> {
    // Process the query parameters the same way as normal inputs
    const {
        input,
        searchCrawlerOptions,
        contentCrawlerOptions,
        contentScraperSettings,
    } = await processInput(params);

    // Create and start crawlers
    const { contentCrawlerKey } = await createAndStartCrawlers(
        searchCrawlerOptions,
        contentCrawlerOptions,
        input.useCheerioCrawler,
    );

    const { req, isUrl, responseId } = prepareRequest(
        input,
        searchCrawlerOptions,
        contentCrawlerKey,
        contentScraperSettings,
    );

    // Create a promise that resolves when all requests are processed
    const resultsPromise = createResponsePromise(responseId, input.requestTimeoutSecs);

    if (isUrl) {
        // If input is a direct URL, skip the search crawler
        log.info(`Skipping Google Search query as "${input.query}" is a valid URL`);
        await addContentCrawlRequest(req, responseId, contentCrawlerKey);
    } else {
        // If input is a search query, run the search crawler first
        await addSearchRequest(req, searchCrawlerOptions);
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
export async function handleModelContextProtocol(params: Partial<Input>): Promise<Output[]> {
    try {
        log.info(`Received parameters: ${JSON.stringify(params)}`);
        return await runSearchProcess(params);
    } catch (e) {
        const error = e as Error;
        log.error(`UserInputError occurred: ${error.message}`);
        return [{ text: error.message }] as Output[];
    }
}

/**
 * Runs the search and scrape in normal mode.
 */
export async function handleSearchNormalMode(input: Input,
    searchCrawlerOptions: CheerioCrawlerOptions,
    contentCrawlerOptions: PlaywrightCrawlerOptions | CheerioCrawlerOptions,
    contentScraperSettings: ContentScraperSettings,
) {
    const startedTime = Date.now();
    searchCrawlerOptions.keepAlive = false;
    contentCrawlerOptions.keepAlive = false;
    contentCrawlerOptions.requestHandlerTimeoutSecs = PLAYWRIGHT_REQUEST_TIMEOUT_NORMAL_MODE_SECS;

    // contentCrawlerKey is used to identify the crawler that should process the search results
    const { contentCrawlerKey, searchCrawler, contentCrawler } = await createAndStartCrawlers(
        searchCrawlerOptions,
        contentCrawlerOptions,
        false,
    );

    const { req, isUrl } = prepareRequest(
        input,
        searchCrawlerOptions,
        contentCrawlerKey,
        contentScraperSettings,
    );
    if (isUrl) {
        // If the input query is a URL, we don't need to run the search crawler
        log.info(`Skipping Google Search query because "${input.query}" is a valid URL.`);
        await addContentCrawlRequest(req, '', contentCrawlerKey);
    } else {
        await addSearchRequest(req, searchCrawlerOptions);
        addTimeMeasureEvent(req.userData!, 'before-cheerio-run', startedTime);
        log.info(`Running Google Search crawler with request: ${JSON.stringify(req)}`);
        await searchCrawler!.run();
    }

    addTimeMeasureEvent(req.userData!, 'before-playwright-run', startedTime);
    log.info(`Running target page crawler with request: ${JSON.stringify(req)}`);
    await contentCrawler!.run();
}
