import { createPlaywrightRouter } from 'crawlee';
import { CheerioAPI, load } from 'cheerio';
import { Label } from './const.js';
import { FullJsScenarioReport, IFrameData, TimeMeasure, UserData, VerboseResult } from './types.js';
import { performInstructionsAndGenerateReport } from './instructions_utils.js';
import { sendSuccResponseById } from './responses.js';
import { scrapeBasedOnExtractRules } from './extract_rules_utils.js';
import { pushLogData } from './utils.js';

export const router = createPlaywrightRouter();

router.addHandler<UserData>(Label.BROWSER, async ({ request, page, response, parseWithCheerio }) => {
    const {
        requestDetails,
        jsonResponse,
        extractRules,
        screenshotSettings,
        inputtedUrl,
        parsedInputtedParams,
        timeMeasures,
        jsScenario,
        returnPageSource,
    } = request.userData;

    // See comment in crawler.autoscaledPoolOptions.runTaskFunction override
    timeMeasures.push((global as unknown as { latestRequestTaskTimeMeasure: TimeMeasure }).latestRequestTaskTimeMeasure);

    const responseId = request.uniqueKey;

    timeMeasures.push({
        event: 'page loaded',
        time: Date.now(),
    });

    const jsScenarioReportFull: FullJsScenarioReport = {};
    if (jsScenario.instructions.length) {
        const { jsScenarioReport, evaluateResults } = await performInstructionsAndGenerateReport(jsScenario, page);
        jsScenarioReportFull.jsScenarioReport = jsScenarioReport;
        jsScenarioReportFull.evaluateResults = evaluateResults;
    }

    requestDetails.resolvedUrl = response?.url() || '';
    requestDetails.responseHeaders = response?.headers() || {};
    const $ = await parseWithCheerio();
    const statusCode = response?.status() || null;

    const cookies = await page.context().cookies(request.url) || [];

    const iframes: IFrameData[] = [];
    if (jsonResponse) {
        const frames = page.frames();
        for (const frame of frames) {
            let frameEl;
            try {
                frameEl = await frame.frameElement();
            } catch (e) {
                continue;
            }

            const src = await frameEl.getAttribute('src') || '';
            const content = await frame.content();

            iframes.push({
                src,
                content,
            });
        }
    }

    let screenshot = null;
    if (screenshotSettings.screenshotType !== 'none') {
        const { screenshotType, selector } = screenshotSettings;
        let screenshotBuffer: Buffer;
        if (screenshotType === 'full') {
            screenshotBuffer = await page.screenshot({ fullPage: true });
        } else if (screenshotType === 'window') {
            screenshotBuffer = await page.screenshot();
        } else {
            screenshotBuffer = await page.locator(selector as string).screenshot();
        }
        screenshot = screenshotBuffer.toString('base64');

        if (!jsonResponse) {
            await pushLogData(timeMeasures, { inputtedUrl, parsedInputtedParams, result: screenshot, errors: requestDetails.requestErrors });
            sendSuccResponseById(responseId, screenshotBuffer, 'image/png');
            return;
        }
    }

    if (extractRules) {
        const resultFromExtractRules = scrapeBasedOnExtractRules($ as CheerioAPI, extractRules);
        if (jsonResponse) {
            const verboseResponse: VerboseResult = {
                body: resultFromExtractRules,
                cookies,
                evaluateResults: jsScenarioReportFull.evaluateResults || [],
                jsScenarioReport: jsScenarioReportFull.jsScenarioReport || {},
                headers: requestDetails.responseHeaders,
                type: 'json',
                iframes,
                xhr: requestDetails.xhr,
                initialStatusCode: statusCode,
                resolvedUrl: requestDetails.resolvedUrl,
                screenshot,
            };
            await pushLogData(timeMeasures, { inputtedUrl, parsedInputtedParams, result: verboseResponse, errors: requestDetails.requestErrors });
            sendSuccResponseById(responseId, JSON.stringify(verboseResponse), 'application/json');
        } else {
            await pushLogData(timeMeasures, { inputtedUrl, parsedInputtedParams, result: resultFromExtractRules, errors: requestDetails.requestErrors });
            sendSuccResponseById(responseId, JSON.stringify(resultFromExtractRules), 'application/json');
        }
        return;
    }

    // response.body() contains HTML of the page before js rendering
    const htmlResult = returnPageSource
        ? (await response?.body())?.toString() as string
        : $.html();

    if (jsonResponse) {
        const verboseResponse: VerboseResult = {
            body: htmlResult,
            cookies,
            evaluateResults: jsScenarioReportFull.evaluateResults || [],
            jsScenarioReport: jsScenarioReportFull.jsScenarioReport || {},
            headers: requestDetails.responseHeaders,
            type: 'html',
            iframes,
            xhr: requestDetails.xhr,
            initialStatusCode: statusCode,
            resolvedUrl: requestDetails.resolvedUrl,
            screenshot,
        };
        await pushLogData(timeMeasures, { inputtedUrl, parsedInputtedParams, result: verboseResponse, errors: requestDetails.requestErrors });
        sendSuccResponseById(responseId, JSON.stringify(verboseResponse), 'application/json');
        return;
    }
    await pushLogData(timeMeasures, { inputtedUrl, parsedInputtedParams, result: htmlResult, errors: requestDetails.requestErrors });
    sendSuccResponseById(responseId, htmlResult, 'text/html');
});

