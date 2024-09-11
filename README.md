# 🌐 RAG Web Browser

This Actor retrieves website content from the top Google Search Results Pages (SERPs).
Given a search query, it fetches the top Google search result URLs and then follows each URL to extract the text content from the targeted websites.

The RAG Web Browser is designed for Large Language Model (LLM) applications or LLM agents to provide up-to-date Google search knowledge.

**🚀 Main features**:
- Searches Google and extracts the top Organic results.
- Follows the top URLs to scrape HTML and extract website text, excluding navigation, ads, banners, etc.
- Capable of extracting content from JavaScript-enabled websites and bypassing anti-scraping protections.
- Output formats include plain text, markdown, and HTML.

This Actor is a combination of a two specialized actors:
- Are you looking to scrape Google Search Results? Check out the [Google Search Results Scraper](https://apify.com/apify/google-search-scraper) actor.
- Do you need extract content from a list of URLs? Explore the [Website Content Crawler](https://apify.com/apify/website-content-crawler) actor.

## 🏎️ Fast responses using the Standby mode

This Actor can be run in both normal and [standby modes](https://docs.apify.com/platform/actors/running/standby).
Normal mode is useful for testing and running in ad-hoc settings, but it comes with some overhead due to the Actor's initial startup time.

For optimal performance, it is recommended to run the Actor in Standby mode.
This allows the Actor to stay active, enabling it to retrieve results with lower latency.

*Limitations*: Running the Actor in Standby mode does not support changing crawling and scraping configurations using query parameters.
Supporting this would require the following:
- Creating crawlers on the fly, which would introduce an overhead of 1-2 seconds and potentially result in a large number of crawlers.
- Setting up a new queue for each crawler to ensure that requests are properly handled by the corresponding crawler.
- Implementing this will require some refactoring. The simplest approach is to create a new key that combines both crawlers, and then create a named queue and crawler based on this key.
  `const key = JSON.stringify(cheerioCrawlerOptions) + JSON.stringify(playwrightCrawlerOptions) + JSON.stringify(playwrightScraperSettings);`

### 🔥 How to start the Actor in a Standby mode?

You need the Actor's standby URL and `APIFY_API_TOKEN`.
Then, you can send requests to the `/search` path along with your `query` and the number of results (`maxResults`) you want to retrieve.

```shell
curl -X GET https://jiri-spilka--rag-web-browser.apify.actor/search?token=APIFY_API_TOKEN?query=apify&maxResults=1
```

Here’s an example of the server response (truncated for brevity):
```json
[
  {
    "crawl": {
      "httpStatusCode": 200,
      "loadedAt": "2024-09-02T08:44:41.750Z",
      "uniqueKey": "3e8452bb-c703-44af-9590-bd5257902378",
      "requestStatus": "handled"
    },
    "googleSearchResult": {
      "url": "https://apify.com/",
      "title": "Apify: Full-stack web scraping and data extraction platform",
      "description": "Cloud platform for web scraping, browser automation, and data for AI...."
    },
    "metadata": {
      "author": null,
      "title": "Apify: Full-stack web scraping and data extraction platform",
      "description": "Cloud platform for web scraping, browser automation, and data for AI....",
      "keywords": "web scraper,web crawler,scraping,data extraction,API",
      "languageCode": "en",
      "url": "https://apify.com/"
    },
    "text": "Full-stack web scraping and data extraction platform..."
  }
]
```

The Standby mode has several configuration parameters, such as Max Requests per Run, Memory, and Idle Timeout.
You can find the details in the [Standby Mode documentation](https://docs.apify.com/platform/actors/running/standby#how-do-i-customize-standby-configuration).

### 📧 API parameters

When running in the standby mode the RAG Web Browser accept the following query parameters:

| parameter            | description                                                                                          |
|----------------------|------------------------------------------------------------------------------------------------------|
| `query`              | Search term(s)                                                                                       |
| `maxResults`         | Number of top search results to return from Google. Only organic results are returned and counted    |
| `outputFormats`      | Specifies the output formats you want to return (e.g., "markdown", "html"); text is always returned  |
| `requestTimeoutSecs` | Timeout (in seconds) for making the search request and processing its response                       |


## 🏃 What is the best way to run the RAG Web Browser?

The RAG Web Browser is designed to be run in Standby mode for optimal performance.
The Standby mode allows the Actor to stay active, enabling it to retrieve results with lower latency.

## 🕒 What is the expected latency?

The latency is proportional to the memory allocated to the Actor and number of results requested.

Here is a typical latency breakdown for the RAG Web Browser.
Please note the these results are only indicative and may vary based on the search term, the target websites,
and network latency.

The numbers below are based on the following search terms: "apify", "Donald Trump", "boston".
Results were averaged for the three queries.

| Memory (GB) | Max Results | Latency (s) |
|-------------|-------------|-------------|
| 4           | 1           | 22          |
| 4           | 3           | 31          |
| 8           | 1           | 16          |
| 8           | 3           | 17          |

Based on your requirements, if low latency is a priority, consider running the Actor with 4GB or 8GB of memory.
However, if you're looking for a cost-effective solution, you can run the Actor with 2GB of memory but it will be slow.

## 📊 How to set up request timeout?

You can set the `requestTimeoutSecs` parameter to define how long the Actor should spend on making the search request and processing its response.
If the timeout is exceeded, the Actor will return whatever results were scraped up to that point.

For example, the following outputs (truncated for brevity) illustrate this behavior:
- The first result from http://github.com/apify was scraped fully.
- The second result from http://apify.com was partially scraped due to the timeout. As a result, only the `googleSearchResult` is returned, and in this case, the `googleSearchResult.description` was copied into the `text` field.

```json
[
  {
    "crawl": {
      "httpStatusCode": 200,
      "httpStatusMessage": "OK",
      "requestStatus": "handled"
    },
    "googleSearchResult": {
      "description": "Apify command-line interface helps you create, develop, build and run Apify actors, and manage the Apify cloud platform.",
      "title": "Apify",
      "url": "https://github.com/apify"
    },
    "text": "Apify · Crawlee — A web scraping and browser automation library for Python"
  },
  {
    "crawl": {
      "httpStatusCode": 500,
      "httpStatusMessage": "Timed out",
      "requestStatus": "failed"
    },
    "googleSearchResult": {
      "description": "Cloud platform for web scraping, browser automation, and data for AI.",
      "title": "Apify: Full-stack web scraping and data extraction platform",
      "url": "https://apify.com/"
    },
    "text": "Cloud platform for web scraping, browser automation, and data for AI."
  }
]
```

## 📚 How to use RAG Web Browser in your GPT as custom action?

You can easily call the RAG Web Browser to your GPT by uploading its OpenAPI specification and creating a custom action.
Follow the steps in the article [Add custom actions to your GPTs with Apify Actors](https://blog.apify.com/add-custom-actions-to-your-gpts/).

## 👷🏼 Development

**Run STANDBY mode using apify-cli for development**
```bash
APIFY_META_ORIGIN=STANDBY apify run -p
```

**Install playwright dependencies**
```bash
npx playwright install --with-deps
```
