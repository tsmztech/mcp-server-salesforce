import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { Connection } from "jsforce";
import { escapeSoqlString, validateInputLength, MAX_FIELD_LENGTH } from "../utils/soqlSanitizer.js";

export const WRITE_APEX: Tool = {
  name: "salesforce_write_apex",
  description: `Create or update Apex classes in Salesforce.
  
Examples:
1. Create a new Apex class:
   {
     "operation": "create",
     "className": "AccountService",
     "apiVersion": "58.0",
     "body": "public class AccountService { public static void updateAccounts() { /* implementation */ } }"
   }

2. Update an existing Apex class:
   {
     "operation": "update",
     "className": "AccountService",
     "body": "public class AccountService { public static void updateAccounts() { /* updated implementation */ } }"
   }

Notes:
- The operation must be either 'create' or 'update'
- For 'create' operations, className and body are required
- For 'update' operations, className and body are required
- apiVersion is optional for 'create' (defaults to the latest version)
- The body must be valid Apex code
- The className in the body must match the className parameter
- Status information is returned after successful operations`,
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["create", "update"],
        description: "Whether to create a new class or update an existing one"
      },
      className: {
        type: "string",
        description: "Name of the Apex class to create or update"
      },
      apiVersion: {
        type: "string",
        description: "API version for the Apex class (e.g., '58.0')"
      },
      body: {
        type: "string",
        description: "Full body of the Apex class"
      }
    },
    required: ["operation", "className", "body"]
  }
};

export interface WriteApexArgs {
  operation: 'create' | 'update';
  className: string;
  apiVersion?: string;
  body: string;
}

/**
 * Handles creating or updating Apex classes in Salesforce
 * @param conn Active Salesforce connection
 * @param args Arguments for writing Apex classes
 * @returns Tool response with operation result
 */
export async function handleWriteApex(conn: any, args: WriteApexArgs) {
  try {
    // SECURITY: Validate and sanitize inputs
    if (!args.className) {
      throw new Error('className is required');
    }
    
    if (!args.body) {
      throw new Error('body is required');
    }
    
    // Validate input lengths
    validateInputLength(args.className, MAX_FIELD_LENGTH, 'className');
    validateInputLength(args.body, 1000000, 'body'); // 1MB max for Apex code
    
    // Validate className format (alphanumeric and underscores only)
    const classNamePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!classNamePattern.test(args.className)) {
      throw new Error('Invalid className format. Must contain only alphanumeric characters and underscores.');
    }
    
    // Check if the class name in the body matches the provided className
    const classNameRegex = new RegExp(`\\b(class|interface|enum)\\s+${args.className}\\b`);
    if (!classNameRegex.test(args.body)) {
      throw new Error(`The class name in the body must match the provided className: ${args.className}`);
    }
    
    // Handle create operation
    if (args.operation === 'create') {
      // Check if class already exists using parameterized query
      const existingClass = await conn.query(`
        SELECT Id FROM ApexClass WHERE Name = '${escapeSoqlString(args.className)}'
      `);
      
      if (existingClass.records.length > 0) {
        throw new Error(`Apex class with name '${args.className}' already exists. Use 'update' operation instead.`);
      }
      
      // Create the new class using the Tooling API
      const createResult = await conn.tooling.sobject('ApexClass').create({
        Name: args.className,
        Body: args.body,
        ApiVersion: args.apiVersion || '58.0', // Default to latest if not specified
        Status: 'Active'
      });
      
      if (!createResult.success) {
        throw new Error(`Failed to create Apex class: ${createResult.errors.join(', ')}`);
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Successfully created Apex class: ${args.className}\n\n` +
                `**ID:** ${createResult.id}\n` +
                `**API Version:** ${args.apiVersion || '58.0'}\n` +
                `**Status:** Active`
        }]
      };
    } 
    // Handle update operation
    else if (args.operation === 'update') {
      // Updating Apex class
      
      // Find the existing class using safe query
      const existingClass = await conn.query(`
        SELECT Id FROM ApexClass WHERE Name = '${escapeSoqlString(args.className)}'
      `);
      
      if (existingClass.records.length === 0) {
        throw new Error(`No Apex class found with name: ${args.className}. Use 'create' operation instead.`);
      }
      
      const classId = existingClass.records[0].Id;
      
      // Update the class using the Tooling API
      const updateResult = await conn.tooling.sobject('ApexClass').update({
        Id: classId,
        Body: args.body
      });
      
      if (!updateResult.success) {
        throw new Error(`Failed to update Apex class: ${updateResult.errors.join(', ')}`);
      }
      
      // Get the updated class details using safe query
      const updatedClass = await conn.query(`
        SELECT Id, Name, ApiVersion, Status, LastModifiedDate
        FROM ApexClass
        WHERE Id = '${escapeSoqlString(classId)}'
      `);
      
      const classDetails = updatedClass.records[0];
      
      return {
        content: [{ 
          type: "text", 
          text: `Successfully updated Apex class: ${args.className}\n\n` +
                `**ID:** ${classId}\n` +
                `**API Version:** ${classDetails.ApiVersion}\n` +
                `**Status:** ${classDetails.Status}\n` +
                `**Last Modified:** ${new Date(classDetails.LastModifiedDate).toLocaleString()}`
        }]
      };
    } else {
      throw new Error(`Invalid operation: ${args.operation}. Must be 'create' or 'update'.`);
    }
  } catch (error) {
    // Error writing Apex class
    return {
      content: [{ 
        type: "text", 
        text: `Error writing Apex class: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true,
    };
  }
}
