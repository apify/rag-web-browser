import { Actor } from 'apify';
import { BrowserName, PlaywrightCrawlerOptions } from 'crawlee';
import { firefox } from 'playwright';

import defaults from './defaults.json' assert { type: 'json' };
import { UserInputError } from './errors.js';
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
        keepAlive,
        maxRequestRetries,
        outputFormats,
        proxyConfiguration,
        readableTextCharThreshold,
        removeCookieWarnings,
        requestTimeoutSecs,
    } = input;

    const proxy = await Actor.createProxyConfiguration(proxyConfiguration);

    const scraperSettings: ScraperSettings = {
        dynamicContentWaitSecs,
        maxHtmlCharsToProcess: 1.5e6,
        outputFormats,
        readableTextCharThreshold,
        removeCookieWarnings,
    };

    const crawlerOptions: PlaywrightCrawlerOptions = {
        headless: true,
        keepAlive,
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
    };

    return { input, crawlerOptions, scraperSettings };
}

export async function checkInputsAreValid(input: Partial<Input>) {
    if (!input.query) {
        throw new UserInputError('The "query" parameter must be provided and non-empty');
    }
    if (input.maxResults !== undefined && input.maxResults <= 0) {
        throw new UserInputError('The "maxResults" parameter must be greater than 0');
    }
}
