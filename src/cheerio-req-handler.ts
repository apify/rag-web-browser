import { Actor } from 'apify';
import { load } from 'cheerio';
import { CheerioCrawlingContext, htmlToText, Request, log } from 'crawlee';

import { ContentCrawlerStatus } from './const';
import { addResultToResponse, sendResponseIfFinished } from './responses';
import type { Output, ContentCrawlerUserData } from './types';
import { addTimeMeasureEvent, transformTimeMeasuresToRelative } from './utils';
import { processHtml } from './website-content-crawler/html-processing';
import { htmlToMarkdown } from './website-content-crawler/markdown';

function isValidContentType(contentType: string | undefined) {
    return ['text', 'html', 'xml'].some((type) => contentType?.includes(type));
}

/**
 * Generic handler for processing the page content (adapted from: ./playwright-req-handler.ts).
 */
export async function requestHandlerCheerio(
    context: CheerioCrawlingContext<ContentCrawlerUserData>,
) {
    const { $, request, response } = context;
    const { contentScraperSettings: settings } = request.userData;

    log.info(`Processing request: ${request.url}`);
    addTimeMeasureEvent(request.userData, 'cheerio-request-start');

    const { responseId } = request.userData;
    if (!$ || !isValidContentType(response.headers['content-type'])) {
        log.info(`Skipping URL ${request.loadedUrl} as it could not be parsed.`);
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
        return;
    }

    const $html = $('html');
    const html = $html.html()!;
    const processedHtml = await processHtml(html, request.url, settings, $);
    addTimeMeasureEvent(request.userData, 'cheerio-process-html');

    const isTooLarge = processedHtml.length > settings.maxHtmlCharsToProcess;
    const text = isTooLarge ? load(processedHtml).text() : htmlToText(load(processedHtml));

    const result: Output = {
        crawl: {
            httpStatusCode: response.statusCode,
            httpStatusMessage: 'OK',
            loadedAt: new Date(),
            uniqueKey: request.uniqueKey,
            requestStatus: ContentCrawlerStatus.HANDLED,
        },
        searchResult: request.userData.searchResult!,
        metadata: {
            author: $('meta[name="author"]').attr('content') ?? undefined,
            title: $('title').first().text(),
            description: $('meta[name="description"]').attr('content') ?? undefined,
            languageCode: $html.first().attr('lang') ?? undefined,
            url: request.url,
        },
        query: request.userData.query,
        text: settings.outputFormats.includes('text') ? text : undefined,
        markdown: settings.outputFormats.includes('markdown') ? htmlToMarkdown(processedHtml) : undefined,
        html: settings.outputFormats.includes('html') ? processedHtml : undefined,
    };

    addTimeMeasureEvent(request.userData, 'cheerio-before-response-send');
    if (settings.debugMode) {
        result.crawl.debug = { timeMeasures: transformTimeMeasuresToRelative(request.userData.timeMeasures!) };
    }
    log.info(`Adding result to the Apify dataset, url: ${request.url}`);
    await context.pushData(result);

    if (responseId) {
        addResultToResponse(responseId, request.uniqueKey, result);
        sendResponseIfFinished(responseId);
    }
}

export async function failedRequestHandlerCheerio(request: Request, err: Error) {
    log.error(`Cheerio-content-crawler failed to process request ${request.url}, error ${err.message}`);
    request.userData.timeMeasures!.push({ event: 'cheerio-failed-request', time: Date.now() });
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
