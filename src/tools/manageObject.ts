import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { MetadataInfo } from "../types/metadata";

export const MANAGE_OBJECT: Tool = {
  name: "salesforce_manage_object",
  description: `Create new custom objects or modify existing ones in Salesforce:
  - Create: New custom objects with fields, relationships, and settings
  - Update: Modify existing object settings, labels, sharing model
  Examples: Create Customer_Feedback__c object, Update object sharing settings
  Note: Changes affect metadata and require proper permissions`,
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["create", "update"],
        description: "Whether to create new object or update existing"
      },
      objectName: {
        type: "string",
        description: "API name for the object (without __c suffix)"
      },
      label: {
        type: "string",
        description: "Label for the object"
      },
      pluralLabel: {
        type: "string",
        description: "Plural label for the object"
      },
      description: {
        type: "string",
        description: "Description of the object",
      },
      nameFieldLabel: {
        type: "string",
        description: "Label for the name field",
      },
      nameFieldType: {
        type: "string",
        enum: ["Text", "AutoNumber"],
        description: "Type of the name field",
      },
      nameFieldFormat: {
        type: "string",
        description: "Display format for AutoNumber field (e.g., 'A-{0000}')",
      },
      sharingModel: {
        type: "string",
        enum: ["ReadWrite", "Read", "Private", "ControlledByParent"],
        description: "Sharing model for the object",
      }
    },
    required: ["operation", "objectName"]
  }
};

export interface ManageObjectArgs {
  operation: 'create' | 'update';
  objectName: string;
  label?: string;
  pluralLabel?: string;
  description?: string;
  nameFieldLabel?: string;
  nameFieldType?: 'Text' | 'AutoNumber';
  nameFieldFormat?: string;
  sharingModel?: 'ReadWrite' | 'Read' | 'Private' | 'ControlledByParent';
}

export async function handleManageObject(conn: any, args: ManageObjectArgs) {
  const { operation, objectName, label, pluralLabel, description, nameFieldLabel, nameFieldType, nameFieldFormat, sharingModel } = args;

  try {
    if (operation === 'create') {
      if (!label || !pluralLabel) {
        throw new Error('Label and pluralLabel are required for object creation');
      }

      // Prepare metadata for the new object
      const metadata = {
        fullName: `${objectName}__c`,
        label,
        pluralLabel,
        nameField: {
          label: nameFieldLabel || `${label} Name`,
          type: nameFieldType || 'Text',
          ...(nameFieldType === 'AutoNumber' && nameFieldFormat ? { displayFormat: nameFieldFormat } : {})
        },
        deploymentStatus: 'Deployed',
        sharingModel: sharingModel || 'ReadWrite'
      } as MetadataInfo;

      if (description) {
        metadata.description = description;
      }

      // Create the object using Metadata API
      const result = await conn.metadata.create('CustomObject', metadata);

      if (result && (Array.isArray(result) ? result[0].success : result.success)) {
        return {
          content: [{
            type: "text",
            text: `Successfully created custom object ${objectName}__c`
          }],
          isError: false,
        };
      }
    } else {
      // For update, first get existing metadata
      const existingMetadata = await conn.metadata.read('CustomObject', [`${objectName}__c`]);
      const currentMetadata = Array.isArray(existingMetadata) ? existingMetadata[0] : existingMetadata;

      if (!currentMetadata) {
        throw new Error(`Object ${objectName}__c not found`);
      }

      // Prepare update metadata
      const metadata = {
        ...currentMetadata,
        label: label || currentMetadata.label,
        pluralLabel: pluralLabel || currentMetadata.pluralLabel,
        description: description !== undefined ? description : currentMetadata.description,
        sharingModel: sharingModel || currentMetadata.sharingModel
      } as MetadataInfo;

      // Update the object using Metadata API
      const result = await conn.metadata.update('CustomObject', metadata);

      if (result && (Array.isArray(result) ? result[0].success : result.success)) {
        return {
          content: [{
            type: "text",
            text: `Successfully updated custom object ${objectName}__c`
          }],
          isError: false,
        };
      }
    }

    return {
      content: [{
        type: "text",
        text: `Failed to ${operation} custom object ${objectName}__c`
      }],
      isError: true,
    };

  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error ${operation === 'create' ? 'creating' : 'updating'} custom object: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true,
    };
  }
}