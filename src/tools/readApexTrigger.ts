import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DEFAULT_LIMITS, applyDefaults, formatPaginationFooter } from "../utils/pagination.js";
import { escapeSoqlValue, wildcardToLikePattern as safeWildcardToLike } from "../utils/sanitize.js";

export const READ_APEX_TRIGGER: Tool = {
  name: "salesforce_read_apex_trigger",
  description: `Read Apex triggers from Salesforce.
  
Examples:
1. Read a specific Apex trigger by name:
   {
     "triggerName": "AccountTrigger"
   }

2. List all Apex triggers with an optional name pattern:
   {
     "namePattern": "Account"
   }

3. Get metadata about Apex triggers:
   {
     "includeMetadata": true,
     "namePattern": "Contact"
   }

4. Use wildcards in name patterns:
   {
     "namePattern": "Account*"
   }

Notes:
- When triggerName is provided, the full body of that specific trigger is returned
- When namePattern is provided, all matching trigger names are returned (without body)
- Use includeMetadata to get additional information like API version, object type, and last modified date
- If neither triggerName nor namePattern is provided, all Apex trigger names will be listed
- Wildcards are supported in namePattern: * (matches any characters) and ? (matches a single character)`,
  inputSchema: {
    type: "object",
    properties: {
      triggerName: {
        type: "string",
        description: "Name of a specific Apex trigger to read"
      },
      namePattern: {
        type: "string",
        description: "Pattern to match Apex trigger names (supports wildcards * and ?)"
      },
      includeMetadata: {
        type: "boolean",
        description: "Whether to include metadata about the Apex triggers"
      },
      limit: {
        type: "number",
        description: "Maximum number of triggers to return when listing (default 50)"
      },
      offset: {
        type: "number",
        description: "Number of triggers to skip for pagination when listing (default 0)"
      }
    }
  }
};

export interface ReadApexTriggerArgs {
  triggerName?: string;
  namePattern?: string;
  includeMetadata?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Handles reading Apex triggers from Salesforce
 * @param conn Active Salesforce connection
 * @param args Arguments for reading Apex triggers
 * @returns Tool response with Apex trigger information
 */
export async function handleReadApexTrigger(conn: any, args: ReadApexTriggerArgs) {
  try {
    // If a specific trigger name is provided, get the full trigger body
    if (args.triggerName) {
      console.error(`Reading Apex trigger: ${args.triggerName}`);
      
      // Query the ApexTrigger object to get the trigger body
      const result = await conn.query(`
        SELECT Id, Name, Body, ApiVersion, TableEnumOrId, Status, 
               IsValid, LastModifiedDate, LastModifiedById
        FROM ApexTrigger 
        WHERE Name = '${escapeSoqlValue(args.triggerName)}'
      `);
      
      if (result.records.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: `No Apex trigger found with name: ${args.triggerName}` 
          }],
          isError: true,
        };
      }
      
      const apexTrigger = result.records[0];
      
      // Format the response with the trigger body and metadata
      return {
        content: [
          { 
            type: "text", 
            text: `# Apex Trigger: ${apexTrigger.Name}\n\n` +
                  (args.includeMetadata ? 
                    `**API Version:** ${apexTrigger.ApiVersion}\n` +
                    `**Object:** ${apexTrigger.TableEnumOrId}\n` +
                    `**Status:** ${apexTrigger.Status}\n` +
                    `**Valid:** ${apexTrigger.IsValid ? 'Yes' : 'No'}\n` +
                    `**Last Modified:** ${new Date(apexTrigger.LastModifiedDate).toLocaleString()}\n\n` : '') +
                  "```apex\n" + apexTrigger.Body + "\n```"
          }
        ]
      };
    } 
    // Otherwise, list triggers matching the pattern
    else {
      console.error(`Listing Apex triggers${args.namePattern ? ` matching: ${args.namePattern}` : ''}`);
      
      // Build the query
      let query = `
        SELECT Id, Name${args.includeMetadata ? ', ApiVersion, TableEnumOrId, Status, IsValid, LastModifiedDate' : ''}
        FROM ApexTrigger
      `;
      
      // Add name pattern filter if provided
      if (args.namePattern) {
        const likePattern = safeWildcardToLike(args.namePattern);
        query += ` WHERE Name LIKE '${escapeSoqlValue(likePattern)}'`;
      }
      
      // Apply pagination
      const { limit, offset } = applyDefaults(
        { limit: args.limit, offset: args.offset },
        DEFAULT_LIMITS.read_apex_trigger
      );
      query += ` ORDER BY Name LIMIT ${limit}`;
      if (offset > 0) query += ` OFFSET ${offset}`;

      // Get total count
      let countQuery = `SELECT COUNT() FROM ApexTrigger`;
      if (args.namePattern) {
        const countLikePattern = safeWildcardToLike(args.namePattern);
        countQuery += ` WHERE Name LIKE '${escapeSoqlValue(countLikePattern)}'`;
      }
      let totalSize: number;
      try {
        const countResult = await conn.query(countQuery);
        totalSize = countResult.totalSize;
      } catch {
        totalSize = -1;
      }

      const result = await conn.query(query);

      if (result.records.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No Apex triggers found${args.namePattern ? ` matching: ${args.namePattern}` : ''}`
          }]
        };
      }

      const effectiveTotal = totalSize >= 0 ? totalSize : result.records.length;
      const returned = result.records.length;
      const hasMore = (offset + returned) < effectiveTotal;

      // Format the response as a list of triggers
      let responseText = `# Found ${effectiveTotal} Apex Triggers\n\n`;
      
      if (args.includeMetadata) {
        // Table format with metadata
        responseText += "| Name | API Version | Object | Status | Valid | Last Modified |\n";
        responseText += "|------|------------|--------|--------|-------|---------------|\n";
        
        for (const trigger of result.records) {
          responseText += `| ${trigger.Name} | ${trigger.ApiVersion} | ${trigger.TableEnumOrId} | ${trigger.Status} | ${trigger.IsValid ? 'Yes' : 'No'} | ${new Date(trigger.LastModifiedDate).toLocaleString()} |\n`;
        }
      } else {
        // Simple list format
        for (const trigger of result.records) {
          responseText += `- ${trigger.Name}\n`;
        }
      }
      
      responseText += formatPaginationFooter({
        totalSize: effectiveTotal,
        returned,
        offset,
        limit,
        hasMore,
      });

      return {
        content: [{ type: "text", text: responseText }]
      };
    }
  } catch (error) {
    console.error('Error reading Apex triggers:', error);
    return {
      content: [{ 
        type: "text", 
        text: `Error reading Apex triggers: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true,
    };
  }
}
