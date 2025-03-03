import type { ProxyConfigurationOptions } from 'apify';

export type OutputFormats = 'text' | 'markdown' | 'html';

export type Input = {
    debugMode: boolean;
    requestTimeoutSecs: number;

    // both
    keepAlive: boolean;

    // google search parameters
    countryCode: string;
    languageCode: string;
    maxResults: number;
    serpProxyGroup: 'GOOGLE_SERP' | 'SHADER';
    serpMaxRetries: number;
    query: string;

    // content crawler parameters
    dynamicContentWaitSecs: number;
    outputFormats: OutputFormats[];
    initialConcurrency: number;
    maxConcurrency: number;
    maxRequestRetries: number;
    minConcurrency: number;
    proxyConfiguration: ProxyConfigurationOptions;
    readableTextCharThreshold: number;
    removeElementsCssSelector: string;
    removeCookieWarnings: boolean;
};

export type StandbyInput = Input & {
    outputFormats: OutputFormats[] | string
}

export type OrganicResult = {
    description?: string;
    title?: string;
    rank?: number;
    url?: string;
};

export interface TimeMeasure {
    event:
        | 'actor-started'
        | 'before-cheerio-queue-add'
        | 'before-cheerio-run'
        | 'before-playwright-queue-add'
        | 'before-playwright-run'
        | 'cheerio-failed-request'
        | 'cheerio-request-end'
        | 'cheerio-request-handler-start'
        | 'error'
        | 'playwright-request-start'
        | 'playwright-wait-dynamic-content'
        | 'playwright-parse-with-cheerio'
        | 'playwright-process-html'
        | 'playwright-remove-cookie'
        | 'playwright-before-response-send'
        | 'playwright-failed-request'
        | 'request-received';
    timeMs: number;
    timeDeltaPrevMs: number;
}

export type SearchCrawlerUserData = {
    maxResults: number;
    timeMeasures: TimeMeasure[];
    query: string;
    playwrightCrawlerKey: string;
    responseId: string;
    playwrightScraperSettings: PlaywrightScraperSettings;
};

export type PlaywrightCrawlerUserData = {
    query: string;
    responseId: string;
    timeMeasures: TimeMeasure[];
    searchResult?: OrganicResult;
    playwrightScraperSettings: PlaywrightScraperSettings;
};

export interface PlaywrightScraperSettings {
    debugMode: boolean;
    dynamicContentWaitSecs: number;
    htmlTransformer?: string
    maxHtmlCharsToProcess: number;
    outputFormats: OutputFormats[];
    readableTextCharThreshold: number;
    removeCookieWarnings?: boolean;
    removeElementsCssSelector?: string;
}

export type Output = {
    text?: string | null;
    html?: string | null;
    markdown?: string | null;
    query?: string;
    crawl: {
        createdAt?: Date;
        httpStatusCode?: number | null;
        httpStatusMessage?: string | null;
        loadedAt?: Date;
        requestStatus: string;
        uniqueKey: string;
        debug?: unknown;
    };
    searchResult: OrganicResult;
    metadata: {
        title?: string | null;
        url: string;
        description?: string | null;
        author?: string | null;
        languageCode?: string | null;
    };
};
