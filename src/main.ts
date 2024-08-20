import { Actor, RequestQueue} from 'apify';
import {createServer, ServerResponse} from 'http';
import {CheerioCrawler, CheerioCrawlingContext, PlaywrightCrawler, RequestOptions, log} from 'crawlee';
import type { CheerioAPI } from 'cheerio';
import { CrawlerOptions, Input, UserData } from './types.js';
// import { addRequest, createAndStartCrawler, DEFAULT_CRAWLER_OPTIONS } from './crawlers.js';
import {addResponse, addTimeoutToAllResponses} from './responses.js';
// import { ScrapingBee } from './params.js';
import { UserInputError } from './errors.js';
import { scrapeOrganicResults } from './google-extractors-urls';
import { processInput } from './input';
import { parseParameters, createRequestForCrawler } from './utils';
import {createAndStartCrawler} from "./crawlers";
import {Crawlers} from "./const";

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

async function createCrawler() {
    const queue = await RequestQueue.open(undefined);
    const crawler = new CheerioCrawler({
        proxyConfiguration,
        keepAlive: true,
        requestQueue: queue,
        requestHandler: async ({ request, $: _$ }: CheerioCrawlingContext<UserData>) => {
            // NOTE: we need to cast this to fix `cheerio` type errors
            const $ = _$ as CheerioAPI;

            log.info(`Processing organic search results: ${request.url}`);
            const organicResults = scrapeOrganicResults($);

            let searchUrls = organicResults.map((result) => result.url).filter((url): url is string => url !== undefined);
            // limit the number of search results to the maxResults
            searchUrls = searchUrls.slice(0, processedInput.input.maxResults);

            log.info(`Extracted ${searchUrls.length} URLs: \n${searchUrls.join('\n')}`);
        },
    });
    crawler.run().then(() => log.warning(`Google-search-crawler has finished`), () => { });
    crawlers.set(Crawlers.GOOGLE_SEARCH, crawler);
    log.info('Google-search-crawler is ready 🫡');
    return crawler;
}

export const addRequest = async (request: RequestOptions<UserData>, res: ServerResponse, key: Crawlers) => {
    const crawler = crawlers.get(key) ?? await createCrawler();
    addResponse(request.uniqueKey!, res);
    await crawler.requestQueue!.addRequest(request);
};

const server = createServer(async (req, res) => {
    if (req.method !== 'HEAD') {
        log.info(`Request received: ${req.method} ${req.url}`);
    }
    try {
        const params = parseParameters(req.url!);
        log.info('Params:', params);
        const crawlerRequest = createRequestForCrawler(params);
        log.info('Crawler request:', crawlerRequest);

        // const crawlerOptions: CrawlerOptions = {
        //     proxyConfigurationOptions: { groups: ['GOOGLE_SERP'] },
        // };
        // const crawlerRequest: RequestOptions = {
        //     url: 'http://www.google.com/search?q=example',
        //     ...crawlerOptions,
        // };
        log.info('Add request to crawler');
        await addRequest(crawlerRequest, res, Crawlers.GOOGLE_SEARCH);
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
        createCrawler(),
    ]);
});
