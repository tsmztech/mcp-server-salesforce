import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const READ_APEX: Tool = {
  name: "salesforce_read_apex",
  description: `Read Apex classes from Salesforce.
  
Examples:
1. Read a specific Apex class by name:
   {
     "className": "AccountController"
   }

2. List all Apex classes with an optional name pattern:
   {
     "namePattern": "Controller"
   }

3. Get metadata about Apex classes:
   {
     "includeMetadata": true,
     "namePattern": "Trigger"
   }

4. Use wildcards in name patterns:
   {
     "namePattern": "Account*Cont*"
   }

Notes:
- When className is provided, the full body of that specific class is returned
- When namePattern is provided, all matching class names are returned (without body)
- Use includeMetadata to get additional information like API version, length, and last modified date
- If neither className nor namePattern is provided, all Apex class names will be listed
- Wildcards are supported in namePattern: * (matches any characters) and ? (matches a single character)`,
  inputSchema: {
    type: "object",
    properties: {
      className: {
        type: "string",
        description: "Name of a specific Apex class to read"
      },
      namePattern: {
        type: "string",
        description: "Pattern to match Apex class names (supports wildcards * and ?)"
      },
      includeMetadata: {
        type: "boolean",
        description: "Whether to include metadata about the Apex classes"
      }
    }
  }
};

export interface ReadApexArgs {
  className?: string;
  namePattern?: string;
  includeMetadata?: boolean;
}

/**
 * Converts a wildcard pattern to a SQL LIKE pattern
 * @param pattern Pattern with * and ? wildcards
 * @returns SQL LIKE compatible pattern
 */
function wildcardToLikePattern(pattern: string): string {
  if (!pattern.includes('*') && !pattern.includes('?')) {
    // If no wildcards, wrap with % for substring match
    return `%${pattern}%`;
  }
  
  // Replace * with % and ? with _ for SQL LIKE
  let likePattern = pattern.replace(/\*/g, '%').replace(/\?/g, '_');
  
  return likePattern;
}

/**
 * Handles reading Apex classes from Salesforce
 * @param conn Active Salesforce connection
 * @param args Arguments for reading Apex classes
 * @returns Tool response with Apex class information
 */
export async function handleReadApex(conn: any, args: ReadApexArgs) {
  try {
    // If a specific class name is provided, get the full class body
    if (args.className) {
      console.error(`Reading Apex class: ${args.className}`);
      
      // Query the ApexClass object to get the class body
      const result = await conn.query(`
        SELECT Id, Name, Body, ApiVersion, LengthWithoutComments, Status, 
               IsValid, LastModifiedDate, LastModifiedById
        FROM ApexClass 
        WHERE Name = '${args.className}'
      `);
      
      if (result.records.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: `No Apex class found with name: ${args.className}` 
          }],
          isError: true,
        };
      }
      
      const apexClass = result.records[0];
      
      // Format the response with the class body and metadata
      return {
        content: [
          { 
            type: "text", 
            text: `# Apex Class: ${apexClass.Name}\n\n` +
                  (args.includeMetadata ? 
                    `**API Version:** ${apexClass.ApiVersion}\n` +
                    `**Length:** ${apexClass.LengthWithoutComments} characters\n` +
                    `**Status:** ${apexClass.Status}\n` +
                    `**Valid:** ${apexClass.IsValid ? 'Yes' : 'No'}\n` +
                    `**Last Modified:** ${new Date(apexClass.LastModifiedDate).toLocaleString()}\n\n` : '') +
                  "```apex\n" + apexClass.Body + "\n```"
          }
        ]
      };
    } 
    // Otherwise, list classes matching the pattern
    else {
      console.error(`Listing Apex classes${args.namePattern ? ` matching: ${args.namePattern}` : ''}`);
      
      // Build the query
      let query = `
        SELECT Id, Name${args.includeMetadata ? ', ApiVersion, LengthWithoutComments, Status, IsValid, LastModifiedDate' : ''}
        FROM ApexClass
      `;
      
      // Add name pattern filter if provided
      if (args.namePattern) {
        const likePattern = wildcardToLikePattern(args.namePattern);
        query += ` WHERE Name LIKE '${likePattern}'`;
      }
      
      // Order by name
      query += ` ORDER BY Name`;
      
      const result = await conn.query(query);
      
      if (result.records.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: `No Apex classes found${args.namePattern ? ` matching: ${args.namePattern}` : ''}` 
          }]
        };
      }
      
      // Format the response as a list of classes
      let responseText = `# Found ${result.records.length} Apex Classes\n\n`;
      
      if (args.includeMetadata) {
        // Table format with metadata
        responseText += "| Name | API Version | Length | Status | Valid | Last Modified |\n";
        responseText += "|------|------------|--------|--------|-------|---------------|\n";
        
        for (const cls of result.records) {
          responseText += `| ${cls.Name} | ${cls.ApiVersion} | ${cls.LengthWithoutComments} | ${cls.Status} | ${cls.IsValid ? 'Yes' : 'No'} | ${new Date(cls.LastModifiedDate).toLocaleString()} |\n`;
        }
      } else {
        // Simple list format
        for (const cls of result.records) {
          responseText += `- ${cls.Name}\n`;
        }
      }
      
      return {
        content: [{ type: "text", text: responseText }]
      };
    }
  } catch (error) {
    console.error('Error reading Apex classes:', error);
    return {
      content: [{ 
        type: "text", 
        text: `Error reading Apex classes: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true,
    };
  }
}
