import jsforce from 'jsforce';
import { ConnectionType, ConnectionConfig, SalesforceCLIResponse } from '../types/connection.js';
import https from 'https';
import querystring from 'querystring';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { redactSensitiveFields } from './logging.js';

const execFileAsync = promisify(execFile);

const CONNECTION_TIMEOUT = 60000; // 60 seconds for API calls
const OAUTH_TIMEOUT = 30000; // 30 seconds for OAuth token request

/**
 * Executes the Salesforce CLI command to get org information
 * @returns Parsed response from sf org display --json command
 */
async function getSalesforceOrgInfo(): Promise<SalesforceCLIResponse> {
  try {
    console.error(`Executing Salesforce CLI: sf org display --json`);

    let stdout = '';
    let stderr = '';
    let execError: Error | null = null;
    try {
      // Use execFile instead of exec to avoid shell injection surface
      const result = await execFileAsync('sf', ['org', 'display', '--json']);
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (err: any) {
      execError = err;
      stdout = 'stdout' in err ? err.stdout || '' : '';
      stderr = 'stderr' in err ? err.stderr || '' : '';
    }

    // Parse JSON — log redacted version only
    let response: SalesforceCLIResponse;
    try {
      response = JSON.parse(stdout);
    } catch (parseErr) {
      throw new Error('Failed to parse Salesforce CLI output. Ensure sf CLI is installed and configured correctly.');
    }

    // Log redacted org info (never log accessToken)
    if (response.result) {
      const safeResult = redactSensitiveFields(
        response.result as unknown as Record<string, unknown>,
        ['accessToken']
      );
      console.error('[Salesforce CLI] Org info:', JSON.stringify(safeResult));
    }

    if (execError || response.status !== 0) {
      throw new Error(`Salesforce CLI command failed (status: ${response.status}). Run "sf org display" manually to diagnose.`);
    }

    if (!response.result || !response.result.accessToken || !response.result.instanceUrl) {
      throw new Error('Salesforce CLI did not return valid credentials. Run "sf org display --json" to verify.');
    }

    return response;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('ENOENT') || error.message.includes('sf: command not found') || error.message.includes("'sf' is not recognized")) {
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
  const connectionType = config?.type ||
    (process.env.SALESFORCE_CONNECTION_TYPE as ConnectionType) ||
    ConnectionType.User_Password;

  const loginUrl = config?.loginUrl ||
    process.env.SALESFORCE_INSTANCE_URL ||
    'https://login.salesforce.com';

  try {
    if (connectionType === ConnectionType.OAuth_2_0_Client_Credentials) {
      const clientId = process.env.SALESFORCE_CLIENT_ID;
      const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error('SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET are required for OAuth 2.0 Client Credentials Flow');
      }

      console.error('Connecting to Salesforce using OAuth 2.0 Client Credentials Flow');

      const instanceUrl = loginUrl;
      const tokenUrl = new URL('/services/oauth2/token', instanceUrl);

      const requestBody = querystring.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      });

      const tokenResponse = await new Promise<any>((resolve, reject) => {
        const req = https.request({
          method: 'POST',
          hostname: tokenUrl.hostname,
          path: tokenUrl.pathname,
          timeout: OAUTH_TIMEOUT,
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
                reject(new Error(`OAuth token request failed: ${parsedData.error}`));
              } else {
                resolve(parsedData);
              }
            } catch (e: unknown) {
              reject(new Error('Failed to parse OAuth response.'));
            }
          });
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('OAuth token request timed out.'));
        });

        req.on('error', (e) => {
          reject(new Error(`OAuth request error: ${e.message}`));
        });

        req.write(requestBody);
        req.end();
      });

      const conn = new jsforce.Connection({
        instanceUrl: tokenResponse.instance_url,
        accessToken: tokenResponse.access_token,
        maxRequest: 10,
      });

      return conn;
    } else if (connectionType === ConnectionType.Salesforce_CLI) {
      console.error('Connecting to Salesforce using Salesforce CLI authentication');

      const orgInfo = await getSalesforceOrgInfo();

      const conn = new jsforce.Connection({
        instanceUrl: orgInfo.result.instanceUrl,
        accessToken: orgInfo.result.accessToken,
        maxRequest: 10,
      });

      console.error(`Connected to Salesforce org: ${orgInfo.result.username} (${orgInfo.result.alias || 'No alias'})`);

      return conn;
    } else {
      const username = process.env.SALESFORCE_USERNAME;
      const password = process.env.SALESFORCE_PASSWORD;
      const token = process.env.SALESFORCE_TOKEN;

      if (!username || !password) {
        throw new Error('SALESFORCE_USERNAME and SALESFORCE_PASSWORD are required for Username/Password authentication');
      }

      console.error('Connecting to Salesforce using Username/Password authentication');

      const conn = new jsforce.Connection({
        loginUrl,
        maxRequest: 10,
      });

      await conn.login(
        username,
        password + (token || '')
      );

      return conn;
    }
  } catch (error) {
    // Log error type only — never log credentials or tokens
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error connecting to Salesforce:', msg);
    throw error;
  }
}
