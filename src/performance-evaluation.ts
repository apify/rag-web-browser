/**
 * Performance evaluation of the RAG Web Browser with respect to different settings.
 * This script runs a series of queries and saves performance results into a dataset.
 * The results include average time for each time measure event.
 *
 * The evaluation is performed with different combinations of the following parameters:
 * - `scrapingTool`: The tool used for scraping (e.g., `raw-http`, `browser-playwright`).
 * - `mediaBlocked`: Whether media content is blocked during scraping (true/false).
 * - `maxResults`: The maximum number of results to scrape (e.g., 1, 3).
 *
 * The script performs the following steps:
 * 1. Runs a set of predefined queries using different combinations of parameters.
 * 2. Fetches the results and computes the average time for each time measure event.
 * 3. Logs the performance results, including average latency for each combination of parameters.
 * 4. Aborts the last run of the actor to ensure no resources are wasted.
 *
 * The results are stored in a table format, showing the average latency for each combination of parameters.
 *
 * Usage:
 * - Ensure the `APIFY_TOKEN` environment variable is set with your Apify API token.
 * - Run the script to perform the performance evaluation.
 * - The results will be logged to the console.
 */

import { log } from 'apify';

import { Output } from './types';

const EVALUATION_QUERIES = [
    'apify',
    'donald trump',
    'ai agents',
];

const apifyToken = process.env.APIFY_TOKEN;

const user = 'jiri-spilka';
const actorId = 'apify~rag-web-browser';
const urlUserActor = `${user}--rag-web-browser-task`;

const memory = 8; // memory can't be changed in the standby mode
const scrapingToolSet = ['raw-http', 'browser-playwright'];
const mediaBlockedSet = [true, false];
const maxResultsSet = [1, 3];

const url = `https://${urlUserActor}.apify.actor/search`;

const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${apifyToken}`,
};

const results = new Map<string, Output[]>();
const resultsTable = [];

for (const scrapingTool of scrapingToolSet) {
    for (const blockMedia of mediaBlockedSet) {
        for (const maxResults of maxResultsSet) {
            log.info(`Running ${EVALUATION_QUERIES.length} query/queries with ${scrapingTool}, ${blockMedia ? 'blocked media' : 'unblocked media'}, maxResults=${maxResults}`);
            for (const q of EVALUATION_QUERIES) {
                const queryParams = new URLSearchParams({ query: q, scrapingTool, blockMedia: blockMedia.toString(), debugMode: 'true', maxResults: maxResults.toString() });
                const urlWithParams = `${url}?${queryParams.toString()}`;
                log.info(`Running ${urlWithParams}`);
                const res = await fetch(urlWithParams, { method: 'GET', headers });
                if (!res.ok) {
                    throw new Error(`Failed to run the actor: ${JSON.stringify(await res.json())}`);
                }
                const data: Output[] = await res.json();
                log.info(`Received number of results: ${data.length}`);
                const k = `${scrapingTool}__${blockMedia ? 'blocked' : 'unblocked'}__${maxResults}`;
                if (results.has(k)) {
                    results.set(k, [...results.get(k)!, ...data]);
                } else {
                    results.set(k, data);
                }
            }
        }
    }
}

log.info(`Get the last run: ${actorId}`);
const response = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs/last`, { headers });
const resp = await response.json();
const { id: runId } = resp.data;

log.info(`Abort run ${runId}`);
const r = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/abort`, { headers });
log.info(`The last run has been aborted: ${await r.json()}`);

for (const [key, data] of results) {
    const remoteDataset = data;
    log.info('Compute average time for each time measure event');
    const timeMeasuresMap = new Map<string, number[]>();
    const timeMeasuresTimeTaken = [];

    // compute average time for the timeMeasures
    for (const item of remoteDataset) {
        const { timeMeasures } = item.crawl.debug ?? {};
        if (!timeMeasures) {
            continue;
        }
        for (const measure of timeMeasures) {
            if (!timeMeasuresMap.has(measure.event)) {
                timeMeasuresMap.set(measure.event, []);
            }
            timeMeasuresMap.set(measure.event, [...timeMeasuresMap.get(measure.event)!, measure.timeDeltaPrevMs]);
            if (measure.event === 'playwright-before-response-send' || measure.event === 'cheerio-before-response-send') {
                timeMeasuresTimeTaken.push(measure.timeMs);
            }
        }
    }
    log.info('Average time for each time measure event:', timeMeasuresMap);

    for (const [k, value] of timeMeasuresMap) {
        const sum = value.reduce((a, b) => a + b, 0);
        const avg = sum / value.length;
        log.info(`${k}: ${avg.toFixed(0)} ms`);
    }

    log.info('Time taken for each request:', timeMeasuresTimeTaken);
    log.info('Time taken on average', { average: timeMeasuresTimeTaken.reduce((a, b) => a + b, 0) / timeMeasuresTimeTaken.length });

    // Store results for the table
    const avgLatency = timeMeasuresTimeTaken.reduce((a, b) => a + b, 0) / timeMeasuresTimeTaken.length / 1000;
    resultsTable.push(`| ${memory} | ${key.split('__')[0]} | ${key.split('__')[1]} | ${key.split('__')[2]} | ${avgLatency.toFixed(1)} |`);
}

// Print the results table
log.info('\nPerformance Results:');
log.info('| Memory (GB) | Scraping Tool | Media Blocked | Max Results | Latency (sec) |');
log.info('|-------------|---------------|---------------|-------------|---------------|');
resultsTable.forEach((row) => log.info(row));
