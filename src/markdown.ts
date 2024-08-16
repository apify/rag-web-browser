import { log } from 'apify';
import plugin from 'joplin-turndown-plugin-gfm';
import TurndownService from 'turndown';

const turndownSettings = {
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
} as const;

const githubFlavouredHtmlToMarkdownProcessor = new TurndownService(turndownSettings);
const htmlToMarkdownProcessor = new TurndownService(turndownSettings);

githubFlavouredHtmlToMarkdownProcessor.use(plugin.gfm); // Use GitHub Flavored Markdown

/**
 * Converts HTML to markdown using Turndown (source: Website Content Crawler).
 */
export const htmlToMarkdown = (html: string | null): string | null => {
    try {
        if (!html?.length) return null;

        if (html.length <= 100000) {
            return githubFlavouredHtmlToMarkdownProcessor.turndown(html);
        }
        return htmlToMarkdownProcessor.turndown(html);
    } catch (err: unknown) {
        if (err instanceof Error) {
            log.exception(err, `Error while extracting markdown from HTML: ${err.message}`);
        } else {
            log.exception(new Error('Unknown error'), 'Error while extracting markdown from HTML');
        }
        return null;
    }
};
