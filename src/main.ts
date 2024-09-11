import { Actor } from 'apify';
import { log } from 'crawlee';
import { createServer, IncomingMessage, ServerResponse } from 'http';

import { addSearchRequest, createAndStartCrawlerPlaywright, createAndStartSearchCrawler } from './crawlers.js';
import { UserInputError } from './errors.js';
import { checkInputsAreValid, processInput } from './input.js';
import { addTimeoutToAllResponses, sendResponseError } from './responses.js';
import { Input } from './types.js';
import { parseParameters, checkForExtraParams, createSearchRequest, addTimeMeasureEvent } from './utils.js';

await Actor.init();

const ROUTE_SEARCH = '/search';

Actor.on('migrating', () => {
    addTimeoutToAllResponses(60);
});

async function getSearch(request: IncomingMessage, response: ServerResponse) {
    try {
        const requestReceivedTime = Date.now();
        const params = parseParameters(request.url?.slice(ROUTE_SEARCH.length, request.url.length) ?? '');
        log.info(`Received query parameters: ${JSON.stringify(params)}`);
        checkForExtraParams(params);

        // Process the query parameters the same way se normal inputs
        const {
            input,
            cheerioCrawlerOptions,
            playwrightCrawlerOptions,
            playwrightScraperSettings,
        } = await processInput(params as Partial<Input>);

        await checkInputsAreValid(input);

        const req = createSearchRequest(
            input.query,
            input.maxResults,
            cheerioCrawlerOptions.proxyConfiguration,
        );
        addTimeMeasureEvent(req.userData!, 'request-received', requestReceivedTime);
        await addSearchRequest(
            req,
            response,
            cheerioCrawlerOptions,
            playwrightCrawlerOptions,
            playwrightScraperSettings,
        );
        setTimeout(() => {
            sendResponseError(req.uniqueKey!, 'Timed out');
        }, input.requestTimeoutSecs * 1000);
    } catch (e) {
        const error = e as Error;
        const errorMessage = { errorMessage: error.message };
        const statusCode = error instanceof UserInputError ? 400 : 500;
        log.error(`UserInputError occurred: ${error.message}`);
        response.writeHead(statusCode, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(errorMessage));
    }
}

const server = createServer(async (req, res) => {
    log.info(`Request received: ${req.method} ${req.url}`);

    if (req.url?.startsWith(ROUTE_SEARCH)) {
        if (req.method === 'GET') {
            await getSearch(req, res);
        } else if (req.method === 'HEAD') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end();
        } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ errorMessage: 'Bad request' }));
        }
    } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
            JSON.stringify({
                message: 'RAG Web Browser is running in standby mode, sent request to GET "/search?query=apify"',
            }),
        );
    }
});

const { input, cheerioCrawlerOptions, playwrightCrawlerOptions, playwrightScraperSettings } = await processInput(
    (await Actor.getInput<Partial<Input>>()) ?? ({} as Input),
);

log.info(`Loaded input: ${JSON.stringify(input)},
    cheerioCrawlerOptions: ${JSON.stringify(cheerioCrawlerOptions)},
    playwrightCrawlerOptions: ${JSON.stringify(playwrightCrawlerOptions)},
    playwrightScraperSettings ${JSON.stringify(playwrightScraperSettings)}
`);

if (Actor.getEnv().metaOrigin === 'STANDBY') {
    log.info('Actor is running in STANDBY mode with default parameters. '
        + 'Changing these parameters on the fly is not supported at the moment.');

    const port = Actor.isAtHome() ? process.env.ACTOR_STANDBY_PORT : 3000;
    server.listen(port, async () => {
        log.info(`Google-Search-Data-Extractor is listening for user requests`);
        // Pre-create common crawlers because crawler init can take about 1 sec
        await Promise.all([
            createAndStartSearchCrawler(cheerioCrawlerOptions, playwrightCrawlerOptions, playwrightScraperSettings),
            createAndStartCrawlerPlaywright(playwrightCrawlerOptions, playwrightScraperSettings),
        ]);
    });
} else {
    log.info('Actor is running in the NORMAL mode');
    try {
        const startedTime = Date.now();
        await checkInputsAreValid(input);

        cheerioCrawlerOptions.keepAlive = false;
        playwrightCrawlerOptions.keepAlive = false;
        const searchCrawler = await createAndStartSearchCrawler(
            cheerioCrawlerOptions,
            playwrightCrawlerOptions,
            playwrightScraperSettings,
            false,
        );
        const contentCrawler = await createAndStartCrawlerPlaywright(
            playwrightCrawlerOptions,
            playwrightScraperSettings,
            false,
        );

        const req = createSearchRequest(
            input.query,
            input.maxResults,
            cheerioCrawlerOptions.proxyConfiguration,
        );
        addTimeMeasureEvent(req.userData!, 'actor-started', startedTime);
        await addSearchRequest(
            req,
            null,
            cheerioCrawlerOptions,
            playwrightCrawlerOptions,
            playwrightScraperSettings,
        );
        log.info(`Running search crawler with request: ${JSON.stringify(req)}`);
        addTimeMeasureEvent(req.userData!, 'before-cheerio-run', startedTime);
        await searchCrawler.run();

        log.info(`Running content crawler with request: ${JSON.stringify(req)}`);
        addTimeMeasureEvent(req.userData!, 'before-playwright-run', startedTime);
        await contentCrawler.run();
    } catch (e) {
        const error = e as Error;
        await Actor.fail(error.message as string);
    }
    await Actor.exit();
}
