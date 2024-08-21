export enum Label {
    BROWSER = 'browser',
    HTTP = 'http',
    BINARY_TARGET = 'binary-target',
}

export enum Crawlers {
    CHEERIO_GOOGLE_SEARCH_CRAWLER = 'cheerio-google-search-crawler',
    PLAYWRIGHT_CONTENT_CRAWLER = 'playwright-content-crawler',
}

export const VALID_RESOURCES = [
    'document',
    'stylesheet',
    'image',
    'media',
    'font',
    'script',
    'texttrack',
    'xhr',
    'fetch',
    'eventsource',
    'websocket',
    'manifest',
    'other',
];
