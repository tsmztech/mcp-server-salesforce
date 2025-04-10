import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const WRITE_APEX_TRIGGER: Tool = {
  name: "salesforce_write_apex_trigger",
  description: `Create or update Apex triggers in Salesforce.
  
Examples:
1. Create a new Apex trigger:
   {
     "operation": "create",
     "triggerName": "AccountTrigger",
     "objectName": "Account",
     "apiVersion": "58.0",
     "body": "trigger AccountTrigger on Account (before insert, before update) { /* implementation */ }"
   }

2. Update an existing Apex trigger:
   {
     "operation": "update",
     "triggerName": "AccountTrigger",
     "body": "trigger AccountTrigger on Account (before insert, before update, after update) { /* updated implementation */ }"
   }

Notes:
- The operation must be either 'create' or 'update'
- For 'create' operations, triggerName, objectName, and body are required
- For 'update' operations, triggerName and body are required
- apiVersion is optional for 'create' (defaults to the latest version)
- The body must be valid Apex trigger code
- The triggerName in the body must match the triggerName parameter
- The objectName in the body must match the objectName parameter (for 'create')
- Status information is returned after successful operations`,
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["create", "update"],
        description: "Whether to create a new trigger or update an existing one"
      },
      triggerName: {
        type: "string",
        description: "Name of the Apex trigger to create or update"
      },
      objectName: {
        type: "string",
        description: "Name of the Salesforce object the trigger is for (required for 'create')"
      },
      apiVersion: {
        type: "string",
        description: "API version for the Apex trigger (e.g., '58.0')"
      },
      body: {
        type: "string",
        description: "Full body of the Apex trigger"
      }
    },
    required: ["operation", "triggerName", "body"]
  }
};

export interface WriteApexTriggerArgs {
  operation: 'create' | 'update';
  triggerName: string;
  objectName?: string;
  apiVersion?: string;
  body: string;
}

/**
 * Handles creating or updating Apex triggers in Salesforce
 * @param conn Active Salesforce connection
 * @param args Arguments for writing Apex triggers
 * @returns Tool response with operation result
 */
export async function handleWriteApexTrigger(conn: any, args: WriteApexTriggerArgs) {
  try {
    // Validate inputs
    if (!args.triggerName) {
      throw new Error('triggerName is required');
    }
    
    if (!args.body) {
      throw new Error('body is required');
    }
    
    // Check if the trigger name in the body matches the provided triggerName
    const triggerNameRegex = new RegExp(`\\btrigger\\s+${args.triggerName}\\b`);
    if (!triggerNameRegex.test(args.body)) {
      throw new Error(`The trigger name in the body must match the provided triggerName: ${args.triggerName}`);
    }
    
    // Handle create operation
    if (args.operation === 'create') {
      console.error(`Creating new Apex trigger: ${args.triggerName}`);
      
      // Validate object name for create operation
      if (!args.objectName) {
        throw new Error('objectName is required for creating a new trigger');
      }
      
      // Check if the object name in the body matches the provided objectName
      const objectNameRegex = new RegExp(`\\bon\\s+${args.objectName}\\b`);
      if (!objectNameRegex.test(args.body)) {
        throw new Error(`The object name in the body must match the provided objectName: ${args.objectName}`);
      }
      
      // Check if trigger already exists
      const existingTrigger = await conn.query(`
        SELECT Id FROM ApexTrigger WHERE Name = '${args.triggerName}'
      `);
      
      if (existingTrigger.records.length > 0) {
        throw new Error(`Apex trigger with name '${args.triggerName}' already exists. Use 'update' operation instead.`);
      }
      
      // Create the new trigger using the Tooling API
      const createResult = await conn.tooling.sobject('ApexTrigger').create({
        Name: args.triggerName,
        TableEnumOrId: args.objectName,
        Body: args.body,
        ApiVersion: args.apiVersion || '58.0', // Default to latest if not specified
        Status: 'Active'
      });
      
      if (!createResult.success) {
        throw new Error(`Failed to create Apex trigger: ${createResult.errors.join(', ')}`);
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Successfully created Apex trigger: ${args.triggerName}\n\n` +
                `**ID:** ${createResult.id}\n` +
                `**Object:** ${args.objectName}\n` +
                `**API Version:** ${args.apiVersion || '58.0'}\n` +
                `**Status:** Active`
        }]
      };
    } 
    // Handle update operation
    else if (args.operation === 'update') {
      console.error(`Updating Apex trigger: ${args.triggerName}`);
      
      // Find the existing trigger
      const existingTrigger = await conn.query(`
        SELECT Id, TableEnumOrId FROM ApexTrigger WHERE Name = '${args.triggerName}'
      `);
      
      if (existingTrigger.records.length === 0) {
        throw new Error(`No Apex trigger found with name: ${args.triggerName}. Use 'create' operation instead.`);
      }
      
      const triggerId = existingTrigger.records[0].Id;
      const objectName = existingTrigger.records[0].TableEnumOrId;
      
      // Check if the object name in the body matches the existing object
      const objectNameRegex = new RegExp(`\\bon\\s+${objectName}\\b`);
      if (!objectNameRegex.test(args.body)) {
        throw new Error(`The object name in the body must match the existing object: ${objectName}`);
      }
      
      // Update the trigger using the Tooling API
      const updateResult = await conn.tooling.sobject('ApexTrigger').update({
        Id: triggerId,
        Body: args.body
      });
      
      if (!updateResult.success) {
        throw new Error(`Failed to update Apex trigger: ${updateResult.errors.join(', ')}`);
      }
      
      // Get the updated trigger details
      const updatedTrigger = await conn.query(`
        SELECT Id, Name, TableEnumOrId, ApiVersion, Status, LastModifiedDate
        FROM ApexTrigger
        WHERE Id = '${triggerId}'
      `);
      
      const triggerDetails = updatedTrigger.records[0];
      
      return {
        content: [{ 
          type: "text", 
          text: `Successfully updated Apex trigger: ${args.triggerName}\n\n` +
                `**ID:** ${triggerId}\n` +
                `**Object:** ${triggerDetails.TableEnumOrId}\n` +
                `**API Version:** ${triggerDetails.ApiVersion}\n` +
                `**Status:** ${triggerDetails.Status}\n` +
                `**Last Modified:** ${new Date(triggerDetails.LastModifiedDate).toLocaleString()}`
        }]
      };
    } else {
      throw new Error(`Invalid operation: ${args.operation}. Must be 'create' or 'update'.`);
    }
  } catch (error) {
    console.error('Error writing Apex trigger:', error);
    return {
      content: [{ 
        type: "text", 
        text: `Error writing Apex trigger: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true,
    };
  }
}
