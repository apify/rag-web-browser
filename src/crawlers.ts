import { Actor, RequestQueue } from 'apify';
import { CheerioAPI, load } from 'cheerio';
import type { RequestOptions } from 'crawlee';
import {
    CheerioCrawlingContext,
    htmlToText,
    log,
    PlaywrightCrawlingContext,
    sleep,
    CheerioCrawler,
    PlaywrightCrawler,
    PlaywrightCrawlerOptions,
} from 'crawlee';
import { ServerResponse } from 'http';
import { Page } from 'playwright';

import { Crawlers } from './const.js';
import { scrapeOrganicResults } from './google-extractors-urls';
import { processHtml } from './html-processing';
import { htmlToMarkdown } from './markdown';
import { createResponse, addResultToResponse } from './responses.js';
import { ScraperSettings, UserData, CrawlerOptions } from './types.js';
import { createRequest } from './utils.js';

// const crawlers = new Map<string, PlaywrightCrawler>();
const crawlers = new Map<string, CheerioCrawler | PlaywrightCrawler>();

const queueSearchCrawler = await RequestQueue.open('cheerio-google-search-queue');

// export const DEFAULT_CRAWLER_OPTIONS: CrawlerOptions = {
//     proxyConfigurationOptions: {},
// };
//
// export const DEFAULT_SCRAPER_SETTINGS: ScraperSettings = {
//     dynamicContentWaitSecs: 0,
//     maxHtmlCharsToProcess: 1.5e6,
//     readableTextCharThreshold: 100,
//     removeCookieWarnings: true,
//     saveHtml: true,
//     saveMarkdown: false,
// };

// Use crawlOptions to create a new CheerioCrawler (proxyConfiguration)
// Proxy configuration for a PlaywrightCrawler
// Two request queues: one for Google search and one for content crawling
// How to handle the case when all the requests are not finished?

export async function createAndStartSearchCrawler(
    crawlerOptions: CrawlerOptions = {} as CrawlerOptions,
    scraperSettings: ScraperSettings = {} as ScraperSettings,
    startCrawler: boolean = true,
) {
    const proxyConfig = await Actor.createProxyConfiguration(crawlerOptions.proxyConfigurationOptions);

    const crawler = new CheerioCrawler({
        keepAlive: true,
        proxyConfiguration: proxyConfig,
        maxRequestRetries: 4,
        requestQueue: queueSearchCrawler,
        requestHandler: async ({ request, $: _$ }: CheerioCrawlingContext<UserData>) => {
            // NOTE: we need to cast this to fix `cheerio` type errors
            const $ = _$ as CheerioAPI;

            log.info(`${Crawlers.CHEERIO_GOOGLE_SEARCH_CRAWLER} requestHandler: Processing URL: ${request.url}`);
            const organicResults = scrapeOrganicResults($);

            let searchUrls = organicResults.map((result) => result.url).filter((url): url is string => url !== undefined);
            // limit the number of search results to the maxResults
            searchUrls = searchUrls.slice(0, request.userData?.maxResults ?? searchUrls.length);
            log.info(`Extracted ${searchUrls.length} URLs: \n${searchUrls.join('\n')}`);

            const responseId = request.uniqueKey;
            for (const url of searchUrls) {
                const r = createRequest(url, responseId);
                await addContentCrawlRequest(r, crawlerOptions, scraperSettings);
            }
        },
    });
    if (startCrawler) {
        crawler.run().then(() => log.warning(`Google-search-crawler has finished`), () => {});
        log.info('Google-search-crawler has started 🫡');
    }
    const key = Crawlers.CHEERIO_GOOGLE_SEARCH_CRAWLER;
    crawlers.set(key, crawler);
    return crawler;
}

