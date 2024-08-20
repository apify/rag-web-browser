import { Actor, RequestQueue} from 'apify';
import { v4 as uuidv4 } from 'uuid';
import {createServer, ServerResponse} from 'http';
import {
    CheerioCrawler,
    CheerioCrawlingContext,
    PlaywrightCrawler,
    RequestOptions,
    log,
    PlaywrightCrawlerOptions, PlaywrightCrawlingContext
} from 'crawlee';
import type { CheerioAPI } from 'cheerio';
import { CrawlerOptions, Input, UserData } from './types.js';
// import { addRequest, createAndStartCrawler, DEFAULT_CRAWLER_OPTIONS } from './crawlers.js';
import {addResponse, addSearchResultCount, addTimeoutToAllResponses, sendSuccResponseById} from './responses.js';
// import { ScrapingBee } from './params.js';
import { UserInputError } from './errors.js';
import { scrapeOrganicResults } from './google-extractors-urls';
import { processInput } from './input';
import {parseParameters, createRequestForCrawler, createRequest} from './utils';
import {createAndStartCrawler} from "./crawlers";
import {Crawlers} from "./const";
import {genericHandler} from "./request-handlers";

await Actor.init();

if (Actor.isAtHome() && Actor.getEnv().metaOrigin !== 'STANDBY') {
    await Actor.fail('The Actor must start by being called using its Standby endpoint.');
}

Actor.on('migrating', () => {
    addTimeoutToAllResponses(60);
});

const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['GOOGLE_SERP'],
});

const processedInput = await processInput((await Actor.getInput<Partial<Input>>()) ?? ({} as Input));
const crawlers = new Map<string, CheerioCrawler | PlaywrightCrawler>();

const queueGoogleSearch = await RequestQueue.open('google-search-queue');

async function createCrawlerGoogleSearch() {
    const queue = await RequestQueue.open(undefined);
    const crawler = new CheerioCrawler({
        proxyConfiguration,
        keepAlive: true,
        requestQueue: queueGoogleSearch,
        requestHandler: async ({ request, $: _$ }: CheerioCrawlingContext<UserData>) => {
            // NOTE: we need to cast this to fix `cheerio` type errors
            const $ = _$ as CheerioAPI;

            log.info(`Processing organic search results: ${request.url}`);
            const organicResults = scrapeOrganicResults($);

            let searchUrls = organicResults.map((result) => result.url).filter((url): url is string => url !== undefined);
            // limit the number of search results to the maxResults
            searchUrls = searchUrls.slice(0, processedInput.input.maxResults);

            log.info(`Extracted ${searchUrls.length} URLs: \n${searchUrls.join('\n')}`);
            // log.info(`Sending response for request ${request.uniqueKey}`);

            const responseId = request.uniqueKey;
            addSearchResultCount(responseId, searchUrls.length);

            for (const url of searchUrls) {
                const r = createRequest(url, responseId);
                await addContentCrawlRequests(r);
            }
            // sendSuccResponseById(responseId, searchUrls.join('\n'), 'application/json');
        },
    });
    crawler.run().then(() => log.warning(`Google-search-crawler has finished`), () => { });
    crawlers.set(Crawlers.CHEERIO_SEARCH_CRAWLER, crawler);
    log.info('Google-search-crawler has started 🫡');
    return crawler;
}

async function createCrawlerPlaywright() {
    const crawlerOptions: PlaywrightCrawlerOptions = {
        ...(processedInput.crawlerOptions as PlaywrightCrawlerOptions),
        keepAlive: true,
        requestQueue: await RequestQueue.open(),
        // minConcurrency: Math.min(searchUrls.length, processedInput.input.minConcurrency),
        // +1 is required only when length of searchUrls is 0
        // maxConcurrency: Math.min(searchUrls.length + 1, processedInput.input.maxConcurrency),
    };

    // log.info(`Crawl options: ${JSON.stringify(crawlerOptions)}`);

    const crawler = new PlaywrightCrawler({
        requestHandler: (context: PlaywrightCrawlingContext) => genericHandler(context, processedInput.scraperSettings),
        ...crawlerOptions,
    });

    crawler.run().then(() => log.warning(`Crawler playwright has finished`), () => { });
    crawlers.set(Crawlers.PLAYWRIGHT_CONTENT_CRAWLER, crawler);
    log.info('Crawler playwright has started 💪🏼');
    return crawler;
}

export const addSearchRequest = async (request: RequestOptions<UserData>, res: ServerResponse) => {
    const crawler = crawlers.get(Crawlers.CHEERIO_SEARCH_CRAWLER) ?? await createCrawlerGoogleSearch();
    addResponse(request.uniqueKey!, res);
    await crawler.requestQueue!.addRequest(request);
    log.info(`Added request to google-search-crawler: ${request.url}`);
};

export const addContentCrawlRequests = async (request: RequestOptions<UserData>) => {
    const crawler = crawlers.get(Crawlers.PLAYWRIGHT_CONTENT_CRAWLER) ?? await createCrawlerPlaywright();
    await crawler.requestQueue!.addRequest(request);
    log.info(`Added request to content crawler: ${request.url}`);
};

const server = createServer(async (req, res) => {
    if (req.method !== 'HEAD') {
        log.info(`Request received: ${req.method} ${req.url}`);
    }
    try {
        const params = parseParameters(req.url!);
        log.info('Params:', params);
        const crawlerRequest = createRequestForCrawler(params);
        // log.info('Crawler request:', crawlerRequest);

        // const crawlerOptions: CrawlerOptions = {
        //     proxyConfigurationOptions: { groups: ['GOOGLE_SERP'] },
        // };
        // const crawlerRequest: RequestOptions = {
        //     url: 'http://www.google.com/search?q=example',
        //     ...crawlerOptions,
        // };
        log.info('Add request to crawler');
        await addSearchRequest(crawlerRequest, res);
        log.info('Request added to crawler');
    } catch (e) {
        const error = e as Error;
        const errorMessage = { errorMessage: error.message };
        const statusCode = error instanceof UserInputError ? 400 : 500;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(errorMessage));
    }
});

const port = Actor.isAtHome() ? process.env.ACTOR_STANDBY_PORT : 3000;
server.listen(port, async () => {
    log.info(`SuperScraper is listening for user requests at http://localhost:${port}`);

    // Pre-create common crawlers because crawler init can take about 1 sec
    await Promise.all([
        createCrawlerGoogleSearch(),
        createCrawlerPlaywright(),
    ]);
});