router.addHandler<UserData>(Label.HTTP, async ({ request, sendRequest }) => {
    const {
        requestDetails,
        jsonResponse,
        extractRules,
        inputtedUrl,
        parsedInputtedParams,
        timeMeasures,
    } = request.userData as UserData;

    // See comment in crawler.autoscaledPoolOptions.runTaskFunction override
    timeMeasures.push((global as unknown as { latestRequestTaskTimeMeasure: TimeMeasure }).latestRequestTaskTimeMeasure);

    const responseId = request.uniqueKey;

    const resp = await sendRequest({
        url: request.url,
        throwHttpErrors: false,
        headers: request.headers,
    });

    timeMeasures.push({
        event: 'page loaded',
        time: Date.now(),
    });

    const { statusCode } = resp;
    if (resp.statusCode >= 300 && resp.statusCode !== 404) {
        (request.userData as UserData).nonbrowserRequestStatus = resp.statusCode;
        throw new Error(`HTTPError: Response code ${resp.statusCode}`);
    }

    requestDetails.resolvedUrl = resp.url;
    requestDetails.responseHeaders = resp.headers as Record<string, string | string[]>;

    if (extractRules) {
        const $ = load(resp.body);
        const resultFromExtractRules = scrapeBasedOnExtractRules($, extractRules);
        if (jsonResponse) {
            const verboseResponse: VerboseResult = {
                body: resultFromExtractRules,
                cookies: [],
                evaluateResults: [],
                jsScenarioReport: {},
                headers: requestDetails.responseHeaders,
                type: 'json',
                iframes: [],
                xhr: [],
                initialStatusCode: statusCode,
                resolvedUrl: requestDetails.resolvedUrl,
                screenshot: null,
            };
            await pushLogData(timeMeasures, { inputtedUrl, parsedInputtedParams, result: verboseResponse, errors: requestDetails.requestErrors });
            sendSuccResponseById(responseId, JSON.stringify(verboseResponse), 'application/json');
        } else {
            await pushLogData(timeMeasures, { inputtedUrl, parsedInputtedParams, result: resultFromExtractRules, errors: requestDetails.requestErrors });
            sendSuccResponseById(responseId, JSON.stringify(resultFromExtractRules), 'application/json');
        }
        return;
    }

    const htmlResult = resp.body;
    if (jsonResponse) {
        const verboseResponse: VerboseResult = {
            body: htmlResult,
            cookies: [],
            evaluateResults: [],
            jsScenarioReport: {},
            headers: requestDetails.responseHeaders,
            type: 'html',
            iframes: [],
            xhr: [],
            initialStatusCode: statusCode,
            resolvedUrl: requestDetails.resolvedUrl,
            screenshot: null,
        };
        await pushLogData(timeMeasures, { inputtedUrl, parsedInputtedParams, result: verboseResponse, errors: requestDetails.requestErrors });
        sendSuccResponseById(responseId, JSON.stringify(verboseResponse), 'application/json');
        return;
    }
    await pushLogData(timeMeasures, { inputtedUrl, parsedInputtedParams, result: htmlResult, errors: requestDetails.requestErrors });
    sendSuccResponseById(responseId, htmlResult, 'text/html');
});

router.addHandler<UserData>(Label.BINARY_TARGET, async ({ request, sendRequest }) => {
    const {
        requestDetails,
        jsonResponse,
        inputtedUrl,
        parsedInputtedParams,
        timeMeasures,
    } = request.userData as UserData;

    // See comment in crawler.autoscaledPoolOptions.runTaskFunction override
    timeMeasures.push((global as unknown as { latestRequestTaskTimeMeasure: TimeMeasure }).latestRequestTaskTimeMeasure);

    const responseId = request.uniqueKey;

    const resp = await sendRequest({
        url: request.url,
        throwHttpErrors: false,
        headers: request.headers,
    });

    timeMeasures.push({
        event: 'page loaded',
        time: Date.now(),
    });

    const { statusCode } = resp;
    if (resp.statusCode >= 300 && resp.statusCode !== 404) {
        (request.userData as UserData).nonbrowserRequestStatus = resp.statusCode;
        throw new Error(`HTTPError: Response code ${resp.statusCode}`);
    }

    requestDetails.resolvedUrl = resp.url;
    requestDetails.responseHeaders = resp.headers as Record<string, string | string[]>;
    const result = resp.rawBody;
    const contentType = resp.headers['content-type'];
    if (!contentType) {
        throw new Error(`No content-type returned in the response`);
    }

    if (jsonResponse) {
        const verboseResponse: VerboseResult = {
            body: result.toString(),
            cookies: [],
            evaluateResults: [],
            jsScenarioReport: {},
            headers: requestDetails.responseHeaders,
            type: 'file',
            iframes: [],
            xhr: [],
            initialStatusCode: statusCode,
            resolvedUrl: requestDetails.resolvedUrl,
            screenshot: null,
        };
        await pushLogData(timeMeasures, { inputtedUrl, parsedInputtedParams, result: verboseResponse, errors: requestDetails.requestErrors });
        sendSuccResponseById(responseId, JSON.stringify(verboseResponse), 'application/json');
        return;
    }

    await pushLogData(timeMeasures, { inputtedUrl, parsedInputtedParams, result, errors: requestDetails.requestErrors });
    sendSuccResponseById(responseId, result, contentType);
});
