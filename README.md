# Salesforce MCP Server

An MCP (Model Context Protocol) server implementation that integrates Claude with Salesforce, enabling natural language interactions with your Salesforce data and metadata. This server allows Claude to query, modify, and manage your Salesforce objects and records using everyday language.

<a href="https://glama.ai/mcp/servers/kqeniawbr6">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/kqeniawbr6/badge" alt="Salesforce Server MCP server" />
</a>

## Features

* **Object and Field Management**: Create and modify custom objects and fields using natural language
* **Smart Object Search**: Find Salesforce objects using partial name matches
* **Detailed Schema Information**: Get comprehensive field and relationship details for any object
* **Flexible Data Queries**: Query records with relationship support and complex filters
* **Data Manipulation**: Insert, update, delete, and upsert records with ease
* **Cross-Object Search**: Search across multiple objects using SOSL
* **Apex Code Management**: Read, create, and update Apex classes
* **Intuitive Error Handling**: Clear feedback with Salesforce-specific error details

## Installation

```bash
npm install -g @tsmztech/mcp-server-salesforce
```

## Tools

### salesforce_search_objects
Search for standard and custom objects:
* Search by partial name matches
* Finds both standard and custom objects
* Example: "Find objects related to Account" will find Account, AccountHistory, etc.

### salesforce_describe_object
Get detailed object schema information:
* Field definitions and properties
* Relationship details
* Picklist values
* Example: "Show me all fields in the Account object"

### salesforce_query_records
Query records with relationship support:
* Parent-to-child relationships
* Child-to-parent relationships
* Complex WHERE conditions
* Example: "Get all Accounts with their related Contacts"

### salesforce_dml_records
Perform data operations:
* Insert new records
* Update existing records
* Delete records
* Upsert using external IDs
* Example: "Update status of multiple accounts"

### salesforce_manage_object
Create and modify custom objects:
* Create new custom objects
* Update object properties
* Configure sharing settings
* Example: "Create a Customer Feedback object"

### salesforce_manage_field
Manage object fields:
* Add new custom fields
* Modify field properties
* Create relationships
* Example: "Add a Rating picklist field to Account"

### salesforce_search_all
Search across multiple objects:
* SOSL-based search
* Multiple object support
* Field snippets
* Example: "Search for 'cloud' across Accounts and Opportunities"

### salesforce_read_apex
Read Apex classes:
* Get full source code of specific classes
* List classes matching name patterns
* View class metadata (API version, status, etc.)
* Support for wildcards (* and ?) in name patterns
* Example: "Show me the AccountController class" or "Find all classes matching Account*Cont*"

### salesforce_write_apex
Create and update Apex classes:
* Create new Apex classes
* Update existing class implementations
* Specify API versions
* Example: "Create a new Apex class for handling account operations"

## Setup

### Salesforce Authentication
You can connect to Salesforce using one of two authentication methods:

#### 1. Username/Password Authentication (Default)
1. Set up your Salesforce credentials
2. Get your security token (Reset from Salesforce Settings)

#### 2. OAuth 2.0 Client Credentials Flow
1. Create a Connected App in Salesforce
2. Enable OAuth settings and select "Client Credentials Flow"
3. Set appropriate scopes (typically "api" is sufficient)
4. Save the Client ID and Client Secret
5. **Important**: Note your instance URL (e.g., `https://your-domain.my.salesforce.com`) as it's required for authentication

### Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

#### For Username/Password Authentication:
```json
{
  "mcpServers": {
    "salesforce": {
      "command": "npx",
      "args": ["-y", "@tsmztech/mcp-server-salesforce"],
      "env": {
        "SALESFORCE_CONNECTION_TYPE": "User_Password",
        "SALESFORCE_USERNAME": "your_username",
        "SALESFORCE_PASSWORD": "your_password",
        "SALESFORCE_TOKEN": "your_security_token",
        "SALESFORCE_INSTANCE_URL": "org_url"        // Optional. Default value: https://login.salesforce.com
      }
    }
  }
}
```

#### For OAuth 2.0 Client Credentials Flow:
```json
{
  "mcpServers": {
    "salesforce": {
      "command": "npx",
      "args": ["-y", "@tsmztech/mcp-server-salesforce"],
      "env": {
        "SALESFORCE_CONNECTION_TYPE": "OAuth_2.0_Client_Credentials",
        "SALESFORCE_CLIENT_ID": "your_client_id",
        "SALESFORCE_CLIENT_SECRET": "your_client_secret",
        "SALESFORCE_INSTANCE_URL": "https://your-domain.my.salesforce.com"  // REQUIRED: Must be your exact Salesforce instance URL
      }
    }
  }
}
```

> **Note**: For OAuth 2.0 Client Credentials Flow, the `SALESFORCE_INSTANCE_URL` must be your exact Salesforce instance URL (e.g., `https://your-domain.my.salesforce.com`). The token endpoint will be constructed as `<instance_url>/services/oauth2/token`.

## Example Usage

### Searching Objects
```
"Find all objects related to Accounts"
"Show me objects that handle customer service"
"What objects are available for order management?"
```

### Getting Schema Information
```
"What fields are available in the Account object?"
"Show me the picklist values for Case Status"
"Describe the relationship fields in Opportunity"
```

### Querying Records
```
"Get all Accounts created this month"
"Show me high-priority Cases with their related Contacts"
"Find all Opportunities over $100k"
```

### Managing Custom Objects
```
"Create a Customer Feedback object"
"Add a Rating field to the Feedback object"
"Update sharing settings for the Service Request object"
```

### Searching Across Objects
```
"Search for 'cloud' in Accounts and Opportunities"
"Find mentions of 'network issue' in Cases and Knowledge Articles"
"Search for customer name across all relevant objects"
```

### Managing Apex Code
```
"Show me all Apex classes with 'Controller' in the name"
"Get the full code for the AccountService class"
"Create a new Apex utility class for handling date operations"
"Update the LeadConverter class to add a new method"
```

## Development

### Building from source
```bash
# Clone the repository
git clone https://github.com/tsmztech/mcp-server-salesforce.git

# Navigate to directory
cd mcp-server-salesforce

# Install dependencies
npm install

# Build the project
npm run build
```

## Contributing
Contributions are welcome! Feel free to submit a Pull Request.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Issues and Support
If you encounter any issues or need support, please file an issue on the [GitHub repository](https://github.com/tsmztech/mcp-server-salesforce/issues).