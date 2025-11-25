import { MemoryStorage } from '@crawlee/memory-storage';
import { RequestQueue } from 'apify';
import {
    CheerioAPI,
    CheerioCrawler,
    type CheerioCrawlerOptions,
    type CheerioCrawlingContext,
    log,
    PlaywrightCrawler,
    type PlaywrightCrawlerOptions,
    type PlaywrightCrawlingContext,
    type RequestOptions,
} from 'crawlee';

import { ContentCrawlerTypes, GOOGLE_STANDARD_RESULTS_PER_PAGE } from './const.js';
import { deduplicateResults, scrapeOrganicResults } from './google-search/google-extractors-urls.js';
import { failedRequestHandler, requestHandlerCheerio, requestHandlerPlaywright } from './request-handler.js';
import { addEmptyResultToResponse, sendResponseError } from './responses.js';
import type { ContentCrawlerOptions, ContentCrawlerUserData, SearchCrawlerUserData } from './types.js';
import { addTimeMeasureEvent, createRequest, createSearchRequest } from './utils.js';

const crawlers = new Map<string, CheerioCrawler | PlaywrightCrawler>();
const client = new MemoryStorage({ persistStorage: false });

export function getCrawlerKey(crawlerOptions: CheerioCrawlerOptions | PlaywrightCrawlerOptions) {
    return JSON.stringify(crawlerOptions);
}

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

/**
 * Creates and starts a Google search crawler with the provided configuration.
 * A crawler won't be created if it already exists.
 */
export async function createAndStartSearchCrawler(
    searchCrawlerOptions: CheerioCrawlerOptions,
    startCrawler = true,
) {
    const key = getCrawlerKey(searchCrawlerOptions);
    if (crawlers.has(key)) {
        return { key, crawler: crawlers.get(key) };
    }

    log.info(`Creating new cheerio crawler with key ${key}`);
    const crawler = new CheerioCrawler({
        ...(searchCrawlerOptions as CheerioCrawlerOptions),
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

            // Initialize or update collected results
            const collectedResults = request.userData.collectedResults || [];
            const currentPage = request.userData.currentPage || 0;
            // Calculate total pages to scrape: base pages + 1 extra to account for pages with fewer than GOOGLE_STANDARD_RESULTS_PER_PAGE results
            const totalPages = request.userData.totalPages || Math.ceil(request.userData.maxResults / GOOGLE_STANDARD_RESULTS_PER_PAGE) + 1;

            // Merge with previously collected results and deduplicate
            const allResults = [...collectedResults, ...results];
            const deduplicated = deduplicateResults(allResults);

            log.info(`Page ${currentPage + 1}/${totalPages}: Extracted ${results.length} results, Total unique: ${deduplicated.length}/${request.userData.maxResults}`);

            // Decide whether to fetch the next page
            // Continue fetching if: (1) we haven't reached maxResults AND (2) we haven't exceeded totalPages AND (3) Google returned results
            const shouldFetchNextPage = deduplicated.length < request.userData.maxResults
                && currentPage + 1 < totalPages
                && results.length > 0; // Stop if Google returned 0 results (empty page)

            if (shouldFetchNextPage) {
                // Queue the next page
                const nextPage = currentPage + 1;
                const nextOffset = nextPage * GOOGLE_STANDARD_RESULTS_PER_PAGE;
                log.info(`Queueing next page (${nextPage + 1}/${totalPages}) with offset ${nextOffset}`);

                const nextRequest = createSearchRequest(
                    request.userData.query,
                    request.userData.responseId,
                    request.userData.maxResults,
                    request.userData.contentCrawlerKey,
                    searchCrawlerOptions.proxyConfiguration,
                    request.userData.contentScraperSettings,
                    nextOffset,
                    deduplicated,
                    nextPage,
                    totalPages,
                );
                await crawler.requestQueue!.addRequest(nextRequest);
            } else {
                // We have enough results or reached max pages, proceed to content crawling
                const finalResults = deduplicated.slice(0, request.userData.maxResults);
                log.info(`Pagination complete. Extracted ${finalResults.length} results: \n${finalResults.map((r) => r.url).join('\n')}`);

                addTimeMeasureEvent(request.userData!, 'before-playwright-queue-add');
                const responseId = request.userData.responseId!;
                let rank = 1;
                for (const result of finalResults) {
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
            () => log.warning('Google-search-crawler has finished'),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
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
 * Either Playwright or Cheerio crawler will be created based on the provided crawler options.
 * A crawler won't be created if it already exists.
 */
export async function createAndStartContentCrawler(
    contentCrawlerOptions: ContentCrawlerOptions,
    startCrawler = true,
) {
    const { type: crawlerType, crawlerOptions } = contentCrawlerOptions;

    const key = getCrawlerKey(crawlerOptions);
    if (crawlers.has(key)) {
        return { key, crawler: crawlers.get(key) };
    }

    const crawler = crawlerType === 'playwright'
        ? await createPlaywrightContentCrawler(crawlerOptions, key)
        : await createCheerioContentCrawler(crawlerOptions, key);

    if (startCrawler) {
        crawler.run().then(
            () => log.warning(`Crawler ${crawlerType} has finished`),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            () => {},
        );
        log.info(`Crawler ${crawlerType} has started 💪🏼`);
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
        requestHandler: (async (context) => {
            await requestHandlerPlaywright(context as unknown as PlaywrightCrawlingContext<ContentCrawlerUserData>);
        }),
        failedRequestHandler: async ({ request }, err) => failedRequestHandler(request, err, ContentCrawlerTypes.PLAYWRIGHT),
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
        requestHandler: (async (context) => {
            await requestHandlerCheerio(context as unknown as CheerioCrawlingContext<ContentCrawlerUserData>,
            );
        }),
        failedRequestHandler: async ({ request }, err) => failedRequestHandler(request, err, ContentCrawlerTypes.CHEERIO),
    });
}

/**
 * Adds a search request to the Google search crawler.
 * Create a response for the request and set the desired number of results (maxResults).
 */
export const addSearchRequest = async (
    request: RequestOptions<ContentCrawlerUserData>,
    searchCrawlerOptions: CheerioCrawlerOptions,
) => {
    const key = getCrawlerKey(searchCrawlerOptions);
    const crawler = crawlers.get(key);

    if (!crawler) {
        log.error(`Cheerio crawler not found: key ${key}`);
        return;
    }
    addTimeMeasureEvent(request.userData!, 'before-cheerio-queue-add');
    await crawler.requestQueue!.addRequest(request);
    log.info(`Added request to cheerio-google-search-crawler: ${request.url}`);
};