export async function createAndStartCrawlerPlaywright(
    crawlerOptions: CrawlerOptions = {} as CrawlerOptions,
    settings: ScraperSettings = {} as ScraperSettings,
    startCrawler: boolean = true,
) {
    const options: PlaywrightCrawlerOptions = {
        ...(crawlerOptions as PlaywrightCrawlerOptions),
    };

    const crawler = new PlaywrightCrawler({
        keepAlive: true,
        requestQueue: await RequestQueue.open(),
        requestHandler: async (context) => {
            const { request, contentType, page, response, closeCookieModals } = context;

            log.info(`${Crawlers.PLAYWRIGHT_CONTENT_CRAWLER} requestHandler: Processing URL: ${request.url}`);
            if (settings.dynamicContentWaitSecs > 0) {
                await waitForDynamicContent(context, settings.dynamicContentWaitSecs * 1000);
            }
            if (page && settings.removeCookieWarnings) {
                await closeCookieModals();
            }
            // Parsing the page after the dynamic content has been loaded / cookie warnings removed
            log.info(`Parse HTML with Cheerio: ${request.url}`);
            const $ = await context.parseWithCheerio();

            const headers = response?.headers instanceof Function ? response.headers() : response?.headers;
            // @ts-expect-error false-positive?
            if (!$ || !isValidContentType(headers['content-type'])) {
                log.info(`Skipping URL ${request.loadedUrl} as it could not be parsed.`, contentType as object);
                return;
            }

            const html = $('html').html()!;
            const processedHtml = await processHtml(html, request.url, settings, $);

            const isTooLarge = processedHtml.length > settings.maxHtmlCharsToProcess;
            const text = isTooLarge ? load(processedHtml).text() : htmlToText(load(processedHtml));

            const markdown = htmlToMarkdown(processedHtml);

            log.info(`Pushing data from: ${request.url} to the Apify dataset`);
            await context.pushData({ url: request.url, text, markdown });

            // const responseId = request.uniqueKey;
            log.info(`Adding result to response: ${request.userData.responseId}, request.uniqueKey: ${request.uniqueKey}`);
            const { responseId } = request.userData;
            if (responseId) {
                addResultToResponse(responseId, { url: request.url, text, markdown });
            }
        },
    });
    if (startCrawler) {
        crawler.run().then(() => log.warning(`Crawler playwright has finished`), () => {});
        log.info('Crawler playwright has started 💪🏼');
    }
    const key = Crawlers.PLAYWRIGHT_CONTENT_CRAWLER;
    crawlers.set(key, crawler);
    return crawler;
}

/**
 * Waits for the `time` to pass, but breaks early if the page is loaded (source: Website Content Crawler).
 */
async function waitForPlaywright(page: Page, time: number) {
    // Early break is possible only after 1/3 of the time has passed (max 3 seconds) to avoid breaking too early.
    const hardDelay = Math.min(1000, Math.floor(0.3 * time));
    await sleep(hardDelay);

    return Promise.race([page.waitForLoadState('networkidle', { timeout: 0 }), sleep(time - hardDelay)]);
}

/**
 * Waits for the `time`, but checks the content length every half second and breaks early if it hasn't changed
 * in last 2 seconds (source: Website Content Crawler).
 */
export async function waitForDynamicContent(context: PlaywrightCrawlingContext, time: number) {
    if (context.page) {
        await waitForPlaywright(context.page, time);
    }
}

function isValidContentType(contentType: string | undefined) {
    return ['text', 'html', 'xml'].some((type) => contentType?.includes(type));
}

/**
 * Adds a search request to the Google search crawler.
 * Create a response for the request and set the desired number of results (maxResults).
 */
export const addSearchRequest = async (
    request: RequestOptions<UserData>, response: ServerResponse | null,
    crawlerOptions: CrawlerOptions, maxResults: number,
) => {
    const key = Crawlers.CHEERIO_GOOGLE_SEARCH_CRAWLER;
    const crawler = crawlers.has(key) ? crawlers.get(key)! : await createAndStartSearchCrawler(crawlerOptions);

    if (response) {
        createResponse(request.uniqueKey!, response, maxResults);
        log.info(`Created response for request ${request.uniqueKey}, request.url: ${request.url}`);
    }
    await crawler.requestQueue!.addRequest(request);
    log.info(`Added request to cheerio-google-search-crawler: ${request.url}`);
};

/**
 * Adds a content crawl request to the Playwright content crawler.
 * Get existing crawler based on crawlerOptions and scraperSettings, if not present -> create new
 */
export const addContentCrawlRequest = async (request: RequestOptions<UserData>, crawlerOptions: CrawlerOptions, scraperSettings: ScraperSettings) => {
    const key = Crawlers.PLAYWRIGHT_CONTENT_CRAWLER;
    const crawler = crawlers.get(key) ?? await createAndStartCrawlerPlaywright(crawlerOptions, scraperSettings);
    await crawler.requestQueue!.addRequest(request);
    log.info(`Added request to the playwright-content-crawler: ${request.url}`);
};
