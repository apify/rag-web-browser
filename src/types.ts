import type { ProxyConfigurationOptions } from 'apify';

type OutputFormats = 'text' | 'markdown' | 'html';

export type Input = {

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
    outputFormats: OutputFormats[]
    initialConcurrency: number;
    maxConcurrency: number;
    maxRequestRetries: number;
    minConcurrency: number;
    proxyConfiguration: ProxyConfigurationOptions;
    readableTextCharThreshold: number;
    removeCookieWarnings: boolean;
    requestTimeoutContentCrawlSecs: number;
};

export type OrganicResult = {
    title?: string;
    url?: string;
};

export interface TimeMeasure {
    event: 'request received' | 'before queue add' | 'crawlee internal run task' | 'crawlee internal request handler' | 'pre-navigation hook' |
        'page loaded' | 'handler end' | 'error' | 'failed request',
    time: number,
}

export type UserData = {
    startedAt?: Date;
    finishedAt?: Date;
    responseId?: string;
    maxResults?: number;
    timeMeasures: TimeMeasure[];
};

export interface PlaywrightScraperSettings {
    dynamicContentWaitSecs: number;
    maxHtmlCharsToProcess: number;
    outputFormats: OutputFormats[];
    readableTextCharThreshold: number;
    removeCookieWarnings?: boolean;
}

export type httpStatus = {
    code?: number | null;
    message?: string | null;
}

export type Output = {
    text: string;
    html?: string | null;
    markdown?: string | null;
    crawl: {
        createdAt?: Date;
        httpStatus?: httpStatus;
        loadedAt?: Date;
        requestStatus: string;
        uniqueKey: string;
    }
    metadata: {
        author?: string | null;
        description?: string | null;
        keywords?: string | null;
        languageCode?: string | null
        title?: string | null;
        url: string;
    };
}
