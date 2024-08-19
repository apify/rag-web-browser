import { Actor } from 'apify';
import { BrowserName, PlaywrightCrawlerOptions, PlaywrightCrawlingContext } from 'crawlee';
import { firefox } from 'playwright';

import defaults from './defaults.json' assert { type: 'json' };
import { genericHandler } from './request-handler.js';
import type { Input, ScraperSettings } from './types.js';

/**
 * Processes the input and returns the settings for the crawler (adapted from: Website Content Crawler).
 */

export async function processInput(originalInput: Partial<Input>) {
    const input: Input = { ...(defaults as unknown as Input), ...originalInput };

    if (input.dynamicContentWaitSecs >= input.requestTimeoutSecs) {
        input.dynamicContentWaitSecs = Math.round(input.requestTimeoutSecs / 2);
    }

    const {
        dynamicContentWaitSecs,
        proxyConfiguration,
        maxRequestRetries,
        readableTextCharThreshold,
        removeCookieWarnings,
        requestTimeoutSecs,
        saveHtml,
        saveMarkdown,
    } = input;

    const proxy = await Actor.createProxyConfiguration(proxyConfiguration);

    const scraperSettings: ScraperSettings = {
        dynamicContentWaitSecs,
        maxHtmlCharsToProcess: 1.5e6,
        readableTextCharThreshold,
        removeCookieWarnings,
        saveHtml,
        saveMarkdown,
    };

    const crawlerOptions: PlaywrightCrawlerOptions = {
        headless: true,
        maxRequestRetries,
        proxyConfiguration: proxy,
        requestHandlerTimeoutSecs: requestTimeoutSecs,
        launchContext: {
            launcher: firefox,
        },
        browserPoolOptions: {
            fingerprintOptions: {
                fingerprintGeneratorOptions: {
                    browsers: [BrowserName.firefox],
                },
            },
            retireInactiveBrowserAfterSecs: 20,
        },
        requestHandler: (context: PlaywrightCrawlingContext) => genericHandler(context, scraperSettings),
    };

    return { input, crawlerOptions, scraperSettings };
}
