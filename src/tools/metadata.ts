import { Tool } from "@modelcontextprotocol/sdk/types.js";
import jsforce from "jsforce";

export const METADATA_QUERY: Tool = {
  name: "salesforce_metadata_query",
  description: "Fetch Salesforce metadata such as validation rules and Lightning record pages",
  inputSchema: {
    type: "object",
    properties: {
      metadataType: {
        type: "string",
        description: "Type of metadata: ValidationRule or FlexiPage"
      },
      objectName: {
        type: "string",
        description: "Object name (required for ValidationRule)"
      },
      name: {
        type: "string",
        description: "Metadata name (required for FlexiPage)"
      }
    },
    required: ["metadataType"]
  }
};

export async function handleMetadataQuery(conn: any, args: any) {
  const { metadataType, objectName, name } = args;

  try {
    if (metadataType === "ValidationRule") {
      if (!objectName) {
        throw new Error("objectName is required for ValidationRule");
      }

      const result = await conn.tooling.query(
        `SELECT Id, ValidationName, ErrorMessage, Active 
         FROM ValidationRule 
         WHERE EntityDefinition.QualifiedApiName = '${objectName}'`
      );

      return {
        content: [{
          type: "text",
          text: JSON.stringify(result.records, null, 2)
        }],
        isError: false
      };
    }

    if (metadataType === "FlexiPage") {
      if (!name) {
        throw new Error("name is required for FlexiPage");
      }

      const result = await conn.metadata.read("FlexiPage", name);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }],
        isError: false
      };
    }

    throw new Error("Unsupported metadata type");

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      content: [{
        type: "text",
        text: `Error fetching metadata: ${errorMessage}`
      }],
      isError: true
    };
  }
}