import { CheerioCrawlerOptions, log, PlaywrightCrawlerOptions } from 'crawlee';
import { IncomingMessage, ServerResponse } from 'http';

import { PLAYWRIGHT_REQUEST_TIMEOUT_NORMAL_MODE_SECS, Routes } from './const.js';
import { addPlaywrightCrawlRequest, addSearchRequest, createAndStartCrawlers, getPlaywrightCrawlerKey } from './crawlers.js';
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
 * Handles the search request at the /search endpoint.
 */
export async function handleSearchRequest(request: IncomingMessage, response: ServerResponse) {
    try {
        const requestReceivedTime = Date.now();
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
        const playwrightCrawlerKey = getPlaywrightCrawlerKey(playwrightCrawlerOptions, playwrightScraperSettings);
        await createAndStartCrawlers(cheerioCrawlerOptions, playwrightCrawlerOptions, playwrightScraperSettings);

        const inputUrl = interpretAsUrl(input.query);
        input.query = inputUrl ?? input.query;
        // Create a request depending on whether the input is a URL or search query
        const responseId = randomId();
        const req = inputUrl
            ? createRequest({ url: input.query }, responseId, null)
            : createSearchRequest(
                input.query,
                input.maxResults,
                playwrightCrawlerKey,
                cheerioCrawlerOptions.proxyConfiguration,
            );
        addTimeMeasureEvent(req.userData!, 'request-received', requestReceivedTime);
        if (inputUrl) {
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
    const playwrightCrawlerKey = getPlaywrightCrawlerKey(playwrightCrawlerOptions, playwrightScraperSettings);
    const [searchCrawler, playwrightCrawler] = await createAndStartCrawlers(
        cheerioCrawlerOptions,
        playwrightCrawlerOptions,
        playwrightScraperSettings,
        false,
    );

    const inputUrl = interpretAsUrl(input.query);
    input.query = inputUrl ?? input.query;
    // Create a request depending on whether the input is a URL or search query
    const req = inputUrl
        ? createRequest({ url: input.query }, randomId(), null)
        : createSearchRequest(
            input.query,
            input.maxResults,
            playwrightCrawlerKey,
            cheerioCrawlerOptions.proxyConfiguration,
        );
    addTimeMeasureEvent(req.userData!, 'actor-started', startedTime);
    if (inputUrl) {
        // If the input query is a URL, we don't need to run the search crawler
        log.info(`Skipping Google Search query because "${input.query}" is a valid URL.`);
        await addPlaywrightCrawlRequest(req, req.uniqueKey!, playwrightCrawlerKey);
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
