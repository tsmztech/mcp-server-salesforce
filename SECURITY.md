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

## Security Controls

### Input Sanitization
- **SOQL injection prevention:** All string values interpolated into SOQL queries are escaped using `escapeSoqlValue()` (doubles single quotes). Salesforce object names, field names, and identifiers are validated against a strict pattern before use in queries.
- **SOSL injection prevention:** Search terms are escaped using `escapeSoslSearchTerm()` which backslash-escapes all SOSL reserved characters before interpolation into FIND clauses.
- **Regex injection prevention:** User-supplied strings used in RegExp constructors are escaped with `escapeRegExpInput()` and validated as Salesforce identifiers first.

### Credential Protection
- Access tokens are never logged. CLI output is parsed and redacted before logging — only username, instance URL, and alias are logged.
- Error messages are sanitized to avoid leaking credentials, tokens, or internal CLI output.
- The `.gitignore` covers all `.env*` variants to prevent accidental credential commits.

### Connection Security
- The Salesforce CLI is invoked via `execFile` (not `exec`) to eliminate shell injection surface.
- OAuth token requests have a 30-second timeout.

### Audit Logging
- Anonymous Apex code execution is audit-logged to stderr with timestamp, code length, and a truncated preview.
- Apex code is limited to 100,000 characters per execution.

### Trust Boundaries
- `whereClause`, `orderBy`, `havingClause`, and `booleanFilter` parameters are raw query fragments by design — they cannot be sanitized without breaking legitimate queries. Salesforce's own SOQL parser provides a second layer of defense, and the connected user's permissions limit what can be accessed.
- The `salesforce_rest_api` tool is an intentional passthrough to the full Salesforce REST API surface. Access is governed by the connected Salesforce user's permissions.
- The `salesforce_execute_anonymous` tool runs arbitrary Apex code. Access is governed by the connected user's Apex execution permissions.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |
| < 1.0   | :x:                |

---

*Please do not publicly disclose vulnerabilities until we've had a chance to address them.*