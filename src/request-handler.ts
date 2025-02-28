import { Actor } from 'apify';
import { load } from 'cheerio';
import { CheerioCrawlingContext, htmlToText, log, PlaywrightCrawlingContext, sleep, Request } from 'crawlee';

import { ContentCrawlerStatus } from './const';
import { addResultToResponse, sendResponseIfFinished } from './responses';
import { Output, ContentCrawlerUserData } from './types';
import { addTimeMeasureEvent, transformTimeMeasuresToRelative } from './utils';
import { processHtml } from './website-content-crawler/html-processing';
import { htmlToMarkdown } from './website-content-crawler/markdown';

let ACTOR_TIMEOUT_AT: number | undefined;
try {
    ACTOR_TIMEOUT_AT = process.env.ACTOR_TIMEOUT_AT ? new Date(process.env.ACTOR_TIMEOUT_AT).getTime() : undefined;
} catch (err) {
    ACTOR_TIMEOUT_AT = undefined;
}

/**
 * Waits for the `time` to pass, but breaks early if the page is loaded (source: Website Content Crawler).
 */
async function waitForPlaywright({ page }: PlaywrightCrawlingContext, time: number) {
    // Early break is possible only after 1/3 of the time has passed (max 3 seconds) to avoid breaking too early.
    const hardDelay = Math.min(1000, Math.floor(0.3 * time));
    await sleep(hardDelay);

    return Promise.race([page.waitForLoadState('networkidle', { timeout: 0 }), sleep(time - hardDelay)]);
}

/**
 * Decide whether to wait based on the remaining time left for the Actor to run.
 * Always waits if the Actor is in the STANDBY_MODE.
 */
export function hasTimeLeftToTimeout(time: number) {
    if (process.env.STANDBY_MODE) return true;
    if (!ACTOR_TIMEOUT_AT) return true;

    const timeLeft = ACTOR_TIMEOUT_AT - Date.now();
    if (timeLeft > time) return true;

    log.debug('Not enough time left to wait for dynamic content. Skipping');
    return false;
}

/**
 * Waits for the `time`, but checks the content length every half second and breaks early if it hasn't changed
 * in last 2 seconds (source: Website Content Crawler).
 */
export async function waitForDynamicContent(context: PlaywrightCrawlingContext, time: number) {
    if (context.page && hasTimeLeftToTimeout(time)) {
        await waitForPlaywright(context, time);
    }
}

function isValidContentType(contentType: string | undefined) {
    return ['text', 'html', 'xml'].some((type) => contentType?.includes(type));
}

async function checkValidResponse(
    $: CheerioCrawlingContext['$'],
    contentType: string | undefined,
    context: PlaywrightCrawlingContext<ContentCrawlerUserData> | CheerioCrawlingContext<ContentCrawlerUserData>,
) {
    const { request, response } = context;
    const { responseId } = request.userData;

    if (!$ || !isValidContentType(contentType)) {
        log.info(`Skipping URL ${request.loadedUrl} as it could not be parsed.`, { contentType });
        const resultSkipped: Output = {
            crawl: {
                httpStatusCode: response?.status(),
                httpStatusMessage: "Couldn't parse the content",
                loadedAt: new Date(),
                uniqueKey: request.uniqueKey,
                requestStatus: ContentCrawlerStatus.FAILED,
            },
            metadata: { url: request.url },
            searchResult: request.userData.searchResult!,
            query: request.userData.query,
            text: '',
        };
        log.info(`Adding result to the Apify dataset, url: ${request.url}`);
        await context.pushData(resultSkipped);
        if (responseId) {
            addResultToResponse(responseId, request.uniqueKey, resultSkipped);
            sendResponseIfFinished(responseId);
        }
        return false;
    }

    return true;
}

