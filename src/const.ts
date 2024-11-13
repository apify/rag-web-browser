export enum ContentCrawlerStatus {
    PENDING = 'pending',
    HANDLED = 'handled',
    FAILED = 'failed',
}

export const PLAYWRIGHT_REQUEST_TIMEOUT_NORMAL_MODE_SECS = 60;

export const defaults = {
    debugMode: false,
    dynamicContentWaitSecs: 10,
    initialConcurrency: 5,
    keepAlive: true,
    maxConcurrency: 10,
    maxRequestRetries: 1,
    maxRequestRetriesMax: 3,
    maxResults: 3,
    maxResultsMax: 100,
    minConcurrency: 3,
    outputFormats: ['markdown'],
    proxyConfiguration: { useApifyProxy: true },
    query: 'apify llm',
    readableTextCharThreshold: 100,
    removeCookieWarnings: true,
    requestTimeoutSecs: 40,
    requestTimeoutSecsMax: 300,
    serpMaxRetries: 2,
    serpMaxRetriesMax: 5,
    serpProxyGroup: 'GOOGLE_SERP',
};
