/**
 * Enum representing the available Salesforce connection types
 */
export enum ConnectionType {
  /**
   * Standard username/password authentication with security token
   * Requires SALESFORCE_USERNAME, SALESFORCE_PASSWORD, and optionally SALESFORCE_TOKEN
   */
  User_Password = 'User_Password',
  
  /**
   * OAuth 2.0 Client Credentials Flow using client ID and secret
   * Requires SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET
   */
  OAuth_2_0_Client_Credentials = 'OAuth_2.0_Client_Credentials',
  
  /**
   * Salesforce CLI authentication using sf org display command
   * Requires Salesforce CLI to be installed and an authenticated org
   */
  Salesforce_CLI = 'Salesforce_CLI'
}

/**
 * Configuration options for Salesforce connection
 */
export interface ConnectionConfig {
  /**
   * The type of connection to use
   * @default ConnectionType.User_Password
   */
  type?: ConnectionType;
  
  /**
   * The login URL for Salesforce instance
   * @default 'https://login.salesforce.com'
   */
  loginUrl?: string;
}

/**
 * Interface for Salesforce CLI org display response
 */
export interface SalesforceCLIResponse {
  status: number;
  result: {
    id: string;
    apiVersion: string;
    accessToken: string;
    instanceUrl: string;
    username: string;
    clientId: string;
    connectedStatus: string;
    alias?: string;
  };
  warnings?: string[];
}
