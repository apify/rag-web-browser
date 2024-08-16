import { JSDOM } from 'jsdom';
import { Readability, isProbablyReaderable } from '@mozilla/readability';
import type { ScraperSettings } from './types.js';

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
    settings: ScraperSettings;
    options?: {
        fallbackToNone?: boolean;
    };
}): Promise<string | undefined> {
    const dom = new JSDOM(html, { url });

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
