# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

- `npm run build` — Compile TypeScript and make dist files executable
- `npm run watch` — Watch mode for TypeScript compilation
- `npm test` — Run tests using Node.js built-in test runner (`node --test`)
- `npm run prepare` — Runs build automatically before `npm publish`

## Architecture

This is an MCP (Model Context Protocol) server that exposes Salesforce operations as tools to Claude via stdio transport. It uses `@modelcontextprotocol/sdk` for the MCP protocol and `jsforce` for Salesforce API calls.

### Three-Layer Structure

1. **Transport** — `StdioServerTransport` handles JSON-RPC over stdin/stdout
2. **Routing** — `src/index.ts` registers all tools and routes `CallToolRequest` to handlers via a switch statement
3. **Tool Handlers** — Each file in `src/tools/` exports a Tool definition, args interface, and async handler

### Tool Module Pattern

Every tool in `src/tools/` follows the same structure:

```typescript
export const TOOL_NAME: Tool = {
  name: "salesforce_*",
  description: "...",
  inputSchema: { /* JSON Schema */ }
};
export interface ToolArgs { /* ... */ }
export async function handleToolName(conn: any, args: ToolArgs) {
  return { content: [{ type: "text", text: "..." }], isError: boolean };
}
```

To add a new tool: create the file in `src/tools/`, then register it in `src/index.ts` in both the `ListToolsRequestSchema` handler (tool list) and the `CallToolRequestSchema` handler (switch case).

### Connection Management

`src/utils/connection.ts` creates a new `jsforce.Connection` **per request** (not cached). Supports three auth methods controlled by `SALESFORCE_CONNECTION_TYPE` env var:
- `User_Password` — username/password/security token
- `OAuth_2.0_Client_Credentials` — connected app client credentials
- `Salesforce_CLI` — shells out to `sf org display --json`

### Types

- `src/types/connection.ts` — Auth config types and `ConnectionType` enum
- `src/types/salesforce.ts` — Core Salesforce data types (`SalesforceObject`, `SalesforceField`, `DMLResult`)
- `src/types/metadata.ts` — Metadata API types

### Important Detail

dotenv is pinned to 16.4.7 specifically because newer versions print tips to stdout, which breaks MCP's stdio transport.

## Claude Desktop Extension

`claude-desktop/manifest.json` defines the DXT extension manifest. The `.dxt` file is a zip archive containing only `manifest.json` — rebuild it with:

```bash
cd claude-desktop && zip salesforce-mcp-extension.dxt manifest.json
```

The manifest's `tools` array must be kept in sync with tools registered in `src/index.ts`.
