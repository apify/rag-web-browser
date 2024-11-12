import type { ProxyConfigurationOptions } from 'apify';

type OutputFormats = 'text' | 'markdown' | 'html';

export type Input = {
    debugMode: boolean;
    requestTimeoutSecs: number;

    // both
    keepAlive: boolean;

    // google search parameters
    countryCode: string;
    languageCode: string;
    maxResults: number;
    proxyGroupSearch: 'GOOGLE_SERP' | 'SHADER';
    maxRequestRetriesSearch: number;
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
    removeCookieWarnings: boolean;
};

export type OrganicResult = {
    description?: string;
    title?: string;
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

export type UserData = {
    finishedAt?: Date;
    maxResults?: number;
    query?: string;
    responseId?: string;
    startedAt?: Date;
    timeMeasures?: TimeMeasure[];
    googleSearchResult?: OrganicResult;
    playwrightCrawlerKey?: string;
};

export interface PlaywrightScraperSettings {
    debugMode: boolean;
    dynamicContentWaitSecs: number;
    maxHtmlCharsToProcess: number;
    outputFormats: OutputFormats[];
    readableTextCharThreshold: number;
    removeCookieWarnings?: boolean;
}

export type Output = {
    text: string;
    html?: string | null;
    markdown?: string | null;
    query?: string;
    crawl: {
        debug?: unknown;
        createdAt?: Date;
        httpStatusCode?: number | null;
        httpStatusMessage?: string | null;
        loadedAt?: Date;
        requestStatus: string;
        uniqueKey: string;
    };
    googleSearchResult: OrganicResult;
    metadata: {
        author?: string | null;
        description?: string | null;
        keywords?: string | null;
        languageCode?: string | null;
        title?: string | null;
        url: string;
    };
};
