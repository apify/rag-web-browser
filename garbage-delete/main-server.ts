import http from 'http';
import { Actor } from 'apify';
import { log,
    CheerioCrawler,
    CheerioCrawlingContext,
    PlaywrightCrawler,
    PlaywrightCrawlingContext,
    PlaywrightCrawlerOptions,
} from 'crawlee';
import express from 'express';
import type { CheerioAPI } from 'cheerio';

import { scrapeOrganicResults } from '../src/google-extractors-urls';
import { processInput } from '../src/input';
import { genericHandler } from '../src/request-handlers';
import { Input, UserData } from '../src/types';

const STANDBY_MODE = process.env.APIFY_META_ORIGIN === 'STANDBY' || true;

let crawlerGoogleSearch: CheerioCrawler;
let crawlerContent: PlaywrightCrawler;
let searchUrls: string[] = [];

await Actor.init();

if (STANDBY_MODE) {
    log.info('Running in standby mode');
}

try {
    log.setLevel(log.LEVELS.INFO);

    const proxyConfiguration = await Actor.createProxyConfiguration({
        groups: ['GOOGLE_SERP'],
    });

    const processedInput = await processInput((await Actor.getInput<Partial<Input>>()) ?? ({} as Input));

    crawlerGoogleSearch = new CheerioCrawler({
        proxyConfiguration,
        keepAlive: true,
        requestHandler: async ({ request, $: _$ }: CheerioCrawlingContext<UserData>) => {
            // NOTE: we need to cast this to fix `cheerio` type errors
            const $ = _$ as CheerioAPI;

            log.info(`Processing organic search results: ${request.url}`);
            const organicResults = scrapeOrganicResults($);

            searchUrls = organicResults.map((result) => result.url).filter((url): url is string => url !== undefined);
            // limit the number of search results to the maxResults
            searchUrls = searchUrls.slice(0, processedInput.input.maxResults);

            log.info(`Extracted ${searchUrls.length} URLs: \n${searchUrls.join('\n')}`);
        },
    });
    // increase the number of search results to be sure we get enough results as there are some duplicates
    // const maxSearchResults = processedInput.input.maxResults + 5;

    const crawlerOptions: PlaywrightCrawlerOptions = {
        ...(processedInput.crawlerOptions as PlaywrightCrawlerOptions),
        minConcurrency: Math.min(searchUrls.length, processedInput.input.minConcurrency),
        // +1 is required only when length of searchUrls is 0
        maxConcurrency: Math.min(searchUrls.length + 1, processedInput.input.maxConcurrency),
    };

    log.info(`Crawl options: ${JSON.stringify(crawlerOptions)}`);

    // crawlerContent = new PlaywrightCrawler({
    //     requestHandler: (context: PlaywrightCrawlingContext) => genericHandler(context, processedInput.scraperSettings),
    //     ...crawlerOptions,
    // });

    // const url = `http://www.google.com/search?q=${processedInput.input.queries}&num=${maxSearchResults}`;
} catch (e) {
    await Actor.fail((e as Error).message);
}

// console.log('Starting server on port ' + Actor.config.get('standbyPort'));
// server.listen(Actor.config.get('standbyPort'));

// server.listen(port, async () => {
//     log.info(`SERP content crawlerGoogleSearch is listening at: ${url}:${port}`);
//
//     crawlerGoogleSearch.run().then(() => log.warning(`Crawler ended`), () => { });
//     log.info('Crawler ready 🫡');
//
//     // Pre-create common crawlers because crawlerGoogleSearch init can take about 1 sec
//     // await Promise.all([
//     //     createAndStartCrawler(DEFAULT_CRAWLER_OPTIONS),
//     //     createAndStartCrawler({ ...DEFAULT_CRAWLER_OPTIONS, proxyConfigurationOptions: { groups: ['RESIDENTIAL'] } }),
//     // ]);
// });

const app = express();

if (STANDBY_MODE) {
    log.info('Running in standby mode');

    app.get('/', async (req, res) => {
        const start = Date.now();
        const {
            q,
        } = req.query as any;
        if (!q) {
            res.status(400).send({ error: 'Missing query', results: [] });
            return;
        }
        log.info(`Received request for query: ${q}`);
        const result: string[] = ['aa'];
        const url = `http://www.google.com/search?q=${q}&num=${5}`;
        await crawlerGoogleSearch.addRequests([url]);

        const timeSecs = ((Date.now() - start) / 1000).toFixed(2);
        log.info(`Returning results for query: ${q} in ${timeSecs} seconds`);
        res.send({ error: null, results: [result] });
    });
}

const url1 = process.env.APIFY_CONTAINER_URL || 'http://localhost';
const port = Actor.isAtHome() ? process.env.ACTOR_STANDBY_PORT : 3000;

if (STANDBY_MODE) {
    app.listen(port, () => {
        log.info(`SERP content crawler is listening at: ${url1}:${port}`);
        crawlerGoogleSearch.run().then(() => log.warning(`Crawler ended`), () => { });
        log.info('Crawler ready 🫡');
    });
}
