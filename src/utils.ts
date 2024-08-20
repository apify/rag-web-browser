import type { ParsedUrlQuery } from 'querystring';
import { parse } from 'querystring';
import type { IncomingMessage } from 'http';
import { RequestOptions } from 'crawlee';
import { v4 as uuidv4 } from 'uuid';
import { HeaderGenerator } from 'header-generator';
import { Actor, ProxyConfigurationOptions, log } from 'apify';
import { TimeMeasure, JsScenario, RequestDetails, ScreenshotSettings, UserData } from './types.js';
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

export function createRequestForCrawler(params: ParsedUrlQuery): RequestOptions<UserData> {
    // const generatedHeaders = generateHeaders('desktop');
    const urlSearch = `http://www.google.com/search?q=${params[QueryParams.q]}&num=5`;
    return {
        url: urlSearch,
        uniqueKey: uuidv4(),
        // headers: {
        //     ...generatedHeaders,
        // },
    };
    // const renderJs = true;
    // finalRequest.label = renderJs ? Label.BROWSER : Label.HTTP;
    // return finalRequest;
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

export function createProxyOptions(params: ParsedUrlQuery) {
    const proxyOptions: ProxyConfigurationOptions = {};

    const proxyType = params[ScrapingAnt.proxyType] as string || 'datacenter';
    if (proxyType !== 'datacenter' && proxyType !== 'residential') {
        throw new UserInputError('Parameter proxy_type can be either residential or datacenter');
    }

    const useGoogleProxy = params[ScrapingBee.customGoogle] === 'true';
    const url = new URL(params[ScrapingBee.url] as string);
    if (url.host.includes('google') && !useGoogleProxy) {
        throw new UserInputError('Set param custom_google to true to scrape Google urls');
    }
    if (useGoogleProxy) {
        proxyOptions.groups = ['GOOGLE_SERP'];
        return proxyOptions;
    }

    if (params[ScrapingBee.ownProxy]) {
        proxyOptions.proxyUrls = [params[ScrapingBee.ownProxy] as string];
        return proxyOptions;
    }

    const usePremium = params[ScrapingBee.premiumProxy] === 'true' || proxyType === 'residential';
    if (usePremium) {
        proxyOptions.groups = ['RESIDENTIAL'];
    }

    if (params[ScrapingBee.countryCode]) {
        const countryCode = (params[ScrapingBee.countryCode] as string).toUpperCase();
        if (countryCode.length !== 2) {
            throw new UserInputError('Parameter for country code must be a string of length 2');
        }
        if (!usePremium && countryCode !== 'US') {
            throw new UserInputError('Parameter for country code must be used with premium proxies when using non-US country');
        }
        proxyOptions.countryCode = countryCode;
    }
    return proxyOptions;
}
