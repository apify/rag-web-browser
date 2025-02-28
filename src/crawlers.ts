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

import { scrapeOrganicResults } from './google-search/google-extractors-urls.js';
import { addEmptyResultToResponse, sendResponseError } from './responses.js';
import type { ContentCrawlerUserData, SearchCrawlerUserData } from './types.js';
import { addTimeMeasureEvent, createRequest } from './utils.js';
import { requestHandlerCheerio, failedRequestHandlerCheerio } from './cheerio-req-handler.js';
import { requestHandlerPlaywright, failedRequestHandlerPlaywright } from './playwright-req-handler.js';

const crawlers = new Map<string, CheerioCrawler | PlaywrightCrawler>();
const client = new MemoryStorage({ persistStorage: false });

export function getCrawlerKey(crawlerOptions: CheerioCrawlerOptions | PlaywrightCrawlerOptions) {
    return JSON.stringify(crawlerOptions);
}

/**
 * Creates and starts a Google search crawler and selected content crawler with the provided configurations.
 * A crawler won't be created if it already exists.
 */
export async function createAndStartCrawlers(
    searchCrawlerOptions: CheerioCrawlerOptions,
    contentCrawlerOptions: PlaywrightCrawlerOptions | CheerioCrawlerOptions,
    useCheerioCrawler: boolean,
    startCrawlers: boolean = true,
) {
    const { crawler: searchCrawler } = await createAndStartSearchCrawler(
        searchCrawlerOptions,
        startCrawlers,
    );

    const { key: contentCrawlerKey, crawler: contentCrawler } = await createAndStartContentCrawler(
        contentCrawlerOptions,
        useCheerioCrawler,
        startCrawlers,
    );
    return { searchCrawler, contentCrawler, contentCrawlerKey };
}

/**
 * Creates and starts a Google search crawler with the provided configuration.
 * A crawler won't be created if it already exists.
 */
