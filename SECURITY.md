# Security Policy

## Reporting Security Vulnerabilities

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

Please use GitHub's private vulnerability reporting:
- Go to the [Security tab](https://github.com/tsmztech/mcp-server-salesforce/security/advisories)
- Click "Report a vulnerability"

This ensures the report stays private until a fix is available.

### Response Timeline

- Initial response: Within 72 hours
- Patch/mitigation: Within 14 days for critical issues

## Important Security Notes

⚠️ **For MCP Server Salesforce users:**
- **NEVER** commit credentials or `.env` files
- **ALWAYS** use Salesforce Sandbox environments for testing
- **NEVER** test with production Salesforce data
- All SOQL inputs are sanitized to prevent injection

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |
| < 1.0   | :x:                |

---

*Please do not publicly disclose vulnerabilities until we've had a chance to address them.*