import { Actor, RequestQueue, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import type { PlaywrightCrawlingContext, RequestOptions, AutoscaledPoolOptions } from 'crawlee';
import { MemoryStorage } from '@crawlee/memory-storage';
import { ServerResponse } from 'http';
import { TimeMeasure, UserData, VerboseResult, CrawlerOptions } from './types.js';
import { addResponse, sendErrorResponseById } from './responses.js';
import { router } from './router.js';
import { pushLogData } from './utils.js';
import { Label } from './const.js';

const crawlers = new Map<string, PlaywrightCrawler>();

export const DEFAULT_CRAWLER_OPTIONS: CrawlerOptions = {
    proxyConfigurationOptions: {},
};

export const createAndStartCrawler = async (crawlerOptions: CrawlerOptions = DEFAULT_CRAWLER_OPTIONS) => {
    const client = new MemoryStorage();
    const queue = await RequestQueue.open(undefined, { storageClient: client });

    const proxyConfig = await Actor.createProxyConfiguration(crawlerOptions.proxyConfigurationOptions);

    const crawler = new PlaywrightCrawler({
        keepAlive: true,
        proxyConfiguration: proxyConfig,
        maxRequestRetries: 4,
        requestQueue: queue,
        launchContext: {
            browserPerProxy: false,
        },
        statisticsOptions: {
            persistenceOptions: {
                enable: false,
            },
        },
        requestHandlerTimeoutSecs: 3600,
        sessionPoolOptions: {
            persistenceOptions: {
                enable: false,
            },
        },
        errorHandler: async ({ request }, err) => {
            const { requestDetails, timeMeasures, transparentStatusCode } = request.userData as UserData;
            timeMeasures.push({
                event: 'error',
                time: Date.now(),
            });

            requestDetails.requestErrors.push({
                attempt: request.retryCount + 1,
                errorMessage: err.message,
            });

            if (transparentStatusCode) {
                request.noRetry = true;
            }
        },
        failedRequestHandler: async ({ request, response, page }, err) => {
            const {
                requestDetails,
                jsonResponse,
                inputtedUrl,
                parsedInputtedParams,
                timeMeasures,
                transparentStatusCode,
                nonbrowserRequestStatus,
            } = request.userData as UserData;

            requestDetails.requestErrors.push({
                attempt: request.retryCount + 1,
                errorMessage: err.message,
            });

            const errorResponse = {
                errorMessage: err.message,
            };

            const responseStatusCode = request.skipNavigation ? nonbrowserRequestStatus! : (response?.status() || null);
            let statusCode = 500;
            if (transparentStatusCode && responseStatusCode) {
                statusCode = responseStatusCode;
            }
            if (jsonResponse) {
                const verboseResponse: VerboseResult = {
                    body: errorResponse,
                    cookies: await page.context().cookies(request.url) || [],
                    evaluateResults: [],
                    jsScenarioReport: {},
                    headers: requestDetails.responseHeaders || {},
                    type: 'json',
                    iframes: [],
                    xhr: [],
                    initialStatusCode: responseStatusCode,
                    resolvedUrl: '',
                    screenshot: null,
                };
                await pushLogData(timeMeasures, { inputtedUrl, parsedInputtedParams, result: verboseResponse, errors: requestDetails.requestErrors }, true);
                sendErrorResponseById(request.uniqueKey, JSON.stringify(verboseResponse), statusCode);
            } else {
                await pushLogData(timeMeasures, { inputtedUrl, parsedInputtedParams, result: errorResponse, errors: requestDetails.requestErrors }, true);
                sendErrorResponseById(request.uniqueKey, JSON.stringify(errorResponse), statusCode);
            }
        },
        preNavigationHooks: [
            async ({ request, page, blockRequests }) => {
                const { timeMeasures, blockResources, width, height, blockResourceTypes, jsonResponse, requestDetails } = request.userData as UserData;
                timeMeasures.push({
                    event: 'pre-navigation hook',
                    time: Date.now(),
                });

                await page.setViewportSize({ width, height });

                if (request.label === Label.BROWSER && blockResources) {
                    await blockRequests({
                        extraUrlPatterns: ['*.svg'],
                    });
                }

                if (request.label === Label.BROWSER && blockResourceTypes.length) {
                    await page.route('**', async (route) => {
                        if (blockResourceTypes.includes(route.request().resourceType())) {
                            await route.abort();
                        }
                    });
                }

                if (request.label === Label.BROWSER && jsonResponse) {
                    page.on('response', async (resp) => {
                        try {
                            const req = resp.request();
                            if (req.resourceType() !== 'xhr') {
                                return;
                            }

                            requestDetails.xhr.push({
                                url: req.url(),
                                statusCode: resp.status(),
                                method: req.method(),
                                requestHeaders: req.headers(),
                                headers: resp.headers(),
                                body: (await resp.body()).toString(),
                            });
                        } catch (e) {
                            log.warning((e as Error).message);
                        }
                    });
                }
            },
        ],
        requestHandler: router,
    });

    // TODO: This is just for Crawlee perf measurement, remove it once we properly understand the bottlenecks
    // @ts-expect-error Overriding internal method
    const origRunTaskFunction = crawler.autoscaledPoolOptions.runTaskFunction.bind(crawler);
    // @ts-expect-error Overriding internal method
    crawler.autoscaledPoolOptions.runTaskFunction = async function () {
        // This code runs before we pull request from queue so we have to approximate that by having mutable global
        // It will ofc be wrong if someone bombs requests with interval shorter than 1 sec
        (global as unknown as { latestRequestTaskTimeMeasure: TimeMeasure }).latestRequestTaskTimeMeasure = {
            event: 'crawlee internal run task',
            time: Date.now(),
        };
        await (origRunTaskFunction as AutoscaledPoolOptions['runTaskFunction'])!();
    };

    // @ts-expect-error Overriding internal method
    const origRunRequestHandler = crawler._runRequestHandler.bind(crawler);
    // @ts-expect-error Overriding internal method
    crawler._runRequestHandler = async function (context: PlaywrightCrawlingContext<UserData>) {
        context.request.userData.timeMeasures.push({
            event: 'crawlee internal request handler',
            time: Date.now(),
        });
        await origRunRequestHandler(context);
    };

    await crawler.stats.stopCapturing();
    crawler.run().then(() => log.warning(`Crawler ended`, crawlerOptions), () => { });
    crawlers.set(JSON.stringify(crawlerOptions), crawler);
    log.info('Crawler ready 🫡', crawlerOptions);
    return crawler;
};

export const addRequest = async (request: RequestOptions<UserData>, res: ServerResponse, crawlerOptions: CrawlerOptions) => {
    const key = JSON.stringify(crawlerOptions);
    const crawler = crawlers.has(key) ? crawlers.get(key)! : await createAndStartCrawler(crawlerOptions);

    addResponse(request.uniqueKey!, res);

    request.userData?.timeMeasures.push({
        event: 'before queue add',
        time: Date.now(),
    });
    await crawler.requestQueue!.addRequest(request);
};
