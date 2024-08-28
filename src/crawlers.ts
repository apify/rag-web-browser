import { RequestQueue } from 'apify';
import { CheerioAPI } from 'cheerio';
import { CheerioCrawlerOptions, RequestOptions,
    CheerioCrawlingContext,
    log,
    PlaywrightCrawlingContext,
    CheerioCrawler,
    PlaywrightCrawler,
    PlaywrightCrawlerOptions,
} from 'crawlee';
import { ServerResponse } from 'http';

import { scrapeOrganicResults } from './google-extractors-urls.js';
import { genericHandler } from './playwright-req-handler.js';
import { createResponse } from './responses.js';
import { PlaywrightScraperSettings, UserData } from './types.js';
import { createRequest } from './utils.js';

enum CrawlerType {
    CHEERIO_GOOGLE_SEARCH_CRAWLER = 'cheerio-google-search-crawler',
    PLAYWRIGHT_CONTENT_CRAWLER = 'playwright-content-crawler',
}

const crawlers = new Map<string, CheerioCrawler | PlaywrightCrawler>();
const queueSearchCrawler = await RequestQueue.open('cheerio-google-search-queue');

log.setLevel(log.LEVELS.DEBUG);

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
// How to handle the case when all the requests are not finished?

/**
 * Creates and starts a Google search crawler with the provided configuration.
 * Additionally, sets up the Playwright content crawler configuration.
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
        requestQueue: queueSearchCrawler,
        requestHandler: async ({ request, $: _$ }: CheerioCrawlingContext<UserData>) => {
            // NOTE: we need to cast this to fix `cheerio` type errors
            const $ = _$ as CheerioAPI;

            log.info(`${CrawlerType.CHEERIO_GOOGLE_SEARCH_CRAWLER} requestHandler: Processing URL: ${request.url}`);
            const organicResults = scrapeOrganicResults($);

            let searchUrls = organicResults.map((result) => result.url).filter((url): url is string => url !== undefined);
            // limit the number of search results to the maxResults
            searchUrls = searchUrls.slice(0, request.userData?.maxResults ?? searchUrls.length);
            log.info(`Extracted ${searchUrls.length} URLs: \n${searchUrls.join('\n')}`);

            const responseId = request.uniqueKey;
            for (const url of searchUrls) {
                const r = createRequest(url, responseId);
                await addContentCrawlRequest(r, playwrightCrawlerOptions, playwrightScraperSettings);
            }
        },
    });
    if (startCrawler) {
        crawler.run().then(() => log.warning(`Google-search-crawler has finished`), () => {});
        log.info('Google-search-crawler has started 🫡');
    }
    const key = CrawlerType.CHEERIO_GOOGLE_SEARCH_CRAWLER;
    crawlers.set(key, crawler);
    return crawler;
}

export async function createAndStartCrawlerPlaywright(
    crawlerOptions: PlaywrightCrawlerOptions,
    settings: PlaywrightScraperSettings,
    startCrawler: boolean = true,
) {
    log.info('Creating Playwright crawler with Options: ', crawlerOptions);
    const crawler = new PlaywrightCrawler({
        ...(crawlerOptions as PlaywrightCrawlerOptions),
        requestHandler: (context: PlaywrightCrawlingContext) => genericHandler(context, settings),
        keepAlive: crawlerOptions.keepAlive,
        requestQueue: await RequestQueue.open(),
        autoscaledPoolOptions: { desiredConcurrency: 3 },
    });

    if (startCrawler) {
        crawler.run().then(() => log.warning(`Crawler playwright has finished`), () => {});
        log.info('Crawler playwright has started 💪🏼');
    }
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
    maxResults: number,
    cheerioCrawlerOptions: CheerioCrawlerOptions,
    playwrightCrawlerOptions: PlaywrightCrawlerOptions,
    playwrightScraperSettings: PlaywrightScraperSettings,
) => {
    const key = CrawlerType.CHEERIO_GOOGLE_SEARCH_CRAWLER;
    const crawler = crawlers.has(key) ? crawlers.get(key)! : await createAndStartSearchCrawler(
        cheerioCrawlerOptions,
        playwrightCrawlerOptions,
        playwrightScraperSettings,
    );

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
export const addContentCrawlRequest = async (
    request: RequestOptions<UserData>,
    crawlerOptions: PlaywrightCrawlerOptions,
    scraperSettings: PlaywrightScraperSettings,
) => {
    const key = CrawlerType.PLAYWRIGHT_CONTENT_CRAWLER;
    const crawler = crawlers.get(key) ?? await createAndStartCrawlerPlaywright(crawlerOptions, scraperSettings);
    await crawler.requestQueue!.addRequest(request);
    log.info(`Added request to the playwright-content-crawler: ${request.url}`);
};
