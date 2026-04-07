import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { SalesforceField, SalesforceDescribeResponse } from "../types/salesforce";

export const DESCRIBE_OBJECT: Tool = {
  name: "salesforce_describe_object",
  description: "Get detailed schema metadata including all fields, relationships, and field properties of any Salesforce object. Examples: 'Account' shows all Account fields including custom fields; 'Case' shows all Case fields including relationships to Account, Contact etc.",
  inputSchema: {
    type: "object",
    properties: {
      objectName: {
        type: "string",
        description: "API name of the object (e.g., 'Account', 'Contact', 'Custom_Object__c')"
      }
    },
    required: ["objectName"]
  }
};

export async function handleDescribeObject(conn: any, objectName: string) {
  try {
    const describe = await conn.describe(objectName) as SalesforceDescribeResponse;

    // Format the output
    const formattedDescription = `
Object: ${describe.name} (${describe.label})${describe.custom ? ' (Custom Object)' : ''}
Fields:
${describe.fields.map((field: SalesforceField) => `  - ${field.name} (${field.label})
    Type: ${field.type}${field.length ? `, Length: ${field.length}` : ''}
    Required: ${!field.nillable}
    ${field.referenceTo && field.referenceTo.length > 0 ? `References: ${field.referenceTo.join(', ')}` : ''}
    ${field.picklistValues && field.picklistValues.length > 0 ? `Picklist Values: ${field.picklistValues.map((v: { value: string }) => v.value).join(', ')}` : ''}`
    ).join('\n')}`;

    return {
      content: [{
        type: "text",
        text: formattedDescription
      }],
      isError: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text",
        text: `Error describing object "${objectName}": ${errorMessage}`
      }],
      isError: true,
    };
  }
}