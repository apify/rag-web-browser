import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';

import type { OrganicResult, SearchResultType } from '../types.js';

/**
 * Validates if a URL is a valid absolute URL (starts with http/https or is a valid relative URL).
 * Filters out Google's internal search URLs and other invalid URLs.
 *
 * Why this validation is needed:
 * - Google SERP results sometimes contain internal links like "/search?q=..." which are not valid URLs to crawl
 * - Some results may have malformed or incomplete URLs extracted from the HTML
 * - Without validation, invalid URLs cause errors when trying to crawl them and fail the content crawl request
 * - This ensures only legitimate external URLs are queued for content extraction
 */
function isValidUrl(url: string): boolean {
    if (!url || typeof url !== 'string') {
        return false;
    }

    // Reject Google's internal search URLs (relative URLs starting with /search)
    if (url.startsWith('/search')) {
        return false;
    }

    // Check if it's a valid HTTP/HTTPS URL
    try {
        const urlObj = new URL(url, 'http://example.com'); // Use base URL for relative URL handling
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Deduplicates search results based on their title and URL (source @apify/google-search).
 */
export const deduplicateResults = <T extends { title?: string; url?: string }>(results: T[]): T[] => {
    const deduplicatedResults = [];
    const resultHashes = new Set();
    for (const result of results) {
        // date defaults to now so it is not stable
        const hash = JSON.stringify({ title: result.title, url: result.url });
        if (!resultHashes.has(hash)) {
            deduplicatedResults.push(result);
            resultHashes.add(hash);
        }
    }
    return deduplicatedResults;
};

/**
 * Parses a single organic search result (source: @apify/google-search).
 */
const parseResult = ($: CheerioAPI, el: Element) => {
    $(el).find('div.action-menu').remove();

    const descriptionSelector = '.VwiC3b';
    const searchResult: OrganicResult = {
        title: $(el).find('h3').first().text() || '',
        description: ($(el).find(descriptionSelector).text() || '').trim(),
        url: $(el).find('a').first().attr('href') || '',
    };

    return searchResult;
};

/**
 * Extracts search results from the given selectors (source: @apify/google-search).
 */
const extractResultsFromSelectors = ($: CheerioAPI, selectors: string[]) => {
    const searchResults: OrganicResult[] = [];
    const selector = selectors.join(', ');
    for (const resultEl of $(selector)) {
        const results = $(resultEl).map((_i, el) => parseResult($, el as Element)).toArray();
        for (const result of results) {
            // Only include results with both title and a valid URL
            // URL validation filters out Google's internal search links and malformed URLs
            // that would cause errors during content crawling
            if (result.title && result.url && isValidUrl(result.url)) {
                searchResults.push(result);
            }
        }
    }
    return searchResults;
};

/**
 * If true, the results are not inherent to the given query, but to a similar suggested query
 */
const areTheResultsSuggestions = ($: CheerioAPI) => {
    // Check if the message "No results found" is shown
    return $('div#topstuff > div.fSp71d').children().length > 0;
};

/**
 * Extracts organic search results from the given Cheerio instance (source: @apify/google-search).
 */
export const scrapeOrganicResults = ($: CheerioAPI): OrganicResult[] => {
    const resultSelectors2023January = [
        '.hlcw0c', // Top result with site links
        '.g.Ww4FFb', // General search results
        '.MjjYud', // General search results 2025 March, this includes also images so we need to add a check that results has both title and url
        '.g .tF2Cxc>.yuRUbf', // old search selector 2021 January
        '.g [data-header-feature="0"]', // old search selector 2022 January
        '.g .rc', // very old selector
        '.sATSHe', // another new selector in March 2025
    ];

    const searchResults = extractResultsFromSelectors($, resultSelectors2023January);
    const deduplicatedResults = deduplicateResults(searchResults);
    let resultType: SearchResultType = 'ORGANIC';
    if (areTheResultsSuggestions($)) {
        resultType = 'SUGGESTED';
    }
    return deduplicatedResults.map((result) => ({
        ...result,
        resultType,
    }));
};
