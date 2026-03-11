# Migration Guide: OAuth_2_0_Web_Server → OAuth_2_0_Authorization_Code

## Overview

The OAuth browser-based authentication has been renamed from `OAuth_2_0_Web_Server` to `OAuth_2_0_Authorization_Code` to align with OAuth 2.0 standard terminology (RFC 6749).

**This is a naming change only** - the functionality remains identical.

---

## What Changed

### Before (Old Naming)
```typescript
ConnectionType.OAuth_2_0_Web_Server
```

### After (New Naming - Standards Compliant)
```typescript
ConnectionType.OAuth_2_0_Authorization_Code
```

---

## Migration Steps

### Step 1: Update Environment Variable

**Old Configuration:**
```bash
SALESFORCE_CONNECTION_TYPE=OAuth_2.0_Web_Server
```

**New Configuration:**
```bash
SALESFORCE_CONNECTION_TYPE=OAuth_2.0_Authorization_Code
```

### Step 2: Update Claude Desktop Config

**Old `claude_desktop_config.json`:**
```json
{
  "mcpServers": {
    "salesforce": {
      "command": "npx",
      "args": ["-y", "@tsmztech/mcp-server-salesforce"],
      "env": {
        "SALESFORCE_CONNECTION_TYPE": "OAuth_2.0_Web_Server",
        "SALESFORCE_CLIENT_ID": "your_client_id",
        "SALESFORCE_CLIENT_SECRET": "your_client_secret",
        "SALESFORCE_INSTANCE_URL": "https://your-domain.my.salesforce.com"
      }
    }
  }
}
```

**New `claude_desktop_config.json`:**
```json
{
  "mcpServers": {
    "salesforce": {
      "command": "npx",
      "args": ["-y", "@tsmztech/mcp-server-salesforce"],
      "env": {
        "SALESFORCE_CONNECTION_TYPE": "OAuth_2.0_Authorization_Code",
        "SALESFORCE_CLIENT_ID": "your_client_id",
        "SALESFORCE_CLIENT_SECRET": "your_client_secret",
        "SALESFORCE_INSTANCE_URL": "https://your-domain.my.salesforce.com"
      }
    }
  }
}
```

### Step 3: Restart Claude Desktop

After updating the configuration:
1. Save the `claude_desktop_config.json` file
2. Quit Claude Desktop completely
3. Restart Claude Desktop

---

## No Token Migration Needed

✅ **Your existing tokens will continue to work!**

The token storage location remains the same:
- `~/.mcp-salesforce/oauth-tokens.json`

No need to re-authenticate unless you want to.

---

## Why This Change?

### Standards Compliance
- **OAuth 2.0 RFC 6749** defines this flow as "Authorization Code Grant"
- "Web Server Flow" is Salesforce-specific terminology
- Makes the codebase more accessible to OAuth developers

### Better Documentation
- Easier to find resources and examples
- Aligns with industry-standard OAuth documentation
- Clearer for developers familiar with OAuth 2.0

### Future-Proof
- Follows established standards
- Better for long-term maintenance
- Easier integration with OAuth libraries

---

## Backward Compatibility

⚠️ **Breaking Change Notice**

The old enum value `OAuth_2_0_Web_Server` has been removed. If you're using this in code:

**Old Code:**
```typescript
if (connectionType === ConnectionType.OAuth_2_0_Web_Server) {
  // ...
}
```

**New Code:**
```typescript
if (connectionType === ConnectionType.OAuth_2_0_Authorization_Code) {
  // ...
}
```

---

## Quick Reference

| Aspect | Old | New |
|--------|-----|-----|
| **Enum Value** | `OAuth_2_0_Web_Server` | `OAuth_2_0_Authorization_Code` |
| **String Value** | `"OAuth_2.0_Web_Server"` | `"OAuth_2.0_Authorization_Code"` |
| **Functionality** | Browser-based OAuth | Browser-based OAuth (same) |
| **Token Storage** | `~/.mcp-salesforce/` | `~/.mcp-salesforce/` (same) |
| **Okta Support** | ✅ Yes | ✅ Yes (same) |

---

## Troubleshooting

### Error: "Unknown connection type"

**Cause:** Using old enum value `OAuth_2.0_Web_Server`

**Solution:** Update to `OAuth_2.0_Authorization_Code` in your configuration

### Tokens Not Working

**Unlikely**, but if you experience issues:

1. Delete existing tokens:
   ```bash
   rm ~/.mcp-salesforce/oauth-tokens.json
   ```

2. Restart Claude Desktop

3. Re-authenticate (browser will open automatically)

---

## Need Help?

- 📖 See `docs/OKTA_SETUP.md` for detailed setup instructions
- 📖 See `README.md` for configuration examples
- 📖 See `OAUTH_IMPLEMENTATION_SUMMARY.md` for technical details

---

## Summary

**Simple 2-Step Migration:**

1. Change `OAuth_2.0_Web_Server` → `OAuth_2.0_Authorization_Code` in config
2. Restart Claude Desktop

**That's it!** Your existing tokens and setup will continue to work.

