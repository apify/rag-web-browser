export enum Label {
    BROWSER = 'browser',
    HTTP = 'http',
    BINARY_TARGET = 'binary-target',
}

export enum Crawlers {
    GOOGLE_SEARCH = 'google-search',
    CONTENT_CRAWLER = 'content-crawler',
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
