export enum QueryParams {
    q = 'q',
    url = 'url',
}

export enum ScrapingBee {
    // skipped for now: session_id, block_ads
    url = 'url',
    extractRules = 'extract_rules',
    device = 'device',
    jsScenario = 'js_scenario',
    renderJs = 'render_js',
    wait = 'wait',
    waitFor = 'wait_for',
    waitBrowser = 'wait_browser',
    screenshot = 'screenshot',
    screenshotFullPage = 'screenshot_full_page',
    screenshotSelector = 'screenshot_selector',
    windowWidth = 'window_width',
    windowHeight = 'window_height',
    returnPageSource = 'return_page_source',
    transparentStatusCode = 'transparent_status_code',
    forwardHeaders = 'forward_headers',
    forwardHeadersPure = 'forward_headers_pure',
    cookies = 'cookies',
    timeout = 'timeout',
    customGoogle = 'custom_google',
    ownProxy = 'own_proxy',
    premiumProxy = 'premium_proxy',
    stealthProxy = 'stealth_proxy',
    countryCode = 'country_code',
    jsonResponse = 'json_response',
    blockResources = 'block_resources'
}

export enum ScrapingAnt {
    // we already have: url, return_page_source, cookies
    browser = 'browser',
    jsSnippet = 'js_snippet',
    proxyType = 'proxy_type',
    waitForSelector = 'wait_for_selector',
    blockResource = 'block_resource',
    proxyCountry = 'proxy_country',
}

export enum ScraperApi {
    // we already have: wait_for_selector, country_code
    // skipped for now: session_number, autoparse
    render = 'render',
    premium = 'premium',
    binaryTarget = 'binary_target',
    keepHeaders = 'keep_headers',
    deviceType = 'device_type',
    ultraPremium = 'ultra_premium',
}

export const EquivalentParameters = {
    [ScrapingBee.device]: [ScrapingBee.device, ScraperApi.deviceType],
    [ScrapingBee.renderJs]: [ScrapingAnt.browser, ScraperApi.render],
    [ScrapingBee.waitFor]: [ScrapingAnt.waitForSelector],
    [ScrapingBee.premiumProxy]: [ScrapingBee.stealthProxy, ScraperApi.premium, ScraperApi.ultraPremium],
    [ScrapingBee.countryCode]: [ScrapingAnt.proxyCountry],
};
