"""
This is an example of an AWS Lambda function that calls the RAG Web Browser actor and returns text results.

There is a limit of 25KB for the response body in AWS Bedrock, so we need to limit the number of results to 3
and truncate the text whenever required.
"""

import json
import os
import urllib.parse
import urllib.request

ACTOR_BASE_URL = "https://rag-web-browser.apify.actor"  # Base URL from OpenAPI schema
MAX_RESULTS = 3  # Limit the number of results to decrease response size, limit 25KB
TRUNCATE_TEXT_LENGTH = 5000  # Truncate the response body to decrease the response size, limit 25KB
OUTPUT_FORMATS = "markdown"  # Default output format

# Lambda function environment variable
APIFY_API_TOKEN = os.getenv("APIFY_API_TOKEN")


def lambda_handler(event, context):
    print("Received event", event)

    api_path = event["apiPath"]
    http_method = event["httpMethod"]
    parameters = event.get("parameters", [])

    url = f"{ACTOR_BASE_URL}{api_path}"
    headers = {"Authorization": f"Bearer {APIFY_API_TOKEN}"}

    query_params = {}
    for param in parameters:
        name = param["name"]
        value = param["value"]
        query_params[name] = value

    # Limit the number of results to decrease response size
    # Getting: lambda response exceeds maximum size 25KB: 66945
    print("Query params: ", query_params)
    query_params["maxResults"] = min(MAX_RESULTS, int(query_params.get("maxResults", MAX_RESULTS)))

    # Always return Markdown format
    query_params["outputFormats"] = query_params.get("outputFormats", OUTPUT_FORMATS) + f",{OUTPUT_FORMATS}"
    query_params["outputFormats"] = ",".join(set(query_params["outputFormats"].split(",")))
    print("Limited max results to: ", query_params["maxResults"])

    try:
        if query_params and http_method == "GET":
            url = f"{url}?{urllib.parse.urlencode(query_params)}"
            print(f"GET request to {url}")
            req = urllib.request.Request(url, headers=headers, method="GET")
            with urllib.request.urlopen(req) as response:
                response_body = response.read().decode("utf-8")
                print("Received response from RAG Web Browser", response_body)

        else:
            return {"statusCode": 400, "body": json.dumps({"message": f"HTTP method {http_method} not supported"})}

        response = json.loads(response_body)

        # Truncate the response body to decrease the response size, there is a limit of 25KB
        print("Truncating the response body")
        body = [d.get("markdown", "")[:TRUNCATE_TEXT_LENGTH] + "..." for d in response]

        # Handle the API response
        action_response = {
            "actionGroup": event["actionGroup"],
            "apiPath": api_path,
            "httpMethod": http_method,
            "httpStatusCode": 200,
            "responseBody": {"application/json": {"body": "\n".join(body)}},
        }

        dummy_api_response = {"response": action_response, "messageVersion": event["messageVersion"]}
        print("Response: {}".format(dummy_api_response))

        return dummy_api_response

    except Exception as e:
        print("Error occurred", e)
        return {"statusCode": 500, "body": json.dumps({"message": "Internal server error", "error": str(e)})}


if __name__ == "__main__":

    test_event =  {
        "apiPath": "/search",
        "httpMethod": "GET",
        "parameters": [
            {"name": "query", "type": "string", "value": "AI agents in healthcare"},
            {"name": "maxResults", "type": "integer", "value": "3"},
        ],
        "agent": "healthcare-agent",
        "actionGroup": "action-call-rag-web-browser",
        "sessionId": "031263542130667",
        "messageVersion": "1.0",
    }
    handler_response = lambda_handler(test_event, None)
