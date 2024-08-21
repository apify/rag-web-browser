import type { ParsedUrlQuery } from 'querystring';
import { parse } from 'querystring';
import type { IncomingMessage } from 'http';
import { RequestOptions } from 'crawlee';
import { v4 as uuidv4 } from 'uuid';
import { HeaderGenerator } from 'header-generator';
import { Actor, ProxyConfigurationOptions, log } from 'apify';
import {TimeMeasure, JsScenario, RequestDetails, ScreenshotSettings, UserData, Input} from './types.js';
import {EquivalentParameters, ScrapingBee, ScraperApi, ScrapingAnt, QueryParams} from './params.js';
import { UserInputError } from './errors.js';
// import { validateAndTransformExtractRules } from './extract_rules_utils.js';
// import { parseAndValidateInstructions } from './instructions_utils.js';
import { Label, VALID_RESOURCES } from './const.js';

const transformTimeMeasuresToRelative = (timeMeasures: TimeMeasure[]): TimeMeasure[] => {
    const firstMeasure = timeMeasures[0].time;
    return timeMeasures.map((measure) => {
        return {
            event: measure.event,
            time: measure.time - firstMeasure,
        };
    }).sort((a, b) => a.time - b.time);
};

export async function pushLogData(timeMeasures: TimeMeasure[], data: Record<string, unknown>, failed = false) {
    timeMeasures.push({
        event: failed ? 'failed request' : 'handler end',
        time: Date.now(),
    });
    const relativeMeasures = transformTimeMeasuresToRelative(timeMeasures);
    log.info(`Response sent (${relativeMeasures.at(-1)?.time} ms) ${data.inputtedUrl}`, { ...relativeMeasures });
    await Actor.pushData({
        ...data,
        measures: relativeMeasures,
    });
}

const isValidResourceType = (resource: string) => {
    return VALID_RESOURCES.includes(resource);
};

function mapEquivalentParams(params: ParsedUrlQuery) {
    for (const [ScrapingBeeParam, EquivalentParams] of Object.entries(EquivalentParameters)) {
        if (params[ScrapingBeeParam]) {
            continue;
        }
        for (const eqParam of EquivalentParams) {
            if (params[eqParam]) {
                params[ScrapingBeeParam] = params[eqParam];
                continue;
            }
        }
    }
    return params;
}

export function parseParameters(url: string) {
    return parse(url.slice(2));
}

function generateHeaders(device: 'mobile' | 'desktop') {
    const headerGenerator = new HeaderGenerator({
        devices: [device],
    });
    const generatedHeaders = headerGenerator.getHeaders();
    // remove 'te' header as it is causing page.goto: net::ERR_INVALID_ARGUMENT error
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { te, ...rest } = generatedHeaders;
    return rest;
}

export function createRequestForCrawler(queries: string, maxResults: number): RequestOptions<UserData> {
    const urlSearch = `http://www.google.com/search?q=${queries}&num=${maxResults}`;
    return { url: urlSearch, uniqueKey: uuidv4()};
}

export function createRequest(url: string, responseId: string): RequestOptions<UserData> {
    return {
        url,
        uniqueKey: uuidv4(),
        userData: {
            responseId,
        },
    };
}
