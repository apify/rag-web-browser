# 🌐 RAG Web Browser

This Actor retrieves website content from the top Google Search Results Pages (SERPs).
Given a search query, it fetches the top Google search result URLs and then follows each URL to extract the text content from the targeted websites.

The RAG Web Browser is designed for Large Language Model (LLM) applications or LLM agents to provide up-to-date Google search knowledge.

**✨ Main features**:
- Searches Google and extracts the top Organic results. The Google search country is set to the United States.
- Follows the top URLs to scrape HTML and extract website text, excluding navigation, ads, banners, etc.
- Capable of extracting content from JavaScript-enabled websites and bypassing anti-scraping protections.
- Output formats include plain text, markdown, and HTML.

This Actor combines the functionality of two specialized actors: the [Google Search Results Scraper](https://apify.com/apify/google-search-scraper) and the [Website Content Crawler](https://apify.com/apify/website-content-crawler).
- To scrape only Google Search Results, use the [Google Search Results Scraper](https://apify.com/apify/google-search-scraper) actor.
- To extract content from a list of URLs, use the [Website Content Crawler](https://apify.com/apify/website-content-crawler) actor.

ⓘ The Actor defaults to using Google Search in the United States.
As a result, queries like "find the best restaurant nearby" will return results from the US.
Other countries are not currently supported.
If you need support for a different region, please create an issue to let us know.

## 🚀 Fast responses using the Standby mode

This Actor can be run in both normal and [standby modes](https://docs.apify.com/platform/actors/running/standby).
Normal mode is useful for testing and running in ad-hoc settings, but it comes with some overhead due to the Actor's initial startup time.

For optimal performance, it is recommended to run the Actor in Standby mode.
This allows the Actor to stay active, enabling it to retrieve results with lower latency.

### 🔥 How to start the Actor in a Standby mode?

You need know the Actor's standby URL and `APIFY_API_TOKEN` to start the Actor in Standby mode.

```shell
curl -X GET https://rag-web-browser.apify.actor?token=APIFY_API_TOKEN
```

Then, you can send requests to the `/search` path along with your `query` and the number of results (`maxResults`) you want to retrieve.
```shell
curl -X GET https://rag-web-browser.apify.actor/search?token=APIFY_API_TOKEN\&query=apify\&maxResults=1
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

**Note** Sending a search request to `/search` will also initiate Standby mode.
You can use this endpoint for both purposes conveniently
```shell
curl -X GET https://rag-web-browser.apify.actor/search?token=APIFY_API_TOKEN&query=apify%20llm
```

### 📧 API parameters

When running in the standby mode the RAG Web Browser accepts the following query parameters:

| parameter                        | description                                                                                                                                            |
|----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| `query`                          | Use regular search words or enter Google Search URLs. You can also apply advanced Google search techniques.                                            |
| `maxResults`                     | The number of top organic search results to return and scrape text from (maximum is 100).                                                              |
| `outputFormats`                  | Select the desired output formats for the retrieved content (e.g., "text", "markdown", "html").                                                        |
| `requestTimeoutSecs`             | The maximum time (in seconds) allowed for the request. If the request exceeds this time, it will be marked as failed.                                  |
| `proxyGroupSearch`               | Select the proxy group for loading search results. Options: 'GOOGLE_SERP', 'SHADER'.                                                                   |
| `maxRequestRetriesSearch`        | Maximum number of retry attempts on network, proxy, or server errors for Google search requests.                                                       |
| `proxyConfiguration`             | Enables loading the websites from IP addresses in specific geographies and to circumvent blocking.                                                     |
| `initialConcurrency`             | Initial number of Playwright browsers running in parallel. The system scales this value based on CPU and memory usage.                                 |
| `minConcurrency`                 | Minimum number of Playwright browsers running in parallel. Useful for defining a base level of parallelism.                                            |
| `maxConcurrency`                 | Maximum number of browsers or clients running in parallel to avoid overloading target websites.                                                        |
| `maxRequestRetries`              | Maximum number of retry attempts on network, proxy, or server errors for the Playwright content crawler.                                               |
| `requestTimeoutContentCrawlSecs` | Timeout (in seconds) for making requests for each search result, including fetching and processing its content.                                        |
| `dynamicContentWaitSecs`         | Maximum time (in seconds) to wait for dynamic content to load. The crawler processes the page once this time elapses or when the network becomes idle. |
| `removeCookieWarnings`           | If enabled, removes cookie consent dialogs to improve text extraction accuracy. Note that this will impact latency.                                    |
| `debugMode`                      | If enabled, the Actor will store debugging information in the dataset's debug field.                                                                   |

## 🏃 What is the best way to run the RAG Web Browser?

The RAG Web Browser is designed to be run in Standby mode for optimal performance.
The Standby mode allows the Actor to stay active, enabling it to retrieve results with lower latency.

## ⏳ What is the expected latency?

The latency is proportional to the **memory allocated** to the Actor and **number of results requested**.

Below is a typical latency breakdown for the RAG Web Browser with **initialConcurrency=3** and **maxResults** set to either 1 or 3.
These settings allow for processing all search results in parallel.

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
However, if you're looking for a cost-effective solution, you can run the Actor with 2GB of memory, but you may experience higher latency and might need to set a longer timeout.

If you need to gather more results, you can increase the memory and adjust the `initialConcurrency` parameter accordingly.

## 🎢 How to optimize the RAG Web Browser for low latency?

For low latency, it's recommended to run the RAG Web Browser with 8 GB of memory. Additionally, adjust these settings to further optimize performance:

- **Initial Concurrency**: This controls the number of Playwright browsers running in parallel. If you only need a few results (e.g., 3, 5, or 10), set the initial concurrency to match this number to ensure content is processed simultaneously.
- **Dynamic Content Wait Secs**: Set this to 0 if you don't need to wait for dynamic content. This can significantly reduce latency.
- **Remove Cookie Warnings**: If the websites you're scraping don't have cookie warnings, set this to false to slightly improve latency.
- **Debug Mode**: Enable this to store debugging information if you need to measure the Actor's latency.

If you require a response within a certain timeframe, use the `requestTimeoutSecs` parameter to define the maximum duration the Actor should spend on making search requests and crawling.


## ✃ How to set up request timeout?

You can set the `requestTimeoutSecs` parameter to define how long the Actor should spend on making the search request and crawling.
If the timeout is exceeded, the Actor will return whatever results were scraped up to that point.

For example, the following outputs (truncated for brevity) illustrate this behavior:
- The first result from https://github.com/apify was scraped fully.
- The second result from https://apify.com was partially scraped due to the timeout. As a result, only the `googleSearchResult` is returned, and in this case, the `googleSearchResult.description` was copied into the `text` field.

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

## 💡 How to use RAG Web Browser in OpenAI Assistant as a tool for web search?

You can use the RAG Web Browser to provide up-to-date information from Google search results to your OpenAI Assistant.
The assistant can use the RAG Web Browser as a tool and whenever it needs to fetch information from the web, it sends request a request to the RAG Web Browser based on the search query.

For a complete example with images and detailed instructions, visit the [OpenAI Assistant integration](https://docs.apify.com/platform/integrations/openai-assistants#real-time-search-data-for-openai-assistant) page.

## ֎ How to use RAG Web Browser in your GPT as a custom action?

You can easily add the RAG Web Browser to your GPT by uploading its OpenAPI specification and creating a custom action.
Follow the detailed guide in the article [Add custom actions to your GPTs with Apify Actors](https://blog.apify.com/add-custom-actions-to-your-gpts/).

Here's a quick guide to adding the RAG Web Browser to your GPT as a custom action:

1. Click on **Explore GPTs** in the left sidebar, then select **+ Create** in the top right corner.
1. Complete all required details in the form.
1. Under the **Actions** section, click **Create new action**.
1. In the Action settings, set **Authentication** to **API key** and choose Bearer as **Auth Type**.
1. In the **schema** field, paste the OpenAPI specification for the RAG Web Browser.
   1. **Normal mode**: Copy the OpenAPI schema from the [RAG-Web-Browser Actor](https://console.apify.com/actors/3ox4R101TgZz67sLr/input) under the API -> OpenAPI specification.
   1. **Standby mode**: Copy the OpenAPI schema from the [OpenAPI standby mode](https://raw.githubusercontent.com/apify/rag-web-browser/refs/heads/master/docs/standby-openapi.json) json file.

![Apify-RAG-Web-Browser-custom-action](https://raw.githubusercontent.com/apify/rag-web-browser/refs/heads/master/docs/apify-gpt-custom-action.png)

## 👷🏼 Development

**Run STANDBY mode using apify-cli for development**
```bash
APIFY_META_ORIGIN=STANDBY apify run -p
```

**Install playwright dependencies**
```bash
npx playwright install --with-deps
```
