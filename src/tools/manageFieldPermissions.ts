import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const MANAGE_FIELD_PERMISSIONS: Tool = {
  name: "salesforce_manage_field_permissions",
  description: `Manage Field Level Security (Field Permissions) for custom and standard fields.
  - Grant or revoke read/edit access to fields for specific profiles or permission sets
  - View current field permissions
  - Bulk update permissions for multiple profiles
  
  Examples:
  1. Grant System Administrator access to a field
  2. Give read-only access to a field for specific profiles
  3. Check which profiles have access to a field`,
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["grant", "revoke", "view"],
        description: "Operation to perform on field permissions"
      },
      objectName: {
        type: "string",
        description: "API name of the object (e.g., 'Account', 'Custom_Object__c')"
      },
      fieldName: {
        type: "string",
        description: "API name of the field (e.g., 'Custom_Field__c')"
      },
      profileNames: {
        type: "array",
        items: { type: "string" },
        description: "Names of profiles to grant/revoke access (e.g., ['System Administrator', 'Sales User'])",
        optional: true
      },
      readable: {
        type: "boolean",
        description: "Grant/revoke read access (default: true)",
        optional: true
      },
      editable: {
        type: "boolean",
        description: "Grant/revoke edit access (default: true)",
        optional: true
      }
    },
    required: ["operation", "objectName", "fieldName"]
  }
};

export interface ManageFieldPermissionsArgs {
  operation: 'grant' | 'revoke' | 'view';
  objectName: string;
  fieldName: string;
  profileNames?: string[];
  readable?: boolean;
  editable?: boolean;
}

export async function handleManageFieldPermissions(conn: any, args: ManageFieldPermissionsArgs) {
  const { operation, objectName, fieldName, readable = true, editable = true } = args;
  let { profileNames } = args;

  try {
    // Ensure field name has __c suffix if it's a custom field and doesn't already have it
    const fieldApiName = fieldName.endsWith('__c') || fieldName.includes('.') ? fieldName : `${fieldName}__c`;
    const fullFieldName = `${objectName}.${fieldApiName}`;

    if (operation === 'view') {
      // Query existing field permissions
      const permissionsQuery = `
        SELECT Id, Parent.ProfileId, Parent.Profile.Name, Parent.IsOwnedByProfile,
               Parent.PermissionSetId, Parent.PermissionSet.Name,
               Field, PermissionsRead, PermissionsEdit
        FROM FieldPermissions
        WHERE SobjectType = '${objectName}'
        AND Field = '${fullFieldName}'
        ORDER BY Parent.Profile.Name
      `;

      const result = await conn.query(permissionsQuery);
      
      if (result.records.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No field permissions found for ${fullFieldName}. This field might not have any specific permissions set, or it might be universally accessible.`
          }],
          isError: false,
        };
      }

      let responseText = `Field permissions for ${fullFieldName}:\n\n`;
      
      result.records.forEach((perm: any) => {
        const name = perm.Parent.IsOwnedByProfile 
          ? perm.Parent.Profile?.Name 
          : perm.Parent.PermissionSet?.Name;
        const type = perm.Parent.IsOwnedByProfile ? 'Profile' : 'Permission Set';
        
        responseText += `${type}: ${name}\n`;
        responseText += `  - Read Access: ${perm.PermissionsRead ? 'Yes' : 'No'}\n`;
        responseText += `  - Edit Access: ${perm.PermissionsEdit ? 'Yes' : 'No'}\n\n`;
      });

      return {
        content: [{
          type: "text",
          text: responseText
        }],
        isError: false,
      };
    }

    // For grant/revoke operations
    if (!profileNames || profileNames.length === 0) {
      // If no profiles specified, default to System Administrator
      profileNames = ['System Administrator'];
    }

    // Get profile IDs
    const profileQuery = await conn.query(`
      SELECT Id, Name 
      FROM Profile 
      WHERE Name IN (${profileNames.map(name => `'${name}'`).join(', ')})
    `);

    if (profileQuery.records.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No profiles found matching: ${profileNames.join(', ')}`
        }],
        isError: true,
      };
    }

    const results: any[] = [];
    const errors: string[] = [];

    for (const profile of profileQuery.records) {
      try {
        if (operation === 'grant') {
          // First, check if permission already exists
          const existingPerm = await conn.query(`
            SELECT Id, PermissionsRead, PermissionsEdit
            FROM FieldPermissions
            WHERE ParentId IN (
              SELECT Id FROM PermissionSet 
              WHERE IsOwnedByProfile = true 
              AND ProfileId = '${profile.Id}'
            )
            AND Field = '${fullFieldName}'
            AND SobjectType = '${objectName}'
            LIMIT 1
          `);

          if (existingPerm.records.length > 0) {
            // Update existing permission
            const updateResult = await conn.sobject('FieldPermissions').update({
              Id: existingPerm.records[0].Id,
              PermissionsRead: readable,
              PermissionsEdit: editable && readable // Edit requires read
            });
            
            results.push({
              profile: profile.Name,
              action: 'updated',
              success: updateResult.success
            });
          } else {
            // Get the PermissionSet ID for this profile
            const permSetQuery = await conn.query(`
              SELECT Id FROM PermissionSet 
              WHERE IsOwnedByProfile = true 
              AND ProfileId = '${profile.Id}'
              LIMIT 1
            `);

            if (permSetQuery.records.length > 0) {
              // Create new permission
              const createResult = await conn.sobject('FieldPermissions').create({
                ParentId: permSetQuery.records[0].Id,
                SobjectType: objectName,
                Field: fullFieldName,
                PermissionsRead: readable,
                PermissionsEdit: editable && readable // Edit requires read
              });

              results.push({
                profile: profile.Name,
                action: 'created',
                success: createResult.success
              });
            } else {
              errors.push(`Could not find permission set for profile: ${profile.Name}`);
            }
          }
        } else if (operation === 'revoke') {
          // Find and delete the permission
          const existingPerm = await conn.query(`
            SELECT Id
            FROM FieldPermissions
            WHERE ParentId IN (
              SELECT Id FROM PermissionSet 
              WHERE IsOwnedByProfile = true 
              AND ProfileId = '${profile.Id}'
            )
            AND Field = '${fullFieldName}'
            AND SobjectType = '${objectName}'
            LIMIT 1
          `);

          if (existingPerm.records.length > 0) {
            const deleteResult = await conn.sobject('FieldPermissions').delete(existingPerm.records[0].Id);
            results.push({
              profile: profile.Name,
              action: 'revoked',
              success: true
            });
          } else {
            results.push({
              profile: profile.Name,
              action: 'no permission found',
              success: true
            });
          }
        }
      } catch (error) {
        errors.push(`${profile.Name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Format response
    let responseText = `Field permission ${operation} operation completed for ${fullFieldName}:\n\n`;
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    if (successful.length > 0) {
      responseText += 'Successful:\n';
      successful.forEach(r => {
        responseText += `  - ${r.profile}: ${r.action}\n`;
      });
    }
    
    if (failed.length > 0 || errors.length > 0) {
      responseText += '\nFailed:\n';
      failed.forEach(r => {
        responseText += `  - ${r.profile}: ${r.action}\n`;
      });
      errors.forEach(e => {
        responseText += `  - ${e}\n`;
      });
    }

    if (operation === 'grant') {
      responseText += `\nPermissions granted:\n  - Read: ${readable ? 'Yes' : 'No'}\n  - Edit: ${editable ? 'Yes' : 'No'}`;
    }

    return {
      content: [{
        type: "text",
        text: responseText
      }],
      isError: false,
    };

  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error managing field permissions: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true,
    };
  }
} 