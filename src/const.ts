import inputSchema from '../.actor/input_schema.json' with { type: 'json' };

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

// Default values parsed from input_schema.json
export const defaults = {
    debugMode: inputSchema.properties.debugMode.default,
    dynamicContentWaitSecs: inputSchema.properties.dynamicContentWaitSecs.default,
    htmlTransformer: inputSchema.properties.htmlTransformer.default,
    initialConcurrency: inputSchema.properties.initialConcurrency.default,
    keepAlive: true, // Not in input_schema.json
    maxConcurrency: inputSchema.properties.maxConcurrency.default,
    maxRequestRetries: inputSchema.properties.maxRequestRetries.default,
    maxRequestRetriesMax: inputSchema.properties.maxRequestRetries.maximum,
    maxResults: inputSchema.properties.maxResults.default,
    maxResultsMax: inputSchema.properties.maxResults.maximum,
    minConcurrency: inputSchema.properties.minConcurrency.default,
    outputFormats: inputSchema.properties.outputFormats.default,
    proxyConfiguration: inputSchema.properties.proxyConfiguration.default,
    query: undefined, // No default value in input_schema.json
    readableTextCharThreshold: 100, // Not in input_schema.json
    removeCookieWarnings: inputSchema.properties.removeCookieWarnings.default,
    removeElementsCssSelector: inputSchema.properties.removeElementsCssSelector.default,
    requestTimeoutSecs: inputSchema.properties.requestTimeoutSecs.default,
    requestTimeoutSecsMax: inputSchema.properties.requestTimeoutSecs.maximum,
    serpMaxRetries: inputSchema.properties.serpMaxRetries.default,
    serpMaxRetriesMax: inputSchema.properties.serpMaxRetries.maximum,
    serpProxyGroup: inputSchema.properties.serpProxyGroup.default,
    useCheerioCrawler: inputSchema.properties.useCheerioCrawler.default,
};
