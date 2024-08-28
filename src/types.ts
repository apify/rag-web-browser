import type { ProxyConfigurationOptions } from 'apify';

type OutputFormats = 'text' | 'markdown' | 'html';

export type Input = {

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
    requestTimeoutSecs: number;
};

export type OrganicResult = {
    title?: string;
    url?: string;
};

export type UserData = {
    startedAt?: Date;
    finishedAt?: Date;
    responseId?: string;
    maxResults?: number;
};

export interface PlaywrightScraperSettings {
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
    crawl: {
        httpStatusCode?: number | null;
        loadedTime: Date;
        status: string;
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
