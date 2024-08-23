import type { ProxyConfigurationOptions } from 'apify';

// export interface CrawlerOptions {
//     proxyConfigurationOptions: ProxyConfigurationOptions;
// }

export type Input = {

    // both
    keepAlive: boolean;

    // google search parameters
    countryCode: string;
    languageCode: string;
    maxResults: number;
    query: string;
    proxyTypeSearchCrawler: 'GOOGLE_SERP' | 'RESIDENTIAL' | 'SHADER';
    proxyTypeDataCrawler: 'DATACENTER' | 'RESIDENTIAL';

    // content crawler parameters
    dynamicContentWaitSecs: number;
    initialConcurrency: number;
    maxConcurrency: number;
    maxRequestRetries: number;
    minConcurrency: number;
    proxyConfiguration: ProxyConfigurationOptions;
    readableTextCharThreshold: number;
    removeCookieWarnings: boolean;
    requestTimeoutSecs: number;
    saveHtml: boolean;
    saveMarkdown: boolean;
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

export type SearchQuery = {
    term: string;
    url: string;
    device: string;
    page: number;
    type: string;
    domain: string;
    countryCode: string;
    languageCode: string | null;
    resultsPerPage: number;
};

export interface ScraperSettings {
    dynamicContentWaitSecs: number;
    maxHtmlCharsToProcess: number;
    readableTextCharThreshold: number;
    removeCookieWarnings?: boolean;
    saveHtml?: boolean;
    saveMarkdown?: boolean;
}
