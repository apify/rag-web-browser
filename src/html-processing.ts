import type { CheerioAPI } from 'cheerio';
import { log } from 'crawlee';

import { readableText } from './extractors.js';
import type { ScraperSettings } from './types.js';

/**
 * Process HTML with the selected HTML transformer (source: Website Content Crawler).
 */
export async function processHtml(
    html: string | null,
    url: string,
    settings: ScraperSettings,
    $: CheerioAPI,
): Promise<string> {
    const $body = $('body').clone();

    const simplifiedBody = $body.html()?.trim();

    const simplified = typeof simplifiedBody === 'string'
        ? `<html lang="">
        <head>
            <title>
                ${$('title').text()}
            </title>
        </head>
        <body>
            ${simplifiedBody}
        </body>
    </html>`
        : html ?? '';

    let ret = null;
    try {
        ret = await readableText({ html: simplified, url, settings, options: { fallbackToNone: false } });
    } catch (error) {
        log.warning(`Processing of HTML failed with error:`, { error });
    }
    return ret ?? simplified as string;
}
