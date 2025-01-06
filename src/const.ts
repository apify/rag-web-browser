export enum ContentCrawlerStatus {
    PENDING = 'pending',
    HANDLED = 'handled',
    FAILED = 'failed',
}

export enum Routes {
    SEARCH = '/search',
    SSE = '/sse',
    MESSAGE = '/message',
}

export const PLAYWRIGHT_REQUEST_TIMEOUT_NORMAL_MODE_SECS = 60;

// TODO: It would be better to simply use input_schema.json rather then hard-coding these values,
//  to ensure the values in NORMAL mode and STANDBY are consistent
export const defaults = {
    debugMode: false,
    dynamicContentWaitSecs: 10,
    htmlTransformer: 'none',
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
    query: null,
    readableTextCharThreshold: 100,
    removeCookieWarnings: true,
    removeElementsCssSelector: "nav, footer, script, style, noscript, svg, img[src^='data:'],\n[role=\"alert\"],\n[role=\"banner\"],\n[role=\"dialog\"],\n[role=\"alertdialog\"],\n[role=\"region\"][aria-label*=\"skip\" i],\n[aria-modal=\"true\"]",
    requestTimeoutSecs: 40,
    requestTimeoutSecsMax: 300,
    serpMaxRetries: 2,
    serpMaxRetriesMax: 5,
    serpProxyGroup: 'GOOGLE_SERP',
};
