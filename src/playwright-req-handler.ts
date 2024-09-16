import { load } from 'cheerio';
import { htmlToText, log, PlaywrightCrawlingContext, sleep, Request } from 'crawlee';

import { ContentCrawlerStatus } from './const.js';
import { addResultToResponse, sendResponseIfFinished } from './responses.js';
import { Output, PlaywrightScraperSettings, UserData } from './types.js';
import { addTimeMeasureEvent, transformTimeMeasuresToRelative } from './utils.js';
import { processHtml } from './website-content-crawler/html-processing.js';
import { htmlToMarkdown } from './website-content-crawler/markdown.js';

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
 * Waits for the `time`, but checks the content length every half second and breaks early if it hasn't changed
 * in last 2 seconds (source: Website Content Crawler).
 */
export async function waitForDynamicContent(context: PlaywrightCrawlingContext, time: number) {
    if (context.page) {
        await waitForPlaywright(context, time);
    }
}

function isValidContentType(contentType: string | undefined) {
    return ['text', 'html', 'xml'].some((type) => contentType?.includes(type));
}

/**
 * Generic handler for processing the page content (adapted from: Website Content Crawler).
 */
export async function requestHandlerPlaywright(
    context: PlaywrightCrawlingContext<UserData>,
    settings: PlaywrightScraperSettings,
) {
    const { request, contentType, page, response, closeCookieModals } = context;

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

    const { responseId } = request.userData;
    const headers = response?.headers instanceof Function ? response.headers() : response?.headers;
    // @ts-expect-error false-positive?
    if (!$ || !isValidContentType(headers['content-type'])) {
        log.info(`Skipping URL ${request.loadedUrl} as it could not be parsed.`, contentType as object);
        const resultSkipped: Output = {
            crawl: {
                httpStatusCode: response?.status(),
                httpStatusMessage: "Couldn't parse the content",
                loadedAt: new Date(),
                uniqueKey: request.uniqueKey,
                requestStatus: ContentCrawlerStatus.FAILED,
            },
            metadata: { url: request.url },
            googleSearchResult: request.userData.googleSearchResult!,
            query: request.userData.query,
            text: request.userData.googleSearchResult?.description || '',
        };
        log.info(`Adding result to the Apify dataset, url: ${request.url}`);
        await context.pushData(resultSkipped);
        if (responseId) {
            addResultToResponse(responseId, request.uniqueKey, resultSkipped);
            sendResponseIfFinished(responseId);
        }
        return;
    }

    const $html = $('html');
    const html = $html.html()!;
    const processedHtml = await processHtml(html, request.url, settings, $);
    addTimeMeasureEvent(request.userData, 'playwright-process-html');

    const isTooLarge = processedHtml.length > settings.maxHtmlCharsToProcess;
    const text = isTooLarge ? load(processedHtml).text() : htmlToText(load(processedHtml));

    const result: Output = {
        crawl: {
            httpStatusCode: page ? response?.status() : null,
            httpStatusMessage: 'OK',
            loadedAt: new Date(),
            uniqueKey: request.uniqueKey,
            requestStatus: ContentCrawlerStatus.HANDLED,
        },
        googleSearchResult: request.userData.googleSearchResult!,
        metadata: {
            author: $('meta[name=author]').first().attr('content') ?? null,
            title: $('title').first().text(),
            description: $('meta[name=description]').first().attr('content') ?? null,
            keywords: $('meta[name=keywords]').first().attr('content') ?? null,
            languageCode: $html.first().attr('lang') ?? null,
            url: request.url,
        },
        text,
        query: request.userData.query,
        markdown: settings.outputFormats.includes('markdown') ? htmlToMarkdown(processedHtml) : null,
        html: settings.outputFormats.includes('html') ? processedHtml : null,
    };

    addTimeMeasureEvent(request.userData, 'playwright-before-response-send');
    if (settings.debugMode) {
        result.crawl.debug = { timeMeasures: transformTimeMeasuresToRelative(request.userData.timeMeasures!) };
    }
    log.info(`Adding result to the Apify dataset, url: ${request.url}`);
    await context.pushData(result);

    log.info(`Adding result to response: ${request.userData.responseId}, request.uniqueKey: ${request.uniqueKey}`);
    // Get responseId from the request.userData, which corresponds to the original search request
    if (responseId) {
        addResultToResponse(responseId, request.uniqueKey, result);
        sendResponseIfFinished(responseId);
    }
}

export async function failedRequestHandlerPlaywright(request: Request, err: Error, context: PlaywrightCrawlingContext) {
    log.error(`Playwright-content-crawler failed to process request ${request.url}, error ${err.message}`);
    request.userData.timeMeasures!.push({ event: 'playwright-failed-request', time: Date.now() });
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
            googleSearchResult: request.userData.googleSearchResult!,
            metadata: {
                url: request.url,
                title: request.userData.googleSearchResult?.title,
            },
            text: request.userData.googleSearchResult?.description || '',
        };
        log.info(`Adding result to the Apify dataset, url: ${request.url}`);
        await context.pushData(resultErr);
        addResultToResponse(responseId, request.uniqueKey, resultErr);
        sendResponseIfFinished(responseId);
    }
}