async function handleContent(
    $: CheerioCrawlingContext['$'],
    crawlerName: 'playwright' | 'cheerio',
    statusCode: number | undefined,
    context: PlaywrightCrawlingContext<ContentCrawlerUserData> | CheerioCrawlingContext<ContentCrawlerUserData>,
) {
    const { request } = context;
    const { responseId, contentScraperSettings: settings } = request.userData;

    const $html = $('html');
    const html = $html.html()!;
    const processedHtml = await processHtml(html, request.url, settings, $);
    addTimeMeasureEvent(request.userData, `${crawlerName}-process-html`);

    const isTooLarge = processedHtml.length > settings.maxHtmlCharsToProcess;
    const text = isTooLarge ? load(processedHtml).text() : htmlToText(load(processedHtml));

    const result: Output = {
        crawl: {
            httpStatusCode: statusCode,
            httpStatusMessage: 'OK',
            loadedAt: new Date(),
            uniqueKey: request.uniqueKey,
            requestStatus: ContentCrawlerStatus.HANDLED,
        },
        searchResult: request.userData.searchResult!,
        metadata: {
            author: $('meta[name=author]').first().attr('content') ?? undefined,
            title: $('title').first().text(),
            description: $('meta[name=description]').first().attr('content') ?? undefined,
            languageCode: $html.first().attr('lang') ?? undefined,
            url: request.url,
        },
        query: request.userData.query,
        text: settings.outputFormats.includes('text') ? text : undefined,
        markdown: settings.outputFormats.includes('markdown') ? htmlToMarkdown(processedHtml) : undefined,
        html: settings.outputFormats.includes('html') ? processedHtml : undefined,
    };

    addTimeMeasureEvent(request.userData, `${crawlerName}-before-response-send`);
    if (settings.debugMode) {
        result.crawl.debug = { timeMeasures: transformTimeMeasuresToRelative(request.userData.timeMeasures!) };
    }
    log.info(`Adding result to the Apify dataset, url: ${request.url}`);
    await context.pushData(result);

    // Get responseId from the request.userData, which corresponds to the original search request
    if (responseId) {
        addResultToResponse(responseId, request.uniqueKey, result);
        sendResponseIfFinished(responseId);
    }
}

export async function requestHandlerPlaywright(
    context: PlaywrightCrawlingContext<ContentCrawlerUserData>,
) {
    const { request, response, page, closeCookieModals } = context;
    const { contentScraperSettings: settings } = request.userData;

    log.info(`Processing URL: ${request.url}`);
    addTimeMeasureEvent(request.userData, 'playwright-request-start');
    if (settings.dynamicContentWaitSecs > 0) {
        await waitForDynamicContent(context, settings.dynamicContentWaitSecs * 1000);
        addTimeMeasureEvent(request.userData, 'playwright-wait-dynamic-content');
    }

    if (page && settings.removeCookieWarnings) {
        await closeCookieModals();
        addTimeMeasureEvent(request.userData, 'playwright-remove-cookie');
    }

    // Parsing the page after the dynamic content has been loaded / cookie warnings removed
    const $ = await context.parseWithCheerio();
    addTimeMeasureEvent(request.userData, 'playwright-parse-with-cheerio');

    const headers = response?.headers instanceof Function ? response.headers() : response?.headers;
    // @ts-expect-error false-positive?
    const isValidResponse = await checkValidResponse($, headers?.['content-type'], context);
    if (!isValidResponse) return;

    const statusCode = response?.status();

    await handleContent($, 'playwright', statusCode, context);
}

export async function requestHandlerCheerio(
    context: CheerioCrawlingContext<ContentCrawlerUserData>,
) {
    const { $, request, response } = context;

    log.info(`Processing URL: ${request.url}`);
    addTimeMeasureEvent(request.userData, 'cheerio-request-start');

    const isValidResponse = await checkValidResponse($, response.headers['content-type'], context);
    if (!isValidResponse) return;

    const statusCode = response?.statusCode;

    await handleContent($, 'cheerio', statusCode, context);
}

export async function failedRequestHandler(request: Request, err: Error, crawlerName: 'playwright' | 'cheerio') {
    log.error(`Content-crawler failed to process request ${request.url}, error ${err.message}`);
    request.userData.timeMeasures!.push({ event: `${crawlerName}-failed-request`, time: Date.now() });
    const { responseId } = request.userData;
    if (responseId) {
        const resultErr: Output = {
            crawl: {
                httpStatusCode: 500,
                httpStatusMessage: err.message,
                loadedAt: new Date(),
                uniqueKey: request.uniqueKey,
                requestStatus: ContentCrawlerStatus.FAILED,
            },
            searchResult: request.userData.searchResult!,
            metadata: {
                url: request.url,
                title: '',
            },
            text: '',
        };
        log.info(`Adding result to the Apify dataset, url: ${request.url}`);
        await Actor.pushData(resultErr);
        addResultToResponse(responseId, request.uniqueKey, resultErr);
        sendResponseIfFinished(responseId);
    }
}
