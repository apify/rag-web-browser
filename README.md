## RAG Web Browser

This Actor retrieves website content from the top Google Search Results Pages (SERPs).
Given a search query, it fetches the top Google search result URLs and then follows each URL to extract the text content from the targeted websites.

The RAG Web Browser is designed for Large Language Model (LLM) applications or LLM agents to provide up-to-date Google search knowledge.

**Main features**:
- Searches Google and extracts the top Organic results.
- Follows the top URLs to scrape HTML and extract website text, excluding navigation, ads, banners, etc.
- Capable of extracting content from JavaScript-enabled websites and bypassing anti-scraping protections.
- Output formats include plain text, markdown, and HTML.

This Actor is a combination of a two specialized actors:
- [Google Search Results Scraper](https://apify.com/apify/google-search-scraper)
- [Website Content Crawler](https://apify.com/apify/website-content-crawler)

### Fast responses using the [Standby] mode

This Actor can be run in both normal and standby modes.

The normal mode is useful for testing and development.
However, there is some overhead when the Actor is starting, which can result in slower response times.
In contrast, the standby mode allows you to start the Actor and keep it running - retrieving the results with lower latency.

#### How to start the Actor in Standby mode?

Provide instructions here

## API parameters

When running in the standby mode the RAG Web Browser accept the following query parameters:

| parameter            | description                                                                                        |
|----------------------|----------------------------------------------------------------------------------------------------|
| `quety`              | Search term(s)                                                                                     |
| `maxResults`         | Number of top search results to return from Google. Only organic results are returned and counted  |
| `outputFormats`      | Select what out formats you want to return ["markdown", "html"] (text is return always)            |
| `requestTimeoutSecs` | Timeout (in seconds) for making the search request and processing its response                     |

### Output

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

# Open question:

Response object - should we create an envelope object for the response?
```json
{
    "statusCode": 200,
    "message": "Finished",
    "results": [
        {
            "text": "Content",
            "crawl": {
                "httpStatus": 200,
                "requestStatus": "handled"
            },
            "metadata": {
                "url": "https://example.com",
                "title": "Example"
            }
        },
        {
            "text": "",
            "crawl": {
                "httpStatus": 500,
                "requestStatus": "failed"
            },
            "metadata": {
                "url": "https://example.com"
            }
        }
    ]
}
```

*Current limitations*:
It is not supported to run actor in a standby mode and change configuration using
query parameters.
