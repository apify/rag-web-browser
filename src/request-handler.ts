import { htmlToText, log, PlaywrightCrawlingContext, sleep } from 'crawlee';
import { load } from 'cheerio';

import { processHtml } from './html-processing.js';
import { htmlToMarkdown } from './markdown.js';
import { ScraperSettings, UserData } from './types.js';

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
export async function genericHandler(context: PlaywrightCrawlingContext<UserData>, settings: ScraperSettings) {
    const { request, contentType, page, response, closeCookieModals } = context;

    log.info(`Processing URL: ${request.url}`);
    if (settings.dynamicContentWaitSecs > 0) {
        await waitForDynamicContent(context, settings.dynamicContentWaitSecs * 1000);
    }

    if (page && settings.removeCookieWarnings) {
        await closeCookieModals();
    }

    // Parsing the page after the dynamic content has been loaded / cookie warnings removed
    const $ = await context.parseWithCheerio();

    const headers = response?.headers instanceof Function ? response.headers() : response?.headers;
    // @ts-expect-error false-positive?
    if (!$ || !isValidContentType(headers['content-type'])) {
        log.info(`Skipping URL ${request.loadedUrl} as it could not be parsed.`, contentType as object);
        return;
    }

    const html = $('html').html()!;
    const processedHtml = await processHtml(html, request.url, settings, $);

    const isTooLarge = processedHtml.length > settings.maxHtmlCharsToProcess;
    const text = isTooLarge ? load(processedHtml).text() : htmlToText(load(processedHtml));

    const markdown = htmlToMarkdown(processedHtml);

    log.info(`Pushing data from: ${request.url} to the Apify dataset`);
    await context.pushData({ url: request.url, text, markdown });
}
