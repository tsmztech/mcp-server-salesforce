import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { Connection } from "jsforce";

export const EXECUTE_ANONYMOUS: Tool = {
  name: "salesforce_execute_anonymous",
  description: `Execute anonymous Apex code in Salesforce.
  
Examples:
1. Execute simple Apex code:
   {
     "apexCode": "System.debug('Hello World');"
   }

2. Execute Apex code with variables:
   {
     "apexCode": "List<Account> accounts = [SELECT Id, Name FROM Account LIMIT 5]; for(Account a : accounts) { System.debug(a.Name); }"
   }

3. Execute Apex with debug logs:
   {
     "apexCode": "System.debug(LoggingLevel.INFO, 'Processing accounts...'); List<Account> accounts = [SELECT Id FROM Account LIMIT 10]; System.debug(LoggingLevel.INFO, 'Found ' + accounts.size() + ' accounts');",
     "logLevel": "DEBUG"
   }

Notes:
- The apexCode parameter is required and must contain valid Apex code
- The code is executed in an anonymous context and does not persist
- The logLevel parameter is optional (defaults to 'DEBUG')
- Execution results include compilation success/failure, execution success/failure, and debug logs
- For security reasons, some operations may be restricted based on user permissions
- This tool can be used for data operations or updates when there are no other specific tools available
- When users request data queries or updates that aren't directly supported by other tools, this tool can be used if the operation is achievable using Apex code
`,
  inputSchema: {
    type: "object",
    properties: {
      apexCode: {
        type: "string",
        description: "Apex code to execute anonymously"
      },
      logLevel: {
        type: "string",
        enum: ["NONE", "ERROR", "WARN", "INFO", "DEBUG", "FINE", "FINER", "FINEST"],
        description: "Log level for debug logs (optional, defaults to DEBUG)"
      }
    },
    required: ["apexCode"]
  }
};

export interface ExecuteAnonymousArgs {
  apexCode: string;
  logLevel?: 'NONE' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'FINE' | 'FINER' | 'FINEST';
}

/**
 * Handles executing anonymous Apex code in Salesforce
 * @param conn Active Salesforce connection
 * @param args Arguments for executing anonymous Apex
 * @returns Tool response with execution results and debug logs
 */
export async function handleExecuteAnonymous(conn: any, args: ExecuteAnonymousArgs) {
  try {
    // Validate inputs
    if (!args.apexCode || args.apexCode.trim() === '') {
      throw new Error('apexCode is required and cannot be empty');
    }
    
    console.error(`Executing anonymous Apex code`);
    
    // Set default log level if not provided
    const logLevel = args.logLevel || 'DEBUG';
    
    // Execute the anonymous Apex code
    const result = await conn.tooling.executeAnonymous(args.apexCode);
    
    // Format the response
    let responseText = '';
    
    // Add compilation and execution status
    if (result.compiled) {
      responseText += `**Compilation:** Success\n`;
    } else {
      responseText += `**Compilation:** Failed\n`;
      responseText += `**Line:** ${result.line}\n`;
      responseText += `**Column:** ${result.column}\n`;
      responseText += `**Error:** ${result.compileProblem}\n\n`;
    }
    
    if (result.compiled && result.success) {
      responseText += `**Execution:** Success\n`;
    } else if (result.compiled) {
      responseText += `**Execution:** Failed\n`;
      responseText += `**Error:** ${result.exceptionMessage}\n`;
      if (result.exceptionStackTrace) {
        responseText += `**Stack Trace:**\n\`\`\`\n${result.exceptionStackTrace}\n\`\`\`\n\n`;
      }
    }
    
    // Get debug logs if available
    if (result.compiled) {
      try {
        // Query for the most recent debug log
        const logs = await conn.query(`
          SELECT Id, LogUserId, Operation, Application, Status, LogLength, LastModifiedDate, Request
          FROM ApexLog 
          ORDER BY LastModifiedDate DESC 
          LIMIT 1
        `);
        
        if (logs.records.length > 0) {
          const logId = logs.records[0].Id;
          
          // Retrieve the log body
          const logBody = await conn.tooling.request({
            method: 'GET',
            url: `${conn.instanceUrl}/services/data/v58.0/tooling/sobjects/ApexLog/${logId}/Body`
          });
          
          responseText += `\n**Debug Log:**\n\`\`\`\n${logBody}\n\`\`\``;
        } else {
          responseText += `\n**Debug Log:** No logs available. Ensure debug logs are enabled for your user.`;
        }
      } catch (logError) {
        responseText += `\n**Debug Log:** Unable to retrieve debug logs: ${logError instanceof Error ? logError.message : String(logError)}`;
      }
    }
    
    return {
      content: [{ 
        type: "text", 
        text: responseText
      }]
    };
  } catch (error) {
    console.error('Error executing anonymous Apex:', error);
    return {
      content: [{ 
        type: "text", 
        text: `Error executing anonymous Apex: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true,
    };
  }
}
