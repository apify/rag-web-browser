export enum CrawlerType {
    CHEERIO_GOOGLE_SEARCH_CRAWLER = 'cheerio-google-search-crawler',
    PLAYWRIGHT_CONTENT_CRAWLER = 'playwright-content-crawler',
}

export enum CrawlerQueueName {
    CHEERIO_SEARCH_QUEUE = 'cheerio-search-queue',
    PLAYWRIGHT_CONTENT_CRAWL_QUEUE = 'playwright-content-crawl-queue',
}

export enum ContentCrawlerStatus {
    PENDING = 'pending',
    HANDLED = 'handled',
    FAILED = 'failed',
}
