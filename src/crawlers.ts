import { MemoryStorage } from '@crawlee/memory-storage';
import { RequestQueue } from 'apify';
import { CheerioAPI } from 'cheerio';
import {
    CheerioCrawler,
    CheerioCrawlerOptions,
    CheerioCrawlingContext,
    log,
    PlaywrightCrawler,
    PlaywrightCrawlerOptions,
    PlaywrightCrawlingContext,
    RequestOptions,
} from 'crawlee';
import { ServerResponse } from 'http';

import { scrapeOrganicResults } from './google-search/google-extractors-urls.js';
import { failedRequestHandlerPlaywright, requestHandlerPlaywright } from './playwright-req-handler.js';
import { createResponse, addEmptyResultToResponse, sendResponseError } from './responses.js';
import { PlaywrightScraperSettings, UserData } from './types.js';
import { addTimeMeasureEvent, createRequest } from './utils.js';

const crawlers = new Map<string, CheerioCrawler | PlaywrightCrawler>();
const client = new MemoryStorage({ persistStorage: false });

export function getSearchCrawlerKey(cheerioCrawlerOptions: CheerioCrawlerOptions) {
    return JSON.stringify(cheerioCrawlerOptions);
}

export function getPlaywrightCrawlerKey(
    playwrightCrawlerOptions: PlaywrightCrawlerOptions,
    playwrightScraperSettings: PlaywrightScraperSettings,
) {
    return JSON.stringify(playwrightCrawlerOptions) + JSON.stringify(playwrightScraperSettings);
}

/**
 * Creates and starts a Google search crawler and Playwright content crawler with the provided configurations.
 */
export async function createAndStartCrawlers(
    cheerioCrawlerOptions: CheerioCrawlerOptions,
    playwrightCrawlerOptions: PlaywrightCrawlerOptions,
    playwrightScraperSettings: PlaywrightScraperSettings,
    startCrawlers: boolean = true,
) {
    const searchCrawler = await createAndStartSearchCrawler(
        cheerioCrawlerOptions,
        startCrawlers,
    );
    const playwrightCrawler = await createAndStartCrawlerPlaywright(
        playwrightCrawlerOptions,
        playwrightScraperSettings,
        startCrawlers,
    );
    const playwrightCrawlerKey = getPlaywrightCrawlerKey(playwrightCrawlerOptions, playwrightScraperSettings);
    return { playwrightCrawlerKey, searchCrawler, playwrightCrawler };
}

/**
 * Creates and starts a Google search crawler with the provided configuration.
 */
async function createAndStartSearchCrawler(
    cheerioCrawlerOptions: CheerioCrawlerOptions,
    startCrawler: boolean = true,
) {
    const key = getSearchCrawlerKey(cheerioCrawlerOptions);
    if (crawlers.has(key)) {
        return crawlers.get(key);
    }

    log.info(`Creating new cheerio crawler with key ${key}`);
    const crawler = new CheerioCrawler({
        ...(cheerioCrawlerOptions as CheerioCrawlerOptions),
        requestQueue: await RequestQueue.open(key, { storageClient: client }),
        requestHandler: async ({ request, $: _$ }: CheerioCrawlingContext<UserData>) => {
            // NOTE: we need to cast this to fix `cheerio` type errors
            addTimeMeasureEvent(request.userData!, 'cheerio-request-handler-start');
            const $ = _$ as CheerioAPI;

            log.info(`Search-crawler requestHandler: Processing URL: ${request.url}`);
            const organicResults = scrapeOrganicResults($);

            // filter organic results to get only results with URL
            let results = organicResults.filter((result) => result.url !== undefined);
            // remove results with URL starting with '/search?q=' (google return empty search results for images)
            results = results.filter((result) => !result.url!.startsWith('/search?q='));

            // limit the number of search results to the maxResults
            results = results.slice(0, request.userData?.maxResults ?? results.length);
            log.info(`Extracted ${results.length} results: \n${results.map((r) => r.url).join('\n')}`);

            addTimeMeasureEvent(request.userData!, 'before-playwright-queue-add');
            const responseId = request.uniqueKey;
            let rank = 1;
            for (const result of results) {
                result.rank = rank++;
                const r = createRequest(result, responseId, request.userData.timeMeasures!);
                await addPlaywrightCrawlRequest(r, responseId, request.userData.playwrightCrawlerKey!);
            }
        },
        failedRequestHandler: async ({ request }, err) => {
            addTimeMeasureEvent(request.userData!, 'cheerio-failed-request');
            log.error(`Google-search-crawler failed to process request ${request.url}, error ${err.message}`);
            const errorResponse = { errorMessage: err.message };
            sendResponseError(request.uniqueKey, JSON.stringify(errorResponse));
        },
    });
    if (startCrawler) {
        crawler.run().then(
            () => log.warning(`Google-search-crawler has finished`),
            () => {},
        );
        log.info('Google-search-crawler has started 🫡');
    }
    crawlers.set(key, crawler);
    log.info(`Number of crawlers ${crawlers.size}`);
    return crawler;
}