async function createAndStartSearchCrawler(
    cheerioCrawlerOptions: CheerioCrawlerOptions,
    startCrawler: boolean = true,
) {
    const key = getCrawlerKey(cheerioCrawlerOptions);
    if (crawlers.has(key)) {
        return { key, crawler: crawlers.get(key) };
    }

    log.info(`Creating new cheerio crawler with key ${key}`);
    const crawler = new CheerioCrawler({
        ...(cheerioCrawlerOptions as CheerioCrawlerOptions),
        requestQueue: await RequestQueue.open(key, { storageClient: client }),
        requestHandler: async ({ request, $: _$ }: CheerioCrawlingContext<SearchCrawlerUserData>) => {
            // NOTE: we need to cast this to fix `cheerio` type errors
            addTimeMeasureEvent(request.userData!, 'cheerio-request-handler-start');
            const $ = _$ as CheerioAPI;

            log.info(`Search-crawler requestHandler: Processing URL: ${request.url}`);
            const organicResults = scrapeOrganicResults($);

            // filter organic results to get only results with URL
            let results = organicResults.filter((result) => result.url !== undefined);
            // remove results with URL starting with '/search?q=' (google return empty search results for images)
            results = results.filter((result) => !result.url!.startsWith('/search?q='));

            if (results.length === 0) {
                throw new Error(`No results found for search request: ${request.url}`);
            }

            // limit the number of search results to the maxResults
            results = results.slice(0, request.userData?.maxResults ?? results.length);
            log.info(`Extracted ${results.length} results: \n${results.map((r) => r.url).join('\n')}`);

            addTimeMeasureEvent(request.userData!, 'before-playwright-queue-add');
            const responseId = request.userData.responseId!;
            let rank = 1;
            for (const result of results) {
                result.rank = rank++;
                const r = createRequest(
                    request.userData.query,
                    result,
                    responseId,
                    request.userData.contentScraperSettings!,
                    request.userData.timeMeasures!,
                );
                await addContentCrawlRequest(r, responseId, request.userData.contentCrawlerKey!);
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
            () => { },
        );
        log.info('Google-search-crawler has started 🫡');
    }
    crawlers.set(key, crawler);
    log.info(`Number of crawlers ${crawlers.size}`);
    return { key, crawler };
}

/**
 * Creates and starts a content crawler with the provided configuration.
 * Either Playwright or Cheerio crawler will be created based on the provided flag `useCheerioCrawler`.
 * A crawler won't be created if it already exists.
 */
async function createAndStartContentCrawler(
    crawlerOptions: PlaywrightCrawlerOptions | CheerioCrawlerOptions,
    useCheerioCrawler: boolean,
    startCrawler: boolean = true,
) {
    const key = getCrawlerKey(crawlerOptions);
    if (crawlers.has(key)) {
        return { key, crawler: crawlers.get(key) };
    }

    const crawler = useCheerioCrawler
        ? await createCheerioContentCrawler(crawlerOptions as CheerioCrawlerOptions, key)
        : await createPlaywrightContentCrawler(crawlerOptions as PlaywrightCrawlerOptions, key);

    const name = useCheerioCrawler ? 'cheerio' : 'playwright';
    if (startCrawler) {
        crawler.run().then(
            () => log.warning(`Crawler ${name} has finished`),
            () => {},
        );
        log.info(`Crawler ${name} has started 💪🏼`);
    }
    crawlers.set(key, crawler);
    log.info(`Number of crawlers ${crawlers.size}`);
    return { key, crawler };
}

async function createPlaywrightContentCrawler(
    crawlerOptions: PlaywrightCrawlerOptions,
    key: string,
): Promise<PlaywrightCrawler> {
    log.info(`Creating new playwright crawler with key ${key}`);
    return new PlaywrightCrawler({
        ...crawlerOptions,
        keepAlive: crawlerOptions.keepAlive,
        requestQueue: await RequestQueue.open(key, { storageClient: client }),
        requestHandler: async (context) => {
            await requestHandlerPlaywright(context as unknown as PlaywrightCrawlingContext<ContentCrawlerUserData>);
        },
        failedRequestHandler: ({ request }, err) => failedRequestHandlerPlaywright(request, err),
    });
}

async function createCheerioContentCrawler(
    crawlerOptions: CheerioCrawlerOptions,
    key: string,
): Promise<CheerioCrawler> {
    log.info(`Creating new cheerio crawler with key ${key}`);
    return new CheerioCrawler({
        ...crawlerOptions,
        keepAlive: crawlerOptions.keepAlive,
        requestQueue: await RequestQueue.open(key, { storageClient: client }),
        requestHandler: async (context) => {
            await requestHandlerCheerio(context as unknown as CheerioCrawlingContext<ContentCrawlerUserData>);
        },
        failedRequestHandler: ({ request }, err) => failedRequestHandlerCheerio(request, err),
    });
}

/**
 * Adds a search request to the Google search crawler.
 * Create a response for the request and set the desired number of results (maxResults).
 */
export const addSearchRequest = async (
    request: RequestOptions<ContentCrawlerUserData>,
    cheerioCrawlerOptions: CheerioCrawlerOptions,
) => {
    const key = getCrawlerKey(cheerioCrawlerOptions);
    const crawler = crawlers.get(key);

    if (!crawler) {
        log.error(`Cheerio crawler not found: key ${key}`);
        return;
    }
    addTimeMeasureEvent(request.userData!, 'before-cheerio-queue-add');
    await crawler.requestQueue!.addRequest(request);
    log.info(`Added request to cheerio-google-search-crawler: ${request.url}`);
};

/**
 * Adds a content crawl request to selected content crawler.
 * Get existing crawler based on crawlerOptions and scraperSettings, if not present -> create new
 */
export const addContentCrawlRequest = async (
    request: RequestOptions<ContentCrawlerUserData>,
    responseId: string,
    contentCrawlerKey: string,
) => {
    const crawler = crawlers.get(contentCrawlerKey);
    const name = crawler instanceof PlaywrightCrawler ? 'playwright' : 'cheerio';

    if (!crawler) {
        log.error(`Content crawler not found: key ${contentCrawlerKey}`);
        return;
    }
    try {
        await crawler.requestQueue!.addRequest(request);
        // create an empty result in search request response
        // do not use request.uniqueKey as responseId as it is not id of a search request
        addEmptyResultToResponse(responseId, request);
        log.info(`Added request to the ${name}-content-crawler: ${request.url}`);
    } catch (err) {
        log.error(`Error adding request to ${name}-content-crawler: ${request.url}, error: ${err}`);
    }
};
