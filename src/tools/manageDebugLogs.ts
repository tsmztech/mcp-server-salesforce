import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { Connection } from "jsforce";

export const MANAGE_DEBUG_LOGS: Tool = {
  name: "salesforce_manage_debug_logs",
  description: `Manage debug logs for Salesforce users - enable, disable, or retrieve logs.
  
Examples:
1. Enable debug logs for a user:
   {
     "operation": "enable",
     "username": "user@example.com",
     "logLevel": "DEBUG",
     "expirationTime": 30
   }

2. Disable debug logs for a user:
   {
     "operation": "disable",
     "username": "user@example.com"
   }

3. Retrieve debug logs for a user:
   {
     "operation": "retrieve",
     "username": "user@example.com",
     "limit": 5
   }

4. Retrieve a specific log with full content:
   {
     "operation": "retrieve",
     "username": "user@example.com",
     "logId": "07L1g000000XXXXEAA0",
     "includeBody": true
   }

Notes:
- The operation must be one of: 'enable', 'disable', or 'retrieve'
- The username parameter is required for all operations
- For 'enable' operation, logLevel is optional (defaults to 'DEBUG')
- Log levels: NONE, ERROR, WARN, INFO, DEBUG, FINE, FINER, FINEST
- expirationTime is optional for 'enable' operation (minutes until expiration, defaults to 30)
- limit is optional for 'retrieve' operation (maximum number of logs to return, defaults to 10)
- logId is optional for 'retrieve' operation (to get a specific log)
- includeBody is optional for 'retrieve' operation (to include the full log content, defaults to false)
- The tool validates that the specified user exists before performing operations
- If logLevel is not specified when enabling logs, the tool will ask for clarification`,
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["enable", "disable", "retrieve"],
        description: "Operation to perform on debug logs"
      },
      username: {
        type: "string",
        description: "Username of the Salesforce user"
      },
      logLevel: {
        type: "string",
        enum: ["NONE", "ERROR", "WARN", "INFO", "DEBUG", "FINE", "FINER", "FINEST"],
        description: "Log level for debug logs (required for 'enable' operation)"
      },
      expirationTime: {
        type: "number",
        description: "Minutes until the debug log configuration expires (optional, defaults to 30)"
      },
      limit: {
        type: "number",
        description: "Maximum number of logs to retrieve (optional, defaults to 10)"
      },
      logId: {
        type: "string",
        description: "ID of a specific log to retrieve (optional)"
      },
      includeBody: {
        type: "boolean",
        description: "Whether to include the full log content (optional, defaults to false)"
      }
    },
    required: ["operation", "username"]
  }
};

export interface ManageDebugLogsArgs {
  operation: 'enable' | 'disable' | 'retrieve';
  username: string;
  logLevel?: 'NONE' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'FINE' | 'FINER' | 'FINEST';
  expirationTime?: number;
  limit?: number;
  logId?: string;
  includeBody?: boolean;
}

/**
 * Handles managing debug logs for Salesforce users
 * @param conn Active Salesforce connection
 * @param args Arguments for managing debug logs
 * @returns Tool response with operation results
 */
