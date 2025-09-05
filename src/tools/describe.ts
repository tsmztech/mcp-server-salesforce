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
  const describe = await conn.describe(objectName) as SalesforceDescribeResponse;
  
  console.log(`[DESCRIBE] Object ${objectName} has ${describe.fields.length} fields`);
  
  // Separate fields by type for better organization
  const standardFields = describe.fields.filter(f => !f.name.includes('__c') && !f.name.includes('__r'));
  const customFields = describe.fields.filter(f => f.name.includes('__c'));
  const relationshipFields = describe.fields.filter(f => f.referenceTo && f.referenceTo.length > 0);
  
  console.log(`[DESCRIBE] ${standardFields.length} standard, ${customFields.length} custom, ${relationshipFields.length} relationship fields`);
  
  // Format the output with better organization
  const formattedDescription = `
Object: ${describe.name} (${describe.label})${describe.custom ? ' (Custom Object)' : ''}

STANDARD FIELDS (${standardFields.length}):
${standardFields.slice(0, 20).map((field: SalesforceField) => `  - ${field.name} (${field.label})
    Type: ${field.type}${field.length ? `, Length: ${field.length}` : ''}
    Required: ${!field.nillable}
    ${field.picklistValues && field.picklistValues.length > 0 ? `Picklist Values: ${field.picklistValues.map((v: { value: string }) => v.value).join(', ')}` : ''}`
  ).join('\n')}${standardFields.length > 20 ? `\n  ... and ${standardFields.length - 20} more standard fields` : ''}

RELATIONSHIP FIELDS (${relationshipFields.length}):
${relationshipFields.slice(0, 10).map((field: SalesforceField) => `  - ${field.name} (${field.label})
    Type: ${field.type} → References: ${field.referenceTo.join(', ')}
    Required: ${!field.nillable}`
  ).join('\n')}${relationshipFields.length > 10 ? `\n  ... and ${relationshipFields.length - 10} more relationship fields` : ''}

CUSTOM FIELDS (${customFields.length}):
${customFields.slice(0, 15).map((field: SalesforceField) => `  - ${field.name} (${field.label})
    Type: ${field.type}${field.length ? `, Length: ${field.length}` : ''}
    Required: ${!field.nillable}
    ${field.referenceTo && field.referenceTo.length > 0 ? `References: ${field.referenceTo.join(', ')}` : ''}
    ${field.picklistValues && field.picklistValues.length > 0 ? `Picklist Values: ${field.picklistValues.map((v: { value: string }) => v.value).join(', ')}` : ''}`
  ).join('\n')}${customFields.length > 15 ? `\n  ... and ${customFields.length - 15} more custom fields` : ''}

RECOMMENDED QUERY FIELDS FOR ${objectName.toUpperCase()}:
${objectName === 'Opportunity' ? 
  '  - Basic: ["Id", "Name", "StageName", "Amount", "CloseDate", "CreatedDate", "LastModifiedDate"]\n  - With Account: ["Id", "Name", "StageName", "Amount", "Account.Name", "Account.Industry", "Account.Type"]\n  - Full Pipeline: ["Id", "Name", "StageName", "Amount", "CloseDate", "CreatedDate", "Account.Name", "Owner.Name", "LeadSource"]' :
objectName === 'Account' ?
  '  - Basic: ["Id", "Name", "Industry", "Type", "CreatedDate", "LastModifiedDate"]\n  - With Owner: ["Id", "Name", "Industry", "Type", "Owner.Name", "Owner.Email"]\n  - Full Details: ["Id", "Name", "Industry", "Type", "BillingCity", "BillingState", "Phone", "Website"]' :
  '  - Use field names from the lists above in your queries'
}`;

  return {
    content: [{
      type: "text",
      text: formattedDescription
    }],
    isError: false,
  };
}