import https from 'https';
import http from 'http';
import querystring from 'querystring';
import { URL } from 'url';
import { OAuthTokens } from '../types/connection.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Generate the OAuth authorization URL for browser-based login
 */
export function generateAuthorizationUrl(
  loginUrl: string,
  clientId: string,
  redirectUri: string,
  state?: string
): string {
  const authUrl = new URL('/services/oauth2/authorize', loginUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  if (state) {
    authUrl.searchParams.set('state', state);
  }
  // Request offline access to get refresh token
  authUrl.searchParams.set('prompt', 'login consent');
  
  return authUrl.toString();
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  loginUrl: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string
): Promise<OAuthTokens> {
  const tokenUrl = new URL('/services/oauth2/token', loginUrl);
  
  const requestBody = querystring.stringify({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code: code
  });
  
  return makeTokenRequest(tokenUrl, requestBody);
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  loginUrl: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<OAuthTokens> {
  const tokenUrl = new URL('/services/oauth2/token', loginUrl);
  
  const requestBody = querystring.stringify({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
  });
  
  return makeTokenRequest(tokenUrl, requestBody);
}

/**
 * Make HTTP request to token endpoint
 */
async function makeTokenRequest(tokenUrl: URL, requestBody: string): Promise<OAuthTokens> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'POST',
      hostname: tokenUrl.hostname,
      path: tokenUrl.pathname + tokenUrl.search,
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
            reject(new Error(`OAuth token request failed: ${parsedData.error} - ${parsedData.error_description || ''}`));
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
}

/**
 * Start a local HTTP server to receive the OAuth callback
 */
export async function startCallbackServer(port: number = 3000): Promise<{ server: http.Server; code: Promise<string> }> {
  let resolveCode: (code: string) => void;
  let rejectCode: (error: Error) => void;
  
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '', `http://localhost:${port}`);

    if (url.pathname === '/oauth/callback') {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<html><body><h1>Authentication Failed</h1><p>${error}: ${errorDescription}</p></body></html>`);
        rejectCode(new Error(`OAuth error: ${error} - ${errorDescription}`));
      } else if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Authentication Successful!</h1><p>You can close this window and return to the application.</p></body></html>');
        resolveCode(code);
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Invalid Request</h1><p>No authorization code received.</p></body></html>');
        rejectCode(new Error('No authorization code received'));
      }
    }
  });

  server.listen(port);

  return { server, code: codePromise };
}

/**
 * Get the token storage file path
 */
function getTokenStoragePath(): string {
  const homeDir = os.homedir();
  const configDir = path.join(homeDir, '.mcp-salesforce');

  // Create directory if it doesn't exist
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  return path.join(configDir, 'oauth-tokens.json');
}

/**
 * Save OAuth tokens to file
 */
export function saveTokens(tokens: OAuthTokens): void {
  const tokenPath = getTokenStoragePath();
  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2), 'utf-8');
  // Set file permissions to be readable/writable only by owner
  fs.chmodSync(tokenPath, 0o600);
}

/**
 * Load OAuth tokens from file
 */
export function loadTokens(): OAuthTokens | null {
  const tokenPath = getTokenStoragePath();

  if (!fs.existsSync(tokenPath)) {
    return null;
  }

  try {
    const data = fs.readFileSync(tokenPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load OAuth tokens:', error);
    return null;
  }
}

/**
 * Clear stored OAuth tokens
 */
export function clearTokens(): void {
  const tokenPath = getTokenStoragePath();

  if (fs.existsSync(tokenPath)) {
    fs.unlinkSync(tokenPath);
  }
}

