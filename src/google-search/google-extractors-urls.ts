import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';

import type { OrganicResult } from '../types.js';

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
            if (result.title && result.url) {
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
    if (areTheResultsSuggestions($)) {
        return deduplicatedResults.map((result) => ({
            ...result,
            resultType: 'SUGGESTED',
        }));
    }
    return deduplicatedResults.map((result) => ({
        ...result,
        resultType: 'ORGANIC',
    }));
};
