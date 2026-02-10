import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const TOOLING_QUERY: Tool = {
  name: "salesforce_tooling_query",
  description: `Query Salesforce Tooling API objects using SOQL. The Tooling API provides access to metadata objects that are not available through the standard SOQL API.

Common Tooling API objects:
- ValidationRule: Query validation rules (fields: Id, ValidationName, Active, Description, EntityDefinition.QualifiedApiName, ErrorDisplayField, ErrorMessage, Metadata)
- FlowDefinition: Query flow definitions
- WorkflowRule: Query workflow rules
- ApexClass: Query Apex classes (alternative to salesforce_read_apex)
- ApexTrigger: Query Apex triggers
- ApexPage: Query Visualforce pages
- ApexComponent: Query Visualforce components
- CustomField: Query custom field definitions
- CustomObject: Query custom object definitions
- Layout: Query page layouts
- RecordType: Query record types
- CustomTab: Query custom tabs
- AuraDefinitionBundle: Query Lightning components (Aura)
- LightningComponentBundle: Query Lightning Web Components

Examples:
1. Get all validation rules for an object:
   - soqlQuery: "SELECT Id, ValidationName, Active, Description, ErrorDisplayField, ErrorMessage FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = 'Account'"

2. Get validation rule details including formula (via Metadata field):
   - soqlQuery: "SELECT Id, ValidationName, Metadata FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = 'Account'"

3. Get all active flows:
   - soqlQuery: "SELECT Id, DeveloperName, ActiveVersionId FROM FlowDefinition"

4. Get Apex classes modified recently:
   - soqlQuery: "SELECT Id, Name, Body FROM ApexClass WHERE LastModifiedDate = TODAY"

Note: The Metadata field on Tooling API should be used ONLY when limiting results with 1 record. Objects returns a compound field with full metadata details (e.g., for ValidationRule it includes errorConditionFormula).`,
  inputSchema: {
    type: "object",
    properties: {
      soqlQuery: {
        type: "string",
        description: "Full SOQL query to execute against the Tooling API"
      }
    },
    required: ["soqlQuery"]
  }
};

export interface ToolingQueryArgs {
  soqlQuery: string;
}

export async function handleToolingQuery(conn: any, args: ToolingQueryArgs) {
  const { soqlQuery } = args;

  try {
    const result = await conn.tooling.query(soqlQuery);

    if (!result.records || result.records.length === 0) {
      return {
        content: [{
          type: "text",
          text: "Query returned 0 records."
        }],
        isError: false,
      };
    }

    // Format records as JSON for readability
    const formattedRecords = result.records.map((record: any) => {
      // Remove attributes metadata from each record for cleaner output
      const { attributes, ...cleanRecord } = record;
      return cleanRecord;
    });

    return {
      content: [{
        type: "text",
        text: `Query returned ${result.records.length} records:\n\n${JSON.stringify(formattedRecords, null, 2)}`
      }],
      isError: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text",
        text: `Error executing Tooling API query: ${errorMessage}`
      }],
      isError: true,
    };
  }
}
