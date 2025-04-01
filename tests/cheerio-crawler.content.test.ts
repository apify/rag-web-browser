import { MemoryStorage } from '@crawlee/memory-storage';
import { RequestQueue } from 'apify';
import { CheerioCrawler, Configuration, log, type CheerioCrawlingContext } from 'crawlee';
import type { Server } from 'node:http';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

import { startTestServer, stopTestServer } from './helpers/server';
import { requestHandlerCheerio } from '../src/request-handler';
import type { ContentCrawlerUserData } from '../src/types';
import { createRequest } from '../src/utils';

describe('Cheerio Crawler Content Tests', () => {
    let testServer: Server;
    const testServerPort = 3040;
    const baseUrl = `http://localhost:${testServerPort}`;

    // Start the test server before all tests
    beforeAll(async () => {
        testServer = startTestServer(testServerPort);
    });

    // Stop the test server after all tests
    afterAll(async () => {
        await stopTestServer(testServer);
    });

    it('test basic content extraction with cheerio', async () => {
        const failedUrls = new Set<string>();
        const successUrls = new Set<string>();

        // Create memory storage and request queue
        const client = new MemoryStorage({ persistStorage: false });
        const requestQueue = await RequestQueue.open('test-queue', { storageClient: client });

        const crawler = new CheerioCrawler({
            requestQueue,
            requestHandler: async (context: CheerioCrawlingContext<ContentCrawlerUserData>) => {
                const pushDataSpy = vi.spyOn(context, 'pushData').mockResolvedValue(undefined);
                await requestHandlerCheerio(context);

                expect(pushDataSpy).toHaveBeenCalledTimes(1);
                expect(pushDataSpy).toHaveBeenCalledWith(expect.objectContaining({
                    text: expect.stringContaining('hello world')
                }));
                successUrls.add(context.request.url);
            },
            failedRequestHandler: async ({ request }, error) => {
                log.error(`Request ${request.url} failed with error: ${error.message}`);
                failedUrls.add(request.url);
            },
        }, new Configuration({
            persistStorage: false,
        }));

        const r = createRequest(
            'query',
            {
                url: `${baseUrl}/basic`,
                description: 'Test request',
                rank: 1,
                title: 'Test title',
            },
            'responseId',
            {
                debugMode: false,
                outputFormats: ['text'],
                readableTextCharThreshold: 50,
                maxHtmlCharsToProcess: 100000,
                dynamicContentWaitSecs: 20,
            },
            [],
        );

        // Add initial request to the queue
        await requestQueue.addRequest(r);

        await crawler.run();

        expect(failedUrls.size).toBe(0);
        expect(successUrls.size).toBe(1);
    });
});
