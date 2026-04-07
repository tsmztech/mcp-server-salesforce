import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DMLResult } from "../types/salesforce";
import { validateIdentifier } from "../utils/sanitize.js";

export const DML_RECORDS: Tool = {
  name: "salesforce_dml_records",
  description: `Perform data manipulation operations on Salesforce records:
  - insert: Create new records
  - update: Modify existing records (requires Id)
  - delete: Remove records (requires Id)
  - upsert: Insert or update based on external ID field
  Examples: Insert new Accounts, Update Case status, Delete old records, Upsert based on custom external ID`,
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["insert", "update", "delete", "upsert"],
        description: "Type of DML operation to perform"
      },
      objectName: {
        type: "string",
        description: "API name of the object"
      },
      records: {
        type: "array",
        items: { type: "object" },
        description: "Array of records to process"
      },
      externalIdField: {
        type: "string",
        description: "External ID field name for upsert operations",
        optional: true
      }
    },
    required: ["operation", "objectName", "records"]
  }
};

export interface DMLArgs {
  operation: 'insert' | 'update' | 'delete' | 'upsert';
  objectName: string;
  records: Record<string, any>[];
  externalIdField?: string;
}

export async function handleDMLRecords(conn: any, args: DMLArgs) {
  const { operation, objectName, records, externalIdField } = args;

  const objValidation = validateIdentifier(objectName);
  if (!objValidation.valid) {
    return { content: [{ type: "text", text: objValidation.error! }], isError: true };
  }

  try {
    let result: DMLResult | DMLResult[];

    switch (operation) {
      case 'insert':
        result = await conn.sobject(objectName).create(records);
        break;
      case 'update':
        result = await conn.sobject(objectName).update(records);
        break;
      case 'delete':
        result = await conn.sobject(objectName).destroy(records.map(r => r.Id));
        break;
      case 'upsert':
        if (!externalIdField) {
          return {
            content: [{
              type: "text",
              text: 'externalIdField is required for upsert operations'
            }],
            isError: true,
          };
        }
        result = await conn.sobject(objectName).upsert(records, externalIdField);
        break;
      default:
        return {
          content: [{
            type: "text",
            text: `Unsupported operation: ${operation}`
          }],
          isError: true,
        };
    }

    // Format DML results
    const results = Array.isArray(result) ? result : [result];
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    let responseText = `${operation.toUpperCase()} operation completed.\n`;
    responseText += `Processed ${results.length} records:\n`;
    responseText += `- Successful: ${successCount}\n`;
    responseText += `- Failed: ${failureCount}\n\n`;

    if (failureCount > 0) {
      responseText += 'Errors:\n';
      results.forEach((r: DMLResult, idx: number) => {
        if (!r.success && r.errors) {
          responseText += `Record ${idx + 1}:\n`;
          if (Array.isArray(r.errors)) {
            r.errors.forEach((error) => {
              responseText += `  - ${error.message}`;
              if (error.statusCode) {
                responseText += ` [${error.statusCode}]`;
              }
              if (error.fields && error.fields.length > 0) {
                responseText += `\n    Fields: ${error.fields.join(', ')}`;
              }
              responseText += '\n';
            });
          } else {
            // Single error object
            const error = r.errors;
            responseText += `  - ${error.message}`;
            if (error.statusCode) {
              responseText += ` [${error.statusCode}]`;
            }
            if (error.fields) {
              const fields = Array.isArray(error.fields) ? error.fields.join(', ') : error.fields;
              responseText += `\n    Fields: ${fields}`;
            }
            responseText += '\n';
          }
        }
      });
    }

    return {
      content: [{
        type: "text",
        text: responseText
      }],
      isError: failureCount > 0,
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error executing ${operation} on ${objectName}: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true,
    };
  }
}