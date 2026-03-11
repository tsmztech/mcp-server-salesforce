# Setting Up OAuth 2.0 Authorization Code Flow with Okta

This guide walks you through setting up browser-based OAuth authentication for Salesforce MCP Server when your Salesforce org uses Okta for Single Sign-On (SSO).

## Prerequisites

- Salesforce org configured with Okta as the identity provider
- Administrator access to Salesforce to create a Connected App
- Node.js and npm installed on your machine

## Step 1: Create a Connected App in Salesforce

1. Log in to your Salesforce org as an administrator
2. Navigate to **Setup** → **App Manager**
3. Click **New Connected App**
4. Fill in the basic information:
   - **Connected App Name**: `MCP Server OAuth`
   - **API Name**: `MCP_Server_OAuth` (auto-filled)
   - **Contact Email**: Your email address

5. Enable OAuth Settings:
   - Check **Enable OAuth Settings**
   - **Callback URL**: `http://localhost:3000/oauth/callback`
   - **Selected OAuth Scopes**: Add the following:
     - `Access and manage your data (api)`
     - `Perform requests on your behalf at any time (refresh_token, offline_access)`
   - Check **Require Secret for Web Server Flow**
   - Check **Require Secret for Refresh Token Flow**

6. Click **Save** and then **Continue**

7. Note down the following (you'll need these later):
   - **Consumer Key** (this is your Client ID)
   - **Consumer Secret** (this is your Client Secret)
   - Click **Manage Consumer Details** to view the Consumer Secret

## Step 2: Configure the MCP Server

1. Open your Claude Desktop configuration file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add the Salesforce MCP server configuration:

```json
{
  "mcpServers": {
    "salesforce": {
      "command": "npx",
      "args": ["-y", "@tsmztech/mcp-server-salesforce"],
      "env": {
        "SALESFORCE_CONNECTION_TYPE": "OAuth_2.0_Authorization_Code",
        "SALESFORCE_CLIENT_ID": "YOUR_CONSUMER_KEY_HERE",
        "SALESFORCE_CLIENT_SECRET": "YOUR_CONSUMER_SECRET_HERE",
        "SALESFORCE_INSTANCE_URL": "https://your-domain.my.salesforce.com",
        "SALESFORCE_REDIRECT_URI": "http://localhost:3000/oauth/callback"
      }
    }
  }
}
```

3. Replace the placeholders:
   - `YOUR_CONSUMER_KEY_HERE`: Paste your Consumer Key from Step 1
   - `YOUR_CONSUMER_SECRET_HERE`: Paste your Consumer Secret from Step 1
   - `https://your-domain.my.salesforce.com`: Your Salesforce instance URL

4. Save the file

## Step 3: First-Time Authentication

1. Restart Claude Desktop

2. When you first interact with Salesforce through Claude:
   - The MCP server will automatically open your default browser
   - You'll be redirected to your Okta login page
   - Enter your Okta credentials
   - After successful authentication, you'll see "Authentication Successful!" in the browser
   - You can close the browser window

3. The authentication tokens are now saved locally at:
   - `~/.mcp-salesforce/oauth-tokens.json`

4. Future sessions will automatically use the saved tokens (no browser popup needed)

## Step 4: Using the MCP Server

You can now use Claude to interact with your Salesforce org:

```
"Show me all Account records created this week"
"What fields are available on the Contact object?"
"Create a new Lead with email john@example.com"
```

## Troubleshooting

### Browser doesn't open automatically
If the browser doesn't open automatically, check the Claude Desktop logs for the authorization URL and open it manually in your browser.

### "Invalid redirect URI" error
Make sure the redirect URI in your Connected App settings exactly matches the one in your configuration (default: `http://localhost:3000/oauth/callback`).

### Token expired or authentication failed
Delete the token file and re-authenticate:
```bash
rm ~/.mcp-salesforce/oauth-tokens.json
```
Then restart Claude Desktop.

### Port 3000 already in use
If port 3000 is already in use, you can change the redirect URI:
1. Update your Connected App callback URL to use a different port (e.g., `http://localhost:3001/oauth/callback`)
2. Update `SALESFORCE_REDIRECT_URI` in your configuration to match

### Okta session timeout
If your Okta session expires, you'll need to re-authenticate. Simply delete the token file and restart Claude Desktop.

## Security Best Practices

1. **Never share your Consumer Secret** - treat it like a password
2. **Token storage** - tokens are stored with restricted file permissions (owner read/write only)
3. **Regular rotation** - consider rotating your Connected App credentials periodically
4. **IP restrictions** - you can add IP restrictions to your Connected App in Salesforce for additional security
5. **Monitor usage** - regularly review your Connected App usage in Salesforce Setup

## Additional Resources

- [Salesforce OAuth 2.0 Web Server Flow](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_web_server_flow.htm)
- [Okta Salesforce Integration](https://help.okta.com/en-us/content/topics/apps/apps_salesforce.htm)
- [MCP Server Salesforce GitHub](https://github.com/tsmztech/mcp-server-salesforce)

