import { Actor } from 'apify';
import type { CheerioAPI } from 'cheerio';
import {
    CheerioCrawler,
    CheerioCrawlingContext,
    PlaywrightCrawler,
    log,
    PlaywrightCrawlingContext,
    PlaywrightCrawlerOptions,
} from 'crawlee';

import { scrapeOrganicResults } from './google-extractors-urls.js';
import { processInput } from './input.js';
import { genericHandler } from './request-handlers';
import { Input, UserData } from './types.js';

await Actor.init();

try {
    let searchUrls: string[] = [];
    log.setLevel(log.LEVELS.INFO);

    const proxyConfiguration = await Actor.createProxyConfiguration({
        groups: ['GOOGLE_SERP'],
    });

    const processedInput = await processInput((await Actor.getInput<Partial<Input>>()) ?? ({} as Input));

    /**
     * Create a CheerioCrawler to scrape organic search results from Google.
     */
    const crawler = new CheerioCrawler({
        proxyConfiguration,
        requestHandler: async ({ request, $: _$ }: CheerioCrawlingContext<UserData>) => {
            // NOTE: we need to cast this to fix `cheerio` type errors
            const $ = _$ as CheerioAPI;

            log.info(`Processing organic search results: ${request.url}`);
            const organicResults = scrapeOrganicResults($);

            searchUrls = organicResults.map((result) => result.url).filter((url): url is string => url !== undefined);
            // limit the number of search results to the maxResults
            searchUrls = searchUrls.slice(0, processedInput.input.maxResults);

            log.info(`Extracted ${searchUrls.length} URLs: \n${searchUrls.join('\n')}`);
        },
    });

    // increase the number of search results to be sure we get enough results as there are some duplicates
    const maxSearchResults = processedInput.input.maxResults + 5;

    const url = `http://www.google.com/search?q=${processedInput.input.queries}&num=${maxSearchResults}`;
    await crawler.run([url]);

    const crawlerOptions: PlaywrightCrawlerOptions = {
        ...(processedInput.crawlerOptions as PlaywrightCrawlerOptions),
        minConcurrency: Math.min(searchUrls.length, processedInput.input.minConcurrency),
        // +1 is required only when length of searchUrls is 0
        maxConcurrency: Math.min(searchUrls.length + 1, processedInput.input.maxConcurrency),
    };

    log.info(`Crawl options: ${JSON.stringify(crawlerOptions)}`);

    const crawlerContent = new PlaywrightCrawler({
        requestHandler: (context: PlaywrightCrawlingContext) => genericHandler(context, processedInput.scraperSettings),
        ...crawlerOptions,
    });

    if (searchUrls.length === 0) {
        await Actor.fail('No search results found');
    }

    log.info(`Crawl ${searchUrls.length} URLs: \n${searchUrls}`);
    await crawlerContent.run(searchUrls);
} catch (e) {
    await Actor.fail((e as Error).message);
}

await Actor.exit();