export async function handleManageDebugLogs(conn: any, args: ManageDebugLogsArgs) {
  try {
    // Validate inputs
    if (!args.username) {
      throw new Error('username is required');
    }
    
    // Determine if the input is likely a username or a full name
    const isLikelyUsername = args.username.includes('@') || !args.username.includes(' ');
    
    // Build the query based on whether the input looks like a username or a full name
    let userQuery;
    if (isLikelyUsername) {
      // Query by username
      userQuery = await conn.query(`
        SELECT Id, Username, Name, IsActive 
        FROM User 
        WHERE Username = '${args.username}'
      `);
    } else {
      // Query by full name
      userQuery = await conn.query(`
        SELECT Id, Username, Name, IsActive 
        FROM User 
        WHERE Name LIKE '%${args.username}%'
        ORDER BY LastModifiedDate DESC
        LIMIT 5
      `);
    }
    
    if (userQuery.records.length === 0) {
      // If no results with the initial query, try a more flexible search
      userQuery = await conn.query(`
        SELECT Id, Username, Name, IsActive 
        FROM User 
        WHERE Name LIKE '%${args.username}%' 
        OR Username LIKE '%${args.username}%'
        ORDER BY LastModifiedDate DESC
        LIMIT 5
      `);
      
      if (userQuery.records.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: `Error: No user found matching '${args.username}'. Please verify the username or full name and try again.` 
          }],
          isError: true,
        };
      }
      
      // If multiple users found, ask for clarification
      if (userQuery.records.length > 1) {
        let responseText = `Multiple users found matching '${args.username}'. Please specify which user by providing the exact username:\n\n`;
        
        userQuery.records.forEach((user: any) => {
          responseText += `- **${user.Name}** (${user.Username})\n`;
        });
        
        return {
          content: [{ 
            type: "text", 
            text: responseText
          }]
        };
      }
    }
    
    const user = userQuery.records[0];
    
    if (!user.IsActive) {
      return {
        content: [{ 
          type: "text", 
          text: `Warning: User '${args.username}' exists but is inactive. Debug logs may not be generated for inactive users.` 
        }]
      };
    }
    
    // Handle operations
    switch (args.operation) {
      case 'enable': {
        // If logLevel is not provided, we need to ask for it
        if (!args.logLevel) {
          return {
            content: [{ 
              type: "text", 
              text: `Please specify a log level for enabling debug logs. Valid options are: NONE, ERROR, WARN, INFO, DEBUG, FINE, FINER, FINEST.` 
            }],
            isError: true,
          };
        }
        
        // Set default expiration time if not provided
        const expirationTime = args.expirationTime || 30;
        
        // Check if a trace flag already exists for this user
        const existingTraceFlag = await conn.tooling.query(`
          SELECT Id, DebugLevelId FROM TraceFlag 
          WHERE TracedEntityId = '${user.Id}' 
          AND ExpirationDate > ${new Date().toISOString()}
        `);
        
        let traceFlagId;
        let debugLevelId;
        let operation;
        
        // Calculate expiration date
        const expirationDate = new Date();
        expirationDate.setMinutes(expirationDate.getMinutes() + expirationTime);
        
        if (existingTraceFlag.records.length > 0) {
          // Update existing trace flag
          traceFlagId = existingTraceFlag.records[0].Id;
          debugLevelId = existingTraceFlag.records[0].DebugLevelId;
          
          await conn.tooling.sobject('TraceFlag').update({
            Id: traceFlagId,
            LogType: 'USER_DEBUG',
            StartDate: new Date().toISOString(),
            ExpirationDate: expirationDate.toISOString()
          });
          operation = 'updated';
        } else {
          // Create a new debug level with the correct field names
          const debugLevelResult = await conn.tooling.sobject('DebugLevel').create({
            DeveloperName: `UserDebug_${Date.now()}`,
            MasterLabel: `User Debug ${user.Username}`,
            ApexCode: args.logLevel,
            ApexProfiling: args.logLevel,
            Callout: args.logLevel,
            Database: args.logLevel,
            System: args.logLevel,
            Validation: args.logLevel,
            Visualforce: args.logLevel,
            Workflow: args.logLevel
          });
          
          debugLevelId = debugLevelResult.id;
          
          // Create a new trace flag
          const traceFlagResult = await conn.tooling.sobject('TraceFlag').create({
            TracedEntityId: user.Id,
            DebugLevelId: debugLevelId,
            LogType: 'USER_DEBUG',
            StartDate: new Date().toISOString(),
            ExpirationDate: expirationDate.toISOString()
          });
          
          traceFlagId = traceFlagResult.id;
          operation = 'enabled';
        }
        
        return {
          content: [{ 
            type: "text", 
            text: `Successfully ${operation} debug logs for user '${args.username}'.\n\n` +
                  `**Log Level:** ${args.logLevel}\n` +
                  `**Expiration:** ${expirationDate.toLocaleString()} (${expirationTime} minutes from now)\n` +
                  `**Trace Flag ID:** ${traceFlagId}`
          }]
        };
      }
      
      case 'disable': {
        // Find all active trace flags for this user
        const traceFlags = await conn.tooling.query(`
          SELECT Id FROM TraceFlag WHERE TracedEntityId = '${user.Id}' AND ExpirationDate > ${new Date().toISOString()}
        `);
        
        if (traceFlags.records.length === 0) {
          return {
            content: [{ 
              type: "text", 
              text: `No active debug logs found for user '${args.username}'.` 
            }]
          };
        }
        
        try {
          // Delete trace flags instead of updating expiration date
          const traceFlagIds = traceFlags.records.map((tf: any) => tf.Id);
          const deleteResults = await Promise.all(
            traceFlagIds.map((id: string) => 
              conn.tooling.sobject('TraceFlag').delete(id)
            )
          );
          
          return {
            content: [{ 
              type: "text", 
              text: `Successfully disabled ${traceFlagIds.length} debug log configuration(s) for user '${args.username}' by removing them.` 
            }]
          };
        } catch (deleteError) {
          console.error('Error deleting trace flags:', deleteError);
          
          // Fallback to setting a future expiration date if delete fails
          try {
            // Set expiration date to 5 minutes in the future to satisfy Salesforce's requirement
            const nearFutureExpiration = new Date();
            nearFutureExpiration.setMinutes(nearFutureExpiration.getMinutes() + 5);
            
            const traceFlagIds = traceFlags.records.map((tf: any) => tf.Id);
            const updateResults = await Promise.all(
              traceFlagIds.map((id: string) => 
                conn.tooling.sobject('TraceFlag').update({
                  Id: id,
                  ExpirationDate: nearFutureExpiration.toISOString()
                })
              )
            );
            
            return {
              content: [{ 
                type: "text", 
                text: `Successfully disabled ${traceFlagIds.length} debug log configuration(s) for user '${args.username}'. They will expire in 5 minutes.` 
              }]
            };
          } catch (updateError) {
            console.error('Error updating trace flags:', updateError);
            throw new Error(`Could not disable debug logs: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`);
          }
        }
      }
      
      case 'retrieve': {
        // Set default limit if not provided
        const limit = args.limit || 10;
        
        // If a specific log ID is provided, retrieve that log directly
        if (args.logId) {
          try {
            // First check if the log exists
            const logQuery = await conn.tooling.query(`
              SELECT Id, LogUserId, Operation, Application, Status, LogLength, LastModifiedDate, Request
              FROM ApexLog 
              WHERE Id = '${args.logId}'
            `);
            
            if (logQuery.records.length === 0) {
              return {
                content: [{ 
                  type: "text", 
                  text: `No log found with ID '${args.logId}'.` 
                }]
              };
            }
            
            const log = logQuery.records[0];
            
            // If includeBody is true, retrieve the log body
            if (args.includeBody) {
              try {
                // Retrieve the log body
                const logBody = await conn.tooling.request({
                  method: 'GET',
                  url: `${conn.instanceUrl}/services/data/v58.0/tooling/sobjects/ApexLog/${log.Id}/Body`
                });
                
                let responseText = `**Log Details:**\n\n`;
                responseText += `- **ID:** ${log.Id}\n`;
                responseText += `- **Operation:** ${log.Operation}\n`;
                responseText += `- **Application:** ${log.Application}\n`;
                responseText += `- **Status:** ${log.Status}\n`;
                responseText += `- **Size:** ${log.LogLength} bytes\n`;
                responseText += `- **Date:** ${new Date(log.LastModifiedDate).toLocaleString()}\n\n`;
                responseText += `**Log Body:**\n\`\`\`\n${logBody}\n\`\`\`\n`;
                
                return {
                  content: [{ 
                    type: "text", 
                    text: responseText
                  }]
                };
              } catch (logError) {
                console.error('Error retrieving log body:', logError);
                return {
                  content: [{ 
                    type: "text", 
                    text: `Error retrieving log body: ${logError instanceof Error ? logError.message : String(logError)}` 
                  }],
                  isError: true
                };
              }
            } else {
              // Just return the log metadata
              let responseText = `**Log Details:**\n\n`;
              responseText += `- **ID:** ${log.Id}\n`;
              responseText += `- **Operation:** ${log.Operation}\n`;
              responseText += `- **Application:** ${log.Application}\n`;
              responseText += `- **Status:** ${log.Status}\n`;
              responseText += `- **Size:** ${log.LogLength} bytes\n`;
              responseText += `- **Date:** ${new Date(log.LastModifiedDate).toLocaleString()}\n\n`;
              responseText += `To view the full log content, add "includeBody": true to your request.`;
              
              return {
                content: [{ 
                  type: "text", 
                  text: responseText
                }]
              };
            }
          } catch (error) {
            console.error('Error retrieving log:', error);
            return {
              content: [{ 
                type: "text", 
                text: `Error retrieving log: ${error instanceof Error ? error.message : String(error)}` 
              }],
              isError: true,
            };
          }
        }
        
        // Query for logs
        const logs = await conn.tooling.query(`
          SELECT Id, LogUserId, Operation, Application, Status, LogLength, LastModifiedDate, Request
          FROM ApexLog 
          WHERE LogUserId = '${user.Id}'
          ORDER BY LastModifiedDate DESC 
          LIMIT ${limit}
        `);
        
        if (logs.records.length === 0) {
          return {
            content: [{ 
              type: "text", 
              text: `No debug logs found for user '${args.username}'.` 
            }]
          };
        }
        
        // Format log information
        let responseText = `Found ${logs.records.length} debug logs for user '${args.username}':\n\n`;
        
        for (let i = 0; i < logs.records.length; i++) {
          const log = logs.records[i];
          
          responseText += `**Log ${i + 1}**\n`;
          responseText += `- **ID:** ${log.Id}\n`;
          responseText += `- **Operation:** ${log.Operation}\n`;
          responseText += `- **Application:** ${log.Application}\n`;
          responseText += `- **Status:** ${log.Status}\n`;
          responseText += `- **Size:** ${log.LogLength} bytes\n`;
          responseText += `- **Date:** ${new Date(log.LastModifiedDate).toLocaleString()}\n\n`;
        }
        
        // Add a note about viewing specific logs with full content
        responseText += `To view a specific log with full content, use:\n\`\`\`\n`;
        responseText += `{\n`;
        responseText += `  "operation": "retrieve",\n`;
        responseText += `  "username": "${args.username}",\n`;
        responseText += `  "logId": "<LOG_ID>",\n`;
        responseText += `  "includeBody": true\n`;
        responseText += `}\n\`\`\`\n`;
        
        return {
          content: [{ 
            type: "text", 
            text: responseText
          }]
        };
      }
      
      default:
        throw new Error(`Invalid operation: ${args.operation}. Must be 'enable', 'disable', or 'retrieve'.`);
    }
  } catch (error) {
    console.error('Error managing debug logs:', error);
    return {
      content: [{ 
        type: "text", 
        text: `Error managing debug logs: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true,
    };
  }
}
