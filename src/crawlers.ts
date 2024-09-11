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

import { CrawlerQueueName, CrawlerType } from './const.js';
import { scrapeOrganicResults } from './google-search/google-extractors-urls.js';
import { failedRequestHandlerPlaywright, requestHandlerPlaywright } from './playwright-req-handler.js';
import { createResponse, addEmptyResultToResponse, sendResponseError } from './responses.js';
import { PlaywrightScraperSettings, UserData } from './types.js';
import { addTimeMeasureEvent, createRequest } from './utils.js';

const crawlers = new Map<string, CheerioCrawler | PlaywrightCrawler>();
const client = new MemoryStorage({ persistStorage: false });

log.setLevel(log.LEVELS.DEBUG);

/**
 * Creates and starts a Google search crawler with the provided configuration.
 * Additionally, it can use the playwright crawler configuration to spin up a new playwright crawler.
 *
 * Note: In the future, the actor might run in standby mode with a different configuration,
 * which may require creating a new Playwright content crawler with a different options and settings.
 */
export async function createAndStartSearchCrawler(
    cheerioCrawlerOptions: CheerioCrawlerOptions,
    playwrightCrawlerOptions: PlaywrightCrawlerOptions,
    playwrightScraperSettings: PlaywrightScraperSettings,
    startCrawler: boolean = true,
) {
    const crawler = new CheerioCrawler({
        ...(cheerioCrawlerOptions as CheerioCrawlerOptions),
        requestQueue: await RequestQueue.open(CrawlerQueueName.CHEERIO_SEARCH_QUEUE, { storageClient: client }),
        requestHandler: async ({ request, $: _$ }: CheerioCrawlingContext<UserData>) => {
            // NOTE: we need to cast this to fix `cheerio` type errors
            addTimeMeasureEvent(request.userData!, 'cheerio-request-handler-start');
            const $ = _$ as CheerioAPI;

            log.info(`${CrawlerType.CHEERIO_GOOGLE_SEARCH_CRAWLER} requestHandler: Processing URL: ${request.url}`);
            const organicResults = scrapeOrganicResults($);

            // filter organic results to get only results with URL
            let results = organicResults.filter((result) => result.url !== undefined);

            // limit the number of search results to the maxResults
            results = results.slice(0, request.userData?.maxResults ?? results.length);
            log.info(`Extracted ${results.length} results: \n${results.map((r) => r.url).join('\n')}`);

            addTimeMeasureEvent(request.userData!, 'before-playwright-queue-add');
            const responseId = request.uniqueKey;
            for (const result of results) {
                const r = createRequest(result, responseId, request.userData.timeMeasures!);
                await addContentCrawlRequest(r, responseId, playwrightCrawlerOptions, playwrightScraperSettings);
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
    // The `crawlers` map is currently not required but is included for future use when different crawling options
    // might be needed.
    const key = CrawlerType.CHEERIO_GOOGLE_SEARCH_CRAWLER;
    crawlers.set(key, crawler);
    return crawler;
}

export async function createAndStartCrawlerPlaywright(
    crawlerOptions: PlaywrightCrawlerOptions,
    settings: PlaywrightScraperSettings,
    startCrawler: boolean = true,
) {
    const crawler = new PlaywrightCrawler({
        ...(crawlerOptions as PlaywrightCrawlerOptions),
        keepAlive: crawlerOptions.keepAlive,
        requestQueue: await RequestQueue.open(CrawlerQueueName.PLAYWRIGHT_CONTENT_CRAWL_QUEUE, {
            storageClient: client,
        }),
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
    // The `crawlers` map is currently not required but is included for future use when different crawling options
    // might be needed.
    const key = CrawlerType.PLAYWRIGHT_CONTENT_CRAWLER;
    crawlers.set(key, crawler);
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
    playwrightCrawlerOptions: PlaywrightCrawlerOptions,
    playwrightScraperSettings: PlaywrightScraperSettings,
) => {
    const key = CrawlerType.CHEERIO_GOOGLE_SEARCH_CRAWLER;
    const crawler = crawlers.has(key)
        ? crawlers.get(key)!
        : await createAndStartSearchCrawler(cheerioCrawlerOptions, playwrightCrawlerOptions, playwrightScraperSettings);

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
export const addContentCrawlRequest = async (
    request: RequestOptions<UserData>,
    responseId: string,
    crawlerOptions: PlaywrightCrawlerOptions,
    scraperSettings: PlaywrightScraperSettings,
) => {
    const key = CrawlerType.PLAYWRIGHT_CONTENT_CRAWLER;
    const crawler = crawlers.get(key) ?? (await createAndStartCrawlerPlaywright(crawlerOptions, scraperSettings));
    await crawler.requestQueue!.addRequest(request);
    // create an empty result in search request response
    // do not use request.uniqueKey as responseId as it is not id of a search request
    addEmptyResultToResponse(responseId, request);
    log.info(`Added request to the playwright-content-crawler: ${request.url}`);
};
