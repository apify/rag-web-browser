import type { ProxyConfigurationOptions } from 'apify';
import { CheerioCrawlerOptions, PlaywrightCrawlerOptions } from 'crawlee';

import { ContentCrawlerTypes } from './const';

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
    scrapingTool: 'browser-playwright' | 'raw-http';
    blockMedia: boolean;
};

export type StandbyInput = Input & {
    outputFormats: OutputFormats[] | string
    blockMedia: boolean | string;
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
        | 'cheerio-request-start'
        | 'cheerio-failed-request'
        | 'cheerio-process-html'
        | 'cheerio-request-end'
        | 'cheerio-request-handler-start'
        | 'cheerio-before-response-send'
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
    contentCrawlerKey: string;
    responseId: string;
    contentScraperSettings: ContentScraperSettings;
};

export type ContentCrawlerUserData = {
    query: string;
    responseId: string;
    timeMeasures: TimeMeasure[];
    searchResult?: OrganicResult;
    contentCrawlerKey?: string;
    contentScraperSettings: ContentScraperSettings;
};

export interface ContentScraperSettings {
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
        debug?: {
            timeMeasures?: TimeMeasure[];
        };
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

export type ContentCrawlerOptions = {
    type: ContentCrawlerTypes.CHEERIO,
    crawlerOptions: CheerioCrawlerOptions
} | {
    type: ContentCrawlerTypes.PLAYWRIGHT,
    crawlerOptions: PlaywrightCrawlerOptions
};
