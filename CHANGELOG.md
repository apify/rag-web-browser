This changelog summarizes all changes of the RAG Web Browser

### 2024-11-08

🚀 Features
- Add functionality to extract content from a specific URL
- Update README.md to include new functionality and provide examples

### 2024-10-17

🚀 Features
- Handle errors when request is added to Playwright queue.
  This will prevent the Cheerio crawler from repeating the same request multiple times.
- Silence error: Could not parse CSS stylesheet as there is no way to fix it at our end
- Set logLevel to INFO (debug level can be set using the `debugMode=true` input)

### 2024-10-11

🚀 Features
- Increase the maximum number of results (`maxResults`) from 50 to 100
- Explain better how to search a specific website using "llm site:apify.com"

### 2024-10-07

🚀 Features
- Add a short description how to create a custom action

### 2024-09-24

🚀 Features
- Updated README.md to include tips on improving latency
- Set initialConcurrency to 5
- Set minConcurrency to 3

### 2024-09-20

🐛 Bug Fixes
- Fix response format when crawler fails

### 2024-09-24

🚀 Features
- Add ability to create new crawlers using query parameters
- Update Dockerfile to node version 22

🐛 Bug Fixes
- Fix playwright key creation

### 2024-09-11

🚀 Features
- Initial version of the RAG Web Browser
