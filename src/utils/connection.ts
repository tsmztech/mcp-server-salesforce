import jsforce from 'jsforce';
import { ConnectionType, ConnectionConfig, SalesforceCLIResponse } from '../types/connection.js';
import https from 'https';
import querystring from 'querystring';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Executes the Salesforce CLI command to get org information
 * @returns Parsed response from sf org display --json command
 */
async function getSalesforceOrgInfo(): Promise<SalesforceCLIResponse> {
  try {
    const command = 'sf org display --json';
    const cwdLog = process.cwd();
    console.log(`Executing Salesforce CLI command: ${command} in directory: ${cwdLog}`);

    // Use execAsync and handle both success and error cases
    let stdout = '';
    let stderr = '';
    let error: Error | { stdout?: string; stderr?: string } | null = null;
    try {
      const result = await execAsync(command);
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (err: any) {
      // If the command fails, capture stdout/stderr for diagnostics
      error = err;
      stdout = 'stdout' in err ? err.stdout || '' : '';
      stderr = 'stderr' in err ? err.stderr || '' : '';
    }


    // Log always the output for debug
    console.error('[Salesforce CLI] STDOUT:', stdout);
    if (stderr) {
      console.warn('[Salesforce CLI] STDERR:', stderr);
    }
    // Try to parse stdout as JSON
    let response: SalesforceCLIResponse;
    try {
      response = JSON.parse(stdout);
    } catch (parseErr) {
      throw new Error(`Failed to parse Salesforce CLI JSON output.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`);
    }

    // If the command failed (non-zero exit code), throw with details
    if (error || response.status !== 0) {
      throw new Error(`Salesforce CLI command failed.\nStatus: ${response.status}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`);
    }

    // Accept any org that returns accessToken and instanceUrl
    if (!response.result || !response.result.accessToken || !response.result.instanceUrl) {
      throw new Error(`Salesforce CLI did not return accessToken and instanceUrl.\nResult: ${JSON.stringify(response.result)}`);
    }

    return response;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('sf: command not found') || error.message.includes("'sf' is not recognized")) {
        throw new Error('Salesforce CLI (sf) is not installed or not in PATH. Please install the Salesforce CLI to use this authentication method.');
      }
    }
    throw new Error(`Failed to get Salesforce org info: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Creates a Salesforce connection using either username/password or OAuth 2.0 Client Credentials Flow
 * @param config Optional connection configuration
 * @returns Connected jsforce Connection instance
 */
export async function createSalesforceConnection(config?: ConnectionConfig) {
  // Determine connection type from environment variables or config
  const connectionType = config?.type || 
    (process.env.SALESFORCE_CONNECTION_TYPE as ConnectionType) || 
    ConnectionType.User_Password;
  
  // Set login URL from config or environment variable
  const loginUrl = config?.loginUrl || 
    process.env.SALESFORCE_INSTANCE_URL || 
    'https://login.salesforce.com';
  
  try {
    if (process.env.OAUTH_ACCESS_TOKEN) {
      const conn = new jsforce.Connection({
        serverUrl: loginUrl,
        accessToken: process.env.OAUTH_ACCESS_TOKEN
      });
      
      return conn;
    }
    if (connectionType === ConnectionType.OAuth_2_0_Client_Credentials) {
      // OAuth 2.0 Client Credentials Flow
      const clientId = process.env.SALESFORCE_CLIENT_ID;
      const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        throw new Error('SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET are required for OAuth 2.0 Client Credentials Flow');
      }
      
      console.error('Connecting to Salesforce using OAuth 2.0 Client Credentials Flow');
      
      // Get the instance URL from environment variable or config
      const instanceUrl = loginUrl;
      
      // Create the token URL
      const tokenUrl = new URL('/services/oauth2/token', instanceUrl);
      
      // Prepare the request body
      const requestBody = querystring.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      });
      
      // Make the token request
      const tokenResponse = await new Promise<any>((resolve, reject) => {
        const req = https.request({
          method: 'POST',
          hostname: tokenUrl.hostname,
          path: tokenUrl.pathname,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(requestBody)
          }
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const parsedData = JSON.parse(data);
              if (res.statusCode !== 200) {
                reject(new Error(`OAuth token request failed: ${parsedData.error} - ${parsedData.error_description}`));
              } else {
                resolve(parsedData);
              }
            } catch (e: unknown) {
              reject(new Error(`Failed to parse OAuth response: ${e instanceof Error ? e.message : String(e)}`));
            }
          });
        });
        
        req.on('error', (e) => {
          reject(new Error(`OAuth request error: ${e.message}`));
        });
        
        req.write(requestBody);
        req.end();
      });
      
      // Create connection with the access token
      const conn = new jsforce.Connection({
        instanceUrl: tokenResponse.instance_url,
        accessToken: tokenResponse.access_token
      });
      
      return conn;
    } else if (connectionType === ConnectionType.Salesforce_CLI) {
      // Salesforce CLI authentication using sf org display
      console.log('Connecting to Salesforce using Salesforce CLI authentication');
      
      // Execute sf org display --json command
      const orgInfo = await getSalesforceOrgInfo();
      
      // Create connection with the access token from CLI
      const conn = new jsforce.Connection({
        instanceUrl: orgInfo.result.instanceUrl,
        accessToken: orgInfo.result.accessToken
      });
      
      console.log(`Connected to Salesforce org: ${orgInfo.result.username} (${orgInfo.result.alias || 'No alias'})`);
      
      return conn;
    } else {
      // Default: Username/Password Flow with Security Token
      const username = process.env.SALESFORCE_USERNAME;
      const password = process.env.SALESFORCE_PASSWORD;
      const token = process.env.SALESFORCE_TOKEN;
      
      if (!username || !password) {
        throw new Error('SALESFORCE_USERNAME and SALESFORCE_PASSWORD are required for Username/Password authentication');
      }
      
      console.error('Connecting to Salesforce using Username/Password authentication');
      
      // Create connection with login URL
      const conn = new jsforce.Connection({ loginUrl });
      
      await conn.login(
        username,
        password + (token || '')
      );
      
      return conn;
    }
  } catch (error) {
    console.error('Error connecting to Salesforce:', error);
    throw error;
  }
}
