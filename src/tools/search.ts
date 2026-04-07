import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { SalesforceObject } from "../types/salesforce";
import { DEFAULT_LIMITS, applyDefaults, formatPaginationFooter } from "../utils/pagination.js";

export const SEARCH_OBJECTS: Tool = {
  name: "salesforce_search_objects",
  description: "Search for Salesforce standard and custom objects by name pattern. Examples: 'Account' will find Account, AccountHistory; 'Order' will find WorkOrder, ServiceOrder__c etc.",
  inputSchema: {
    type: "object",
    properties: {
      searchPattern: {
        type: "string",
        description: "Search pattern to find objects (e.g., 'Account Coverage' will find objects like 'AccountCoverage__c')"
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default 50)"
      },
      offset: {
        type: "number",
        description: "Number of results to skip for pagination (default 0)"
      }
    },
    required: ["searchPattern"]
  }
};

export interface SearchObjectsArgs {
  searchPattern: string;
  limit?: number;
  offset?: number;
}

export async function handleSearchObjects(conn: any, args: SearchObjectsArgs) {
  const { searchPattern } = args;
  const { limit, offset } = applyDefaults(
    { limit: args.limit, offset: args.offset },
    DEFAULT_LIMITS.search_objects
  );

  // Get list of all objects
  const describeGlobal = await conn.describeGlobal();

  // Process search pattern to create a more flexible search
  const searchTerms = searchPattern.toLowerCase().split(' ').filter(term => term.length > 0);

  // Filter objects based on search pattern
  const matchingObjects = describeGlobal.sobjects.filter((obj: SalesforceObject) => {
    const objectName = obj.name.toLowerCase();
    const objectLabel = obj.label.toLowerCase();

    // Check if all search terms are present in either the API name or label
    return searchTerms.every(term =>
      objectName.includes(term) || objectLabel.includes(term)
    );
  });

  const totalSize = matchingObjects.length;

  if (totalSize === 0) {
    return {
      content: [{
        type: "text",
        text: `No Salesforce objects found matching "${searchPattern}".`
      }],
      isError: false,
    };
  }

  // Apply pagination
  const paged = matchingObjects.slice(offset, offset + limit);
  const returned = paged.length;
  const hasMore = (offset + returned) < totalSize;

  // Format the output
  const formattedResults = paged.map((obj: SalesforceObject) =>
    `${obj.name}${obj.custom ? ' (Custom)' : ''}\n  Label: ${obj.label}`
  ).join('\n\n');

  let text = `Found ${totalSize} matching objects:\n\n${formattedResults}`;
  text += formatPaginationFooter({
    totalSize,
    returned,
    offset,
    limit,
    hasMore,
  });

  return {
    content: [{
      type: "text",
      text,
    }],
    isError: false,
  };
}
