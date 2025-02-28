import { Actor } from 'apify';
import { BrowserName, CheerioCrawlerOptions, log, PlaywrightCrawlerOptions, ProxyConfiguration } from 'crawlee';
import { firefox } from 'playwright';

import { defaults } from './const.js';
import { UserInputError } from './errors.js';
import type { Input, ContentScraperSettings, OutputFormats, StandbyInput } from './types.js';

/**
 * Processes the input and returns the settings for the crawler (adapted from: Website Content Crawler).
 */

export async function processInput(
    originalInput: Partial<Input> | Partial<StandbyInput>,
    standbyInit: boolean = false,
) {
    if (originalInput.outputFormats && typeof originalInput.outputFormats === 'string') {
        originalInput.outputFormats = originalInput.outputFormats.split(',').map((format) => format.trim()) as OutputFormats[];
    }
    const input = { ...defaults, ...originalInput } as Input;

    validateAndFillInput(input, standbyInit);

    const {
        debugMode,
        dynamicContentWaitSecs,
        keepAlive,
        serpMaxRetries,
        proxyConfiguration,
        serpProxyGroup,
        readableTextCharThreshold,
        removeCookieWarnings,
        useCheerioCrawler,
    } = input;

    log.setLevel(debugMode ? log.LEVELS.DEBUG : log.LEVELS.INFO);

    const proxySearch = await Actor.createProxyConfiguration({ groups: [serpProxyGroup] });
    const cheerioCrawlerOptions: CheerioCrawlerOptions = {
        keepAlive,
        maxRequestRetries: serpMaxRetries,
        proxyConfiguration: proxySearch,
        autoscaledPoolOptions: { desiredConcurrency: 1 },
    };
    const proxy = await Actor.createProxyConfiguration(proxyConfiguration);
    const contentCrawlerOptions: PlaywrightCrawlerOptions | CheerioCrawlerOptions = useCheerioCrawler
        ? createCheerioCrawlerOptions(input, proxy)
        : createPlaywrightCrawlerOptions(input, proxy);

    const contentScraperSettings: ContentScraperSettings = {
        debugMode,
        dynamicContentWaitSecs,
        htmlTransformer: 'none',
        maxHtmlCharsToProcess: 1.5e6,
        outputFormats: input.outputFormats as OutputFormats[],
        readableTextCharThreshold,
        removeCookieWarnings,
        removeElementsCssSelector: input.removeElementsCssSelector,
    };

    return { input, cheerioCrawlerOptions, contentCrawlerOptions, contentScraperSettings };
}

function createPlaywrightCrawlerOptions(input: Input, proxy: ProxyConfiguration | undefined): PlaywrightCrawlerOptions {
    const { keepAlive, maxRequestRetries, initialConcurrency, maxConcurrency, minConcurrency } = input;

    return {
        headless: true,
        keepAlive,
        maxRequestRetries,
        proxyConfiguration: proxy,
        requestHandlerTimeoutSecs: input.requestTimeoutSecs,
        launchContext: {
            launcher: firefox,
        },
        browserPoolOptions: {
            fingerprintOptions: {
                fingerprintGeneratorOptions: {
                    browsers: [BrowserName.firefox],
                },
            },
            retireInactiveBrowserAfterSecs: 60,
        },
        autoscaledPoolOptions: {
            desiredConcurrency: initialConcurrency === 0 ? undefined : Math.min(initialConcurrency, maxConcurrency),
            maxConcurrency,
            minConcurrency,
        },
    };
}

function createCheerioCrawlerOptions(input: Input, proxy: ProxyConfiguration | undefined): CheerioCrawlerOptions {
    const { keepAlive, maxRequestRetries, initialConcurrency, maxConcurrency, minConcurrency } = input;

    return {
        keepAlive,
        maxRequestRetries,
        proxyConfiguration: proxy,
        requestHandlerTimeoutSecs: input.requestTimeoutSecs,
        autoscaledPoolOptions: {
            desiredConcurrency: initialConcurrency === 0 ? undefined : Math.min(initialConcurrency, maxConcurrency),
            maxConcurrency,
            minConcurrency,
        },
    };
}

/**
 * Validates the input and fills in the default values where necessary.
 * Do not validate query parameter when standbyInit is true.
 * This is a bit ugly, but it's necessary to avoid throwing an error when the query is not provided in standby mode.
 */
export function validateAndFillInput(input: Input, standbyInit: boolean) {
    const validateRange = (
        value: number | string | undefined,
        min: number,
        max: number,
        defaultValue: number,
        fieldName: string,
    ) => {
        // parse the value as a number to check if it's a valid number
        if (value === undefined) {
            log.warning(`The \`${fieldName}\` parameter must be defined. Using the default value ${defaultValue} instead.`);
            return defaultValue;
        } if (typeof value === 'string') {
            value = Number(value);
        } if (value < min) {
            log.warning(`The \`${fieldName}\` parameter must be at least ${min}, but was ${fieldName}. Using ${min} instead.`);
            return min;
        } if (value > max) {
            log.warning(`The \`${fieldName}\` parameter must be at most ${max}, but was ${fieldName}. Using ${max} instead.`);
            return max;
        }
        return value;
    };
    if (!input.query && !standbyInit) {
        throw new UserInputError('The `query` parameter must be provided and non-empty.');
    }

    input.maxResults = validateRange(input.maxResults, 1, defaults.maxResultsMax, defaults.maxResults, 'maxResults');
    input.requestTimeoutSecs = validateRange(input.requestTimeoutSecs, 1, defaults.requestTimeoutSecsMax, defaults.requestTimeoutSecs, 'requestTimeoutSecs');
    input.serpMaxRetries = validateRange(input.serpMaxRetries, 0, defaults.serpMaxRetriesMax, defaults.serpMaxRetries, 'serpMaxRetries');
    input.maxRequestRetries = validateRange(input.maxRequestRetries, 0, defaults.maxRequestRetriesMax, defaults.maxRequestRetries, 'maxRequestRetries');

    if (!input.outputFormats || input.outputFormats.length === 0) {
        input.outputFormats = defaults.outputFormats as OutputFormats[];
        log.warning(`The \`outputFormats\` parameter must be a non-empty array. Using default value \`${defaults.outputFormats}\`.`);
    } else if (input.outputFormats.some((format) => !['text', 'markdown', 'html'].includes(format))) {
        throw new UserInputError('The `outputFormats` array may only contain `text`, `markdown`, or `html`.');
    }
    if (input.serpProxyGroup !== 'GOOGLE_SERP' && input.serpProxyGroup !== 'SHADER') {
        throw new UserInputError('The `serpProxyGroup` parameter must be either `GOOGLE_SERP` or `SHADER`.');
    }
    if (input.dynamicContentWaitSecs >= input.requestTimeoutSecs) {
        input.dynamicContentWaitSecs = Math.round(input.requestTimeoutSecs / 2);
    }
}
