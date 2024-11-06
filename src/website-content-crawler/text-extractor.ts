import { Readability, isProbablyReaderable } from '@mozilla/readability';
import { log } from 'crawlee';
import { JSDOM, VirtualConsole } from 'jsdom';

import type { PlaywrightScraperSettings } from '../types.js';

const virtualConsole = new VirtualConsole();
virtualConsole.on('error', (error) => {
    log.error(`JSDOM error: ${error}`);
});

/**
 * Extracts readable text from the HTML using Mozilla's Readability (source: Website Content Crawler).
 */
export async function readableText({
    html,
    url,
    settings,
    options,
}: {
    html: string;
    url: string;
    settings: PlaywrightScraperSettings;
    options?: {
        fallbackToNone?: boolean;
    };
}): Promise<string | undefined> {
    // Add virtualConsole to silence this Error: Could not parse CSS stylesheet at exports.createStylesheet
    // There is some issue with the VirtualConsole as the error is not logged
    const dom = new JSDOM(html, { url, virtualConsole });

    if (options?.fallbackToNone && !isProbablyReaderable(dom.window.document, { minScore: 100 })) {
        return html;
    }

    const reader = new Readability(dom.window.document, {
        charThreshold: settings.readableTextCharThreshold,
        serializer: (n) => n, // Keep the original node, we'll be updating it later
    });
    const parsed = reader.parse();

    const readabilityRoot = parsed?.content as HTMLElement | null;

    if (readabilityRoot && parsed?.title) {
        const titleElement = dom.window.document.createElement('h1');
        titleElement.textContent = parsed.title;
        readabilityRoot.insertBefore(titleElement, readabilityRoot.firstChild);
    }

    return readabilityRoot?.outerHTML;
}
