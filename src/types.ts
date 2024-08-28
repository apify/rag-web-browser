import type { ProxyConfigurationOptions } from 'apify';

type OutputFormat = 'text' | 'markdown' | 'html';

export type Input = {

    // both
    keepAlive: boolean;

    // google search parameters
    countryCode: string;
    languageCode: string;
    maxResults: number;
    proxyConfigurationSearch: 'GOOGLE_SERP' | 'SHADER';
    query: string;

    // content crawler parameters
    dynamicContentWaitSecs: number;
    outputFormats: OutputFormat[]
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

export interface ScraperSettings {
    dynamicContentWaitSecs: number;
    maxHtmlCharsToProcess: number;
    readableTextCharThreshold: number;
    removeCookieWarnings?: boolean;
    outputFormats: OutputFormat[];
}

export type Output = {
    text: string;
    html?: string | null;
    markdown?: string | null;
    crawl: {
        httpStatusCode?: number | null;
        loadedTime: Date;
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
