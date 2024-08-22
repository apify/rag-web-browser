import { Actor } from 'apify';
import { log } from 'crawlee';
import { createServer } from 'http';

import { addSearchRequest, createAndStartCrawlerPlaywright, createAndStartSearchCrawler } from './crawlers.js';
import { UserInputError } from './errors.js';
import { processInput } from './input.js';
import { addTimeoutToAllResponses } from './responses.js';
import { Input } from './types.js';
import { parseParameters, checkForExtraParams, createRequestSearch } from './utils.js';

await Actor.init();

// Allow to run standby mode only when the actor is not running in the Apify platform (e.g. in local development)
const RUN_STANDBY_MODE_AT_LOCAL = !Actor.isAtHome() && true;
// const TIMEOUT_MS = 60000;

Actor.on('migrating', () => {
    addTimeoutToAllResponses(60);
});

const server = createServer(async (req, res) => {
    if (req.method !== 'HEAD') {
        log.info(`Request received: ${req.method} ${req.url}`);
    }
    try {
        const params = parseParameters(req.url!);
        checkForExtraParams(params);
        log.info(`Received input parameters: ${JSON.stringify(params)}`);
        const { input, crawlerOptions, scraperSettings } = await processInput(params as Partial<Input>);

        const crawlerRequest = createRequestSearch(input.queries, input.maxResults);

        // setTimeout(() => {
        //     const timeoutErrorMessage = {
        //         errorMessage: `Response timed out.`,
        //     };
        //     sendResponseError(crawlerRequest.uniqueKey!, JSON.stringify(timeoutErrorMessage));
        // }, TIMEOUT_MS);

        await addSearchRequest(crawlerRequest, res, input.maxResults, crawlerOptions, scraperSettings);
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
    server.listen(port, async () => {
        log.info(`Google-Search-Data-Extractor is listening for user requests`);

        const { input, crawlerOptions, scraperSettings } = await processInput((await Actor.getInput<Partial<Input>>()) ?? ({} as Input));
        log.info(`Loaded input: ${JSON.stringify(input)},
            crawlerOptions: ${JSON.stringify(crawlerOptions)},
            scraperSettings: ${JSON.stringify(scraperSettings)}
        `);
        // Pre-create common crawlers because crawler init can take about 1 sec
        await Promise.all([
            createAndStartSearchCrawler(crawlerOptions, scraperSettings),
            createAndStartCrawlerPlaywright(crawlerOptions, scraperSettings),
        ]);
    });
} else {
    log.info('Actor is running in the normal mode');
    const processedInput = await processInput((await Actor.getInput<Partial<Input>>()) ?? ({} as Input));
    const { input, crawlerOptions, scraperSettings } = processedInput;
    log.info(`Received input: ${JSON.stringify(input)}`);

    const crawlerRequest = createRequestSearch(input.queries, input.maxResults);
    const searchCrawler = await createAndStartSearchCrawler(crawlerOptions, scraperSettings, false);
    const contentCrawler = await createAndStartCrawlerPlaywright(crawlerOptions, scraperSettings, false);

    await searchCrawler.run([crawlerRequest.url]);
    await contentCrawler.run();
    await Actor.exit();
}
