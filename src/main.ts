import { Actor } from 'apify';
import { log } from 'crawlee';
import { createServer } from 'http';

import { addSearchRequest, createAndStartCrawlerPlaywright, createAndStartSearchCrawler } from './crawlers';
import { UserInputError } from './errors.js';
import { processInput } from './input';
import { addTimeoutToAllResponses } from './responses.js';
import {CrawlerOptions, Input, ScraperSettings} from './types.js';
import { parseParameters, createRequestForCrawler } from './utils';

await Actor.init();

// Allow to run standby mode only when the actor is not running in the Apify platform (e.g. in local development)
const RUN_STANDBY_MODE_AT_LOCAL = !Actor.isAtHome() && true;

Actor.on('migrating', () => {
    addTimeoutToAllResponses(60);
});

const server = createServer(async (req, res) => {
    if (req.method !== 'HEAD') {
        log.info(`Request received: ${req.method} ${req.url}`);
    }
    try {
        const params = parseParameters(req.url!);
        log.info(`Received input parameters: ${JSON.stringify(params)}`);
        const { input } = await processInput(params as Partial<Input>);

        const crawlerRequest = createRequestForCrawler(input.queries, input.maxResults);
        const crawlerOptions: CrawlerOptions = {
            proxyConfigurationOptions: { groups: [input.proxyTypeSearchCrawler] },
        };
        await addSearchRequest(crawlerRequest, res, crawlerOptions, input.maxResults);
    } catch (e) {
        const error = e as Error;
        const errorMessage = { errorMessage: error.message };
        const statusCode = error instanceof UserInputError ? 400 : 500;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(errorMessage));
    }
});

if ((Actor.isAtHome() && Actor.getEnv().metaOrigin === 'STANDBY') || RUN_STANDBY_MODE_AT_LOCAL) {
    log.info('Actor is running in Standby mode');

    const port = Actor.isAtHome() ? process.env.ACTOR_STANDBY_PORT : 3000;
    const host = Actor.isAtHome() ? process.env.ACTOR_WEB_SERVER_URL : 'http://localhost';

    server.listen(port, async () => {
        log.info(`Google-Search-Data-Extractor is listening for user requests at ${host}:${port}`);
        // Pre-create common crawlers because crawler init can take about 1 sec
        await Promise.all([
            createAndStartSearchCrawler(),
            createAndStartCrawlerPlaywright(),
        ]);
    });
} else {
    log.info('Actor is running in the normal mode');
    const processedInput = await processInput((await Actor.getInput<Partial<Input>>()) ?? ({} as Input));
    const { input } = processedInput;
    log.info(`Received input: ${JSON.stringify(input)}`);

    const crawlerRequest = createRequestForCrawler(input.queries, input.maxResults);
    const crawlerOptions: CrawlerOptions = {
        proxyConfigurationOptions: { groups: [input.proxyTypeSearchCrawler] },
    };
    const searchCrawler = await createAndStartSearchCrawler(crawlerOptions, {} as ScraperSettings, false);
    const contentCrawler = await createAndStartCrawlerPlaywright(crawlerOptions, {} as ScraperSettings, false);

    await searchCrawler.run([crawlerRequest.url]);
    await contentCrawler.run();
    await Actor.exit();
}