async function createAndStartCrawlerPlaywright(
    crawlerOptions: PlaywrightCrawlerOptions,
    settings: PlaywrightScraperSettings,
    startCrawler: boolean = true,
) {
    const key = getPlaywrightCrawlerKey(crawlerOptions, settings);
    if (crawlers.has(key)) {
        return crawlers.get(key);
    }

    log.info(`Creating new playwright crawler with key ${key}`);
    const crawler = new PlaywrightCrawler({
        ...(crawlerOptions as PlaywrightCrawlerOptions),
        keepAlive: crawlerOptions.keepAlive,
        requestQueue: await RequestQueue.open(key, { storageClient: client }),
        requestHandler: (context: PlaywrightCrawlingContext) => requestHandlerPlaywright(context, settings),
        failedRequestHandler: ({ request }, err) => failedRequestHandlerPlaywright(request, err),
    });

    if (startCrawler) {
        crawler.run().then(
            () => log.warning(`Crawler playwright has finished`),
            () => {},
        );
        log.info('Crawler playwright has started 💪🏼');
    }
    crawlers.set(key, crawler);
    log.info(`Number of crawlers ${crawlers.size}`);
    return crawler;
}

/**
 * Adds a search request to the Google search crawler.
 * Create a response for the request and set the desired number of results (maxResults).
 */
export const addSearchRequest = async (
    request: RequestOptions<UserData>,
    response: ServerResponse | null,
    cheerioCrawlerOptions: CheerioCrawlerOptions,
) => {
    const key = getSearchCrawlerKey(cheerioCrawlerOptions);
    const crawler = crawlers.get(key);

    if (!crawler) {
        log.error(`Cheerio crawler not found: key ${key}`);
        return;
    }

    if (response) {
        createResponse(request.uniqueKey!, response);
        log.info(`Created response for request ${request.uniqueKey}, request.url: ${request.url}`);
    }
    addTimeMeasureEvent(request.userData!, 'before-cheerio-queue-add');
    await crawler.requestQueue!.addRequest(request);
    log.info(`Added request to cheerio-google-search-crawler: ${request.url}`);
};

/**
 * Adds a content crawl request to the Playwright content crawler.
 * Get existing crawler based on crawlerOptions and scraperSettings, if not present -> create new
 */
export const addPlaywrightCrawlRequest = async (
    request: RequestOptions<UserData>,
    responseId: string,
    playwrightCrawlerKey: string,
) => {
    const crawler = crawlers.get(playwrightCrawlerKey);
    if (!crawler) {
        log.error(`Playwright crawler not found: key ${playwrightCrawlerKey}`);
        return;
    }
    try {
        await crawler.requestQueue!.addRequest(request);
        // create an empty result in search request response
        // do not use request.uniqueKey as responseId as it is not id of a search request
        addEmptyResultToResponse(responseId, request);
        log.info(`Added request to the playwright-content-crawler: ${request.url}`);
    } catch (err) {
        log.error(`Error adding request to playwright-content-crawler: ${request.url}, error: ${err}`);
    }
};
