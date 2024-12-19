import { CheerioCrawlerOptions, log, PlaywrightCrawlerOptions } from 'crawlee';
import { IncomingMessage, ServerResponse } from 'http';

import { PLAYWRIGHT_REQUEST_TIMEOUT_NORMAL_MODE_SECS, Routes } from './const.js';
import { addPlaywrightCrawlRequest, addSearchRequest, createAndStartCrawlers } from './crawlers.js';
import { UserInputError } from './errors.js';
import { processInput } from './input.js';
import { createResponse, sendResponseError } from './responses.js';
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
        ? createRequest({ url: query }, responseId, null)
        : createSearchRequest(query, input.maxResults, playwrightCrawlerKey, cheerioCrawlerOptions.proxyConfiguration);

    addTimeMeasureEvent(req.userData!, 'request-received', Date.now());
    return { req, isUrl: !!interpretedUrl, responseId };
}

/**
 * Handles the search request at the /search endpoint.
 */
export async function handleSearchRequest(request: IncomingMessage, response: ServerResponse) {
    try {
        const params = parseParameters(request.url?.slice(Routes.SEARCH.length, request.url.length) ?? '');
        log.info(`Received query parameters: ${JSON.stringify(params)}`);
        checkAndRemoveExtraParams(params);

        // Process the query parameters the same way se normal inputs
        const {
            input,
            cheerioCrawlerOptions,
            playwrightCrawlerOptions,
            playwrightScraperSettings,
        } = await processInput(params as Partial<Input>);

        // playwrightCrawlerKey is used to identify the crawler that should process the search results
        const { playwrightCrawlerKey } = await createAndStartCrawlers(
            cheerioCrawlerOptions,
            playwrightCrawlerOptions,
            playwrightScraperSettings,
        );

        const { req, isUrl, responseId } = prepareRequest(input, cheerioCrawlerOptions, playwrightCrawlerKey);
        if (isUrl) {
            // If the input query is a URL, we don't need to run the search crawler
            log.info(`Skipping Google Search query as ${input.query} is a valid URL`);
            createResponse(responseId, response);
            await addPlaywrightCrawlRequest(req, responseId, playwrightCrawlerKey);
        } else {
            await addSearchRequest(req, response, cheerioCrawlerOptions);
        }
        setTimeout(() => {
            sendResponseError(req.uniqueKey!, 'Timed out');
        }, input.requestTimeoutSecs * 1000);
    } catch (e) {
        const error = e as Error;
        const errorMessage = { errorMessage: error.message };
        const statusCode = error instanceof UserInputError ? 400 : 500;
        log.error(`UserInputError occurred: ${error.message}`);
        response.writeHead(statusCode, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(errorMessage));
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
        await addSearchRequest(req, null, cheerioCrawlerOptions);
        addTimeMeasureEvent(req.userData!, 'before-cheerio-run', startedTime);
        log.info(`Running Google Search crawler with request: ${JSON.stringify(req)}`);
        await searchCrawler!.run();
    }

    addTimeMeasureEvent(req.userData!, 'before-playwright-run', startedTime);
    log.info(`Running target page crawler with request: ${JSON.stringify(req)}`);
    await playwrightCrawler!.run();
}
