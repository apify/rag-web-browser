"""
This script demonstrates how to interact with the Rag-Web-Browser API in Standby mode. It includes a basic example of querying for information, processing results, and handling potential errors.

The example usage in the __main__ block shows how to perform searches for both general topics and specific websites, outputting the results in different formats.
"""

import os
from typing import List

import requests
from dotenv import load_dotenv

load_dotenv()
API_TOKEN = os.getenv("APIFY_API_TOKEN")

class RagWebBrowserClient:
    def __init__(self, api_token: str):
        self.api_token = api_token
        self.base_url = "https://rag-web-browser.apify.actor"
    
    def search(self, 
               query: str, 
               max_results: int = 3,
               output_formats: str = "markdown",
               request_timeout_secs: int = 30,
               dynamic_content_wait_secs: int = 10) -> List[dict]:
        
        # For info about params see: https://apify.com/apify/rag-web-browser#query-parameters
        params = {
            'query': query,
            'maxResults': max_results,
            'outputFormats': output_formats,
            'requestTimeoutSecs': request_timeout_secs,
            'dynamicContentWaitSecs': dynamic_content_wait_secs
        }
        
        headers = {
            'Authorization': f'Bearer {self.api_token}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.get(
                f'{self.base_url}/search',
                params=params,
                headers=headers,
                timeout=request_timeout_secs
            )
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            print(f"Error making request: {e}")
            return []

if __name__ == "__main__":
    
    client = RagWebBrowserClient(API_TOKEN)
    
    queries = [
        "artificial intelligence latest developments", # Non-specific website query
        "https://www.example.com", # Specific website query
    ]
    
    for query in queries:
        print(f"\nSearching for: {query}")
        results = client.search(
            query=query,
            max_results=2,
            output_formats="text,markdown",
            request_timeout_secs=45
        )
        
        for i, result in enumerate(results, 1):
            print(f"\nResult {i}:")
            print(f"Title: {result["metadata"]["title"]}")
            print(f"URL: {result["metadata"]["url"]}")
            print("Content preview:", result.get('text', 'N/A')[:200] + "...")