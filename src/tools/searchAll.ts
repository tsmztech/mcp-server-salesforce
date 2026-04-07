import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { escapeSoslSearchTerm, validateIdentifier } from "../utils/sanitize.js";

export const SEARCH_ALL: Tool = {
  name: "salesforce_search_all",
  description: `Search across multiple Salesforce objects using SOSL (Salesforce Object Search Language).
  
Examples:
1. Basic search across all objects:
   {
     "searchTerm": "John",
     "objects": [
       { "name": "Account", "fields": ["Name"], "limit": 10 },
       { "name": "Contact", "fields": ["FirstName", "LastName", "Email"] }
     ]
   }

2. Advanced search with filters:
   {
     "searchTerm": "Cloud*",
     "searchIn": "NAME FIELDS",
     "objects": [
       { 
         "name": "Account", 
         "fields": ["Name", "Industry"], 
         "orderBy": "Name DESC",
         "where": "Industry = 'Technology'"
       }
     ],
     "withClauses": [
       { "type": "NETWORK", "value": "ALL NETWORKS" },
       { "type": "SNIPPET", "fields": ["Description"] }
     ]
   }

Notes:
- Use * and ? for wildcards in search terms
- Each object can have its own WHERE, ORDER BY, and LIMIT clauses
- Support for WITH clauses: DATA CATEGORY, DIVISION, METADATA, NETWORK, PRICEBOOKID, SNIPPET, SECURITY_ENFORCED
- "updateable" and "viewable" options control record access filtering`,
  inputSchema: {
    type: "object",
    properties: {
      searchTerm: {
        type: "string",
        description: "Text to search for (supports wildcards * and ?)"
      },
      searchIn: {
        type: "string",
        enum: ["ALL FIELDS", "NAME FIELDS", "EMAIL FIELDS", "PHONE FIELDS", "SIDEBAR FIELDS"],
        description: "Which fields to search in",
        optional: true
      },
      objects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { 
              type: "string",
              description: "API name of the object"
            },
            fields: {
              type: "array",
              items: { type: "string" },
              description: "Fields to return for this object"
            },
            where: {
              type: "string",
              description: "WHERE clause for this object",
              optional: true
            },
            orderBy: {
              type: "string",
              description: "ORDER BY clause for this object",
              optional: true
            },
            limit: {
              type: "number",
              description: "Maximum number of records to return for this object",
              optional: true
            }
          },
          required: ["name", "fields"]
        },
        description: "List of objects to search and their return fields"
      },
      withClauses: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["DATA CATEGORY", "DIVISION", "METADATA", "NETWORK", 
                    "PRICEBOOKID", "SNIPPET", "SECURITY_ENFORCED"]
            },
            value: {
              type: "string",
              description: "Value for the WITH clause",
              optional: true
            },
            fields: {
              type: "array",
              items: { type: "string" },
              description: "Fields for SNIPPET clause",
              optional: true
            }
          },
          required: ["type"]
        },
        description: "Additional WITH clauses for the search",
        optional: true
      },
      updateable: {
        type: "boolean",
        description: "Return only updateable records",
        optional: true
      },
      viewable: {
        type: "boolean",
        description: "Return only viewable records",
        optional: true
      }
    },
    required: ["searchTerm", "objects"]
  }
};

export interface SearchObject {
  name: string;
  fields: string[];
  where?: string;
  orderBy?: string;
  limit?: number;
}

export interface WithClause {
  type: "DATA CATEGORY" | "DIVISION" | "METADATA" | "NETWORK" | 
        "PRICEBOOKID" | "SNIPPET" | "SECURITY_ENFORCED";
  value?: string;
  fields?: string[];
}

export interface SearchAllArgs {
  searchTerm: string;
  searchIn?: "ALL FIELDS" | "NAME FIELDS" | "EMAIL FIELDS" | "PHONE FIELDS" | "SIDEBAR FIELDS";
  objects: SearchObject[];
  withClauses?: WithClause[];
  updateable?: boolean;
  viewable?: boolean;
}

function buildWithClause(withClause: WithClause): string {
  switch (withClause.type) {
    case "SNIPPET":
      return `WITH SNIPPET (${withClause.fields?.join(', ')})`;
    case "DATA CATEGORY":
    case "DIVISION":
    case "NETWORK":
    case "PRICEBOOKID":
      return `WITH ${withClause.type} = ${withClause.value}`;
    case "METADATA":
    case "SECURITY_ENFORCED":
      return `WITH ${withClause.type}`;
    default:
      return '';
  }
}

