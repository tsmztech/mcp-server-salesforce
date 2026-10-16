import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const REST_API: Tool = {
  name: "salesforce_rest_api",
  description: `Make direct REST API calls to any Salesforce REST endpoint. This is a powerful passthrough tool that gives access to the full Salesforce REST API surface — including endpoints not covered by other tools.

Use this for any Salesforce REST API that doesn't have a dedicated tool, such as:
- Reports and Dashboards API: GET /analytics/reports/{reportId}
- Composite API: POST /composite
- Files and ContentDocument: GET /sobjects/ContentDocument/{id}/VersionData
- Approval Processes: POST /process/approvals
- Limits and Usage: GET /limits
- Tabs and Themes: GET /tabs, GET /theme
- Quick Actions: GET /sobjects/{object}/quickActions
- Any custom REST endpoint

The endpoint path is relative to /services/data/vXX.0/ (the API version prefix is added automatically).

Examples:
1. Get org limits:
   - method: "GET"
   - endpoint: "/limits"

2. Run a report:
   - method: "GET"
   - endpoint: "/analytics/reports/00O5e000004XXXXEAA"

3. Composite request (multiple operations in one call):
   - method: "POST"
   - endpoint: "/composite"
   - body: { "allOrNone": true, "compositeRequest": [...] }

4. Get file content:
   - method: "GET"
   - endpoint: "/sobjects/ContentVersion/068XXXXXXXXXXXXXXX/VersionData"

5. Call a custom REST endpoint:
   - method: "GET"
   - endpoint: "/my-custom-endpoint"
   - rawPath: true

6. Use a specific API version:
   - method: "GET"
   - endpoint: "/limits"
   - apiVersion: "59.0"`,
  inputSchema: {
    type: "object",
    properties: {
      method: {
        type: "string",
        description: "HTTP method: GET, POST, PATCH, PUT, or DELETE",
        enum: ["GET", "POST", "PATCH", "PUT", "DELETE"]
      },
      endpoint: {
        type: "string",
        description: "REST API endpoint path relative to /services/data/vXX.0/ (e.g., '/limits', '/analytics/reports/{id}'). If rawPath is true, this is the full path from root (e.g., '/services/apexrest/my-endpoint')."
      },
      body: {
        type: "object",
        description: "Request body for POST, PATCH, and PUT requests. Will be serialized as JSON.",
        optional: true
      },
      queryParameters: {
        type: "object",
        description: "URL query parameters as key-value pairs (e.g., { \"includeDetails\": \"true\" })",
        optional: true
      },
      apiVersion: {
        type: "string",
        description: "Override the Salesforce API version (e.g., '59.0', '60.0'). Defaults to the connection's API version.",
        optional: true
      },
      rawPath: {
        type: "boolean",
        description: "If true, the endpoint is treated as a full absolute path from the instance root (e.g., '/services/apexrest/MyEndpoint') instead of being prefixed with /services/data/vXX.0/. Default: false.",
        optional: true
      }
    },
    required: ["method", "endpoint"]
  }
};

export interface RestApiArgs {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  endpoint: string;
  body?: Record<string, any>;
  queryParameters?: Record<string, string>;
  apiVersion?: string;
  rawPath?: boolean;
}

export async function handleRestApi(conn: any, args: RestApiArgs) {
  const { method, endpoint, body, queryParameters, apiVersion, rawPath } = args;

  try {
    // Build the full URL path
    let url: string;
    if (rawPath) {
      url = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    } else {
      const version = apiVersion || conn.version || '59.0';
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      url = `/services/data/v${version}${cleanEndpoint}`;
    }

    // Append query parameters
    if (queryParameters && Object.keys(queryParameters).length > 0) {
      const params = new URLSearchParams(queryParameters).toString();
      url += (url.includes('?') ? '&' : '?') + params;
    }

    // Build the request options
    const requestOptions: any = {
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      requestOptions.body = JSON.stringify(body);
    }

    // Execute the request using jsforce's built-in HTTP client
    const response = await conn.request(requestOptions);

    // Format the response
    const responseText = typeof response === 'string'
      ? response
      : JSON.stringify(response, null, 2);

    // Truncate very large responses to avoid overwhelming the client
    const maxLength = 50000;
    const truncated = responseText.length > maxLength;
    const displayText = truncated
      ? responseText.substring(0, maxLength) + `\n\n... (truncated, ${responseText.length} total characters)`
      : responseText;

    return {
      content: [{
        type: "text",
        text: `${method} ${url} — Success\n\n${displayText}`
      }],
      isError: false,
    };
  } catch (error: any) {
    // Extract Salesforce error details when available
    let errorMessage = error instanceof Error ? error.message : String(error);

    // jsforce errors often include the response body with Salesforce error codes
    if (error.errorCode) {
      errorMessage = `[${error.errorCode}] ${error.message}`;
    }
    if (error.content && Array.isArray(error.content)) {
      errorMessage = error.content
        .map((e: any) => `[${e.errorCode}] ${e.message}`)
        .join('\n');
    }

    return {
      content: [{
        type: "text",
        text: `${method} ${args.endpoint} — Error\n\n${errorMessage}`
      }],
      isError: true,
    };
  }
}
