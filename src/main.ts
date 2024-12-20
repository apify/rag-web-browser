import { Actor } from 'apify';
import { log } from 'crawlee';
import { createServer } from 'http';

import { Routes } from './const.js';
import { createAndStartCrawlers } from './crawlers.js';
import { processInput } from './input.js';
import { addTimeoutToAllResponses } from './responses.js';
import { handleSearchRequest, handleSearchNormalMode } from './search.js';
import { Input } from './types.js';

await Actor.init();

Actor.on('migrating', () => {
    addTimeoutToAllResponses(60);
});

const server = createServer(async (req, res) => {
    log.info(`Request received: ${req.method} ${req.url}`);

    if (req.url?.startsWith(Routes.SEARCH)) {
        if (req.method === 'GET') {
            await handleSearchRequest(req, res);
        } else if (req.method === 'HEAD') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end();
        } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ errorMessage: 'Bad request' }));
        }
    } else if (req.url?.startsWith(Routes.SSE)) {
        log.debug('SSE request received');
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
            JSON.stringify({
                message: `There is nothing at this HTTP endpoint. Send a GET request to ${process.env.ACTOR_STANDBY_URL}/search?query=hello+world instead`,
            }),
        );
    }
});

const standbyMode = Actor.getEnv().metaOrigin === 'STANDBY';
const { input, cheerioCrawlerOptions, playwrightCrawlerOptions, playwrightScraperSettings } = await processInput(
    (await Actor.getInput<Partial<Input>>()) ?? ({} as Input),
    standbyMode,
);

log.info(`Loaded input: ${JSON.stringify(input)},
    cheerioCrawlerOptions: ${JSON.stringify(cheerioCrawlerOptions)},
    playwrightCrawlerOptions: ${JSON.stringify(playwrightCrawlerOptions)},
    playwrightScraperSettings ${JSON.stringify(playwrightScraperSettings)}
`);

if (standbyMode) {
    log.info('Actor is running in the STANDBY mode.');

    const host = Actor.isAtHome() ? process.env.ACTOR_STANDBY_URL : 'http://localhost';
    const port = Actor.isAtHome() ? process.env.ACTOR_STANDBY_PORT : 3000;
    server.listen(port, async () => {
        // Pre-create default crawlers
        log.info(`The Actor web server is listening for user requests at ${host}.`);
        await createAndStartCrawlers(cheerioCrawlerOptions, playwrightCrawlerOptions, playwrightScraperSettings);
    });
} else {
    log.info('Actor is running in the NORMAL mode.');
    try {
        await handleSearchNormalMode(input, cheerioCrawlerOptions, playwrightCrawlerOptions, playwrightScraperSettings);
    } catch (e) {
        const error = e as Error;
        await Actor.fail(error.message as string);
    }
    await Actor.exit();
}