export async function handleSearchAll(conn: any, args: SearchAllArgs) {
  const { searchTerm, searchIn = "ALL FIELDS", objects, withClauses, updateable, viewable } = args;

  try {
    // Validate the search term
    if (!searchTerm.trim()) {
      throw new Error('Search term cannot be empty');
    }

    // Validate object names
    for (const obj of objects) {
      const objValidation = validateIdentifier(obj.name);
      if (!objValidation.valid) {
        return { content: [{ type: "text", text: objValidation.error! }], isError: true };
      }
    }

    // Construct the RETURNING clause with object-specific clauses
    const returningClause = objects
      .map(obj => {
        let clause = `${obj.name}(${obj.fields.join(',')}`
        
        // Add object-specific clauses if present
        if (obj.where) clause += ` WHERE ${obj.where}`;
        if (obj.orderBy) clause += ` ORDER BY ${obj.orderBy}`;
        if (obj.limit) clause += ` LIMIT ${obj.limit}`;
        
        return clause + ')';
      })
      .join(', ');

    // Build WITH clauses if present
    const withClausesStr = withClauses
      ? withClauses.map(buildWithClause).join(' ')
      : '';

    // Add updateable/viewable flags if specified
    const accessFlags = [];
    if (updateable) accessFlags.push('UPDATEABLE');
    if (viewable) accessFlags.push('VIEWABLE');
    const accessClause = accessFlags.length > 0 ? 
      ` RETURNING ${accessFlags.join(',')}` : '';

    // Construct complete SOSL query
    const soslQuery = `FIND {${escapeSoslSearchTerm(searchTerm)}} IN ${searchIn}
      ${withClausesStr}
      RETURNING ${returningClause}
      ${accessClause}`.trim();

    // Execute search
    const result = await conn.search(soslQuery);

    // Format results by object
    let formattedResults = '';
    objects.forEach((obj, index) => {
      const objectResults = result.searchRecords.filter((record: any) => 
        record.attributes.type === obj.name
      );

      formattedResults += `\n${obj.name} (${objectResults.length} records found):\n`;
      
      if (objectResults.length > 0) {
        objectResults.forEach((record: any, recordIndex: number) => {
          formattedResults += `  Record ${recordIndex + 1}:\n`;
          obj.fields.forEach(field => {
            const value = record[field];
            formattedResults += `    ${field}: ${value !== null && value !== undefined ? value : 'null'}\n`;
          });
          // Add metadata or snippet info if requested
          if (withClauses?.some(w => w.type === "METADATA")) {
            formattedResults += `    Metadata:\n      Last Modified: ${record.attributes.lastModifiedDate}\n`;
          }
          if (withClauses?.some(w => w.type === "SNIPPET")) {
            formattedResults += `    Snippets:\n${record.snippets?.map((s: any) => 
              `      ${s.field}: ${s.snippet}`).join('\n') || '      None'}\n`;
          }
        });
      }

      if (index < objects.length - 1) {
        formattedResults += '\n';
      }
    });

    return {
      content: [{
        type: "text",
        text: `Search Results:${formattedResults}`
      }],
      isError: false,
    };
  } catch (error) {
    // Enhanced error handling for SOSL queries
    const errorMessage = error instanceof Error ? error.message : String(error);
    let enhancedError = errorMessage;

    if (errorMessage.includes('MALFORMED_SEARCH')) {
      enhancedError = `Invalid search query format. Common issues:\n` +
        `1. Search term contains invalid characters\n` +
        `2. Object or field names are incorrect\n` +
        `3. Missing required SOSL syntax elements\n` +
        `4. Invalid WITH clause combination\n\n` +
        `Original error: ${errorMessage}`;
    } else if (errorMessage.includes('INVALID_FIELD')) {
      enhancedError = `Invalid field specified in RETURNING clause. Please check:\n` +
        `1. Field names are correct\n` +
        `2. Fields exist on the specified objects\n` +
        `3. You have access to all specified fields\n` +
        `4. WITH SNIPPET fields are valid\n\n` +
        `Original error: ${errorMessage}`;
    } else if (errorMessage.includes('WITH_CLAUSE')) {
      enhancedError = `Error in WITH clause. Please check:\n` +
        `1. WITH clause type is supported\n` +
        `2. WITH clause value is valid\n` +
        `3. You have permission to use the specified WITH clause\n\n` +
        `Original error: ${errorMessage}`;
    }

    return {
      content: [{
        type: "text",
        text: `Error executing search: ${enhancedError}`
      }],
      isError: true,
    };
  }
}