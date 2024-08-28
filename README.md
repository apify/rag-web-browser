## Google Search Data Extractor

This Actor retrieves website content from the top Google Search Results Pages (SERPs).
Given a search query, it fetches the first page of Google search results, then crawls the top sites to extract text content.
It is capable of extracting content from JavaScript-enabled websites and can bypass anti-scraping protections.
The extracted web content is saved as plain text or markdown.
This Actor is ideal for adding up-to-date Google search knowledge to your LLM applications.

This Actor is a combination of a two more powerful Apify actors:
- [Google Search Results Scraper](https://apify.com/apify/google-search-scraper)
- [Website Content Crawler](https://apify.com/apify/website-content-crawler)

#### Looking to scrape Google Search Results?
- Check out the [Google Search Results Scraper](https://apify.com/apify/google-search-scraper) actor.

#### Need to extract content from a list of URLs?
- Explore the the [Website Content Crawler](https://apify.com/apify/website-content-crawler) actor.

Browsing Tool
- https://community.openai.com/t/new-assistants-browse-with-bing-ability/479383/27

### Run STANDBY mode using apify-cli for development
```bash
APIFY_META_ORIGIN=STANDBY apify run -p
```
