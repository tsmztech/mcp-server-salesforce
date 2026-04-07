# Requirements: Salesforce Reports & Dashboards MCP Tools

## Overview

Add MCP tools that allow Claude to list, describe, and run Salesforce Reports and Dashboards — including applying runtime filters — so users can retrieve analytics data through natural language without writing SOQL.

## Motivation

The server currently supports SOQL queries and SOSL searches, but many Salesforce orgs have hundreds of pre-built reports and dashboards that encode complex business logic (cross-filters, bucket fields, custom summary formulas, historical trending). Recreating these as SOQL is error-prone and often impossible. Exposing the Analytics API lets Claude leverage existing report definitions directly.

## User Stories

### Reports
1. **List reports** — "Show me all reports with 'Pipeline' in the name" or "What reports are in the Sales folder?"
2. **Describe a report** — "What columns and filters does the Pipeline Forecast report have?" (so the user can decide what to run or what filters to override)
3. **Run a report** — "Run the Pipeline Forecast report" or "Run report 00Oxx000000XXXXX with the Stage filter set to 'Closed Won' and date range last 90 days"
4. **Run with detail rows** — "Run the Open Cases report and include all detail rows"

### Dashboards
1. **List dashboards** — "Show me my recent dashboards" or "Find dashboards with 'Executive' in the name"
2. **Get dashboard data** — "Show me the Executive Sales Dashboard" (returns component summaries and their underlying data)
3. **Refresh a dashboard** — "Refresh the Executive Sales Dashboard" or "Is the Executive Dashboard still refreshing?"

## Functional Requirements

### FR-1: `salesforce_list_analytics`
- Accept a `type` parameter: `"report"` or `"dashboard"`.
- For reports: return id, name, folder, format, and report type.
- For dashboards: return id, name, and folder.
- Support an optional search term to filter by name.

### FR-2: `salesforce_describe_analytics`
- Accept a `type` parameter: `"report"` or `"dashboard"`, and a resource ID.
- For reports: return name, format, detail columns, groupings, filters, aggregates, standard date filter, and available filter operators — enough context for Claude to construct intelligent filter overrides.
- For dashboards: return name, running user, filters, and component metadata (headers, visualization types, associated report IDs).

### FR-3: `salesforce_run_analytics`
- Accept a `type` parameter: `"report"` or `"dashboard"`, and a resource ID.
- For reports:
  - Run synchronously via the Analytics API.
  - Support optional runtime filter overrides (column, operator, value).
  - Support an optional boolean filter logic string.
  - Support optional standard date filter override (column, durationValue, startDate, endDate).
  - Support `includeDetails` flag to include detail rows.
  - Support optional `topRows` (rowLimit + direction) to limit results.
  - Format the result into a human-readable text summary: aggregates, grouping summaries, and (when requested) detail rows.
  - Surface the `allData` flag — warn the user when results are truncated.
  - When `includeDetails` is true and no `topRows` is provided, default to 100 rows to avoid flooding the LLM context. The caller can override by providing `topRows` explicitly.
  - Cap formatted detail row output at 100 rows even when more are returned, with a note indicating more rows are available.
- For dashboards:
  - Retrieve current component data (aggregates, grouping summaries for each component).
  - Format component results into human-readable text keyed by component header/title.

### FR-4: `salesforce_refresh_dashboard`
- Accept a dashboard ID and an operation: `refresh` or `status`.
- `refresh`: Trigger a dashboard refresh and return the status URL.
- `status`: Return per-component refresh status and data status.
- Dashboard-only — reports don't have a refresh concept (use `salesforce_run_analytics` to re-execute).

## Non-Functional Requirements

- **NFR-1**: Follow the existing tool pattern — one file per tool, each exporting a tool definition constant, args interface, and async handler function; registered in `index.ts`.
- **NFR-2**: Use `jsforce`'s built-in `conn.analytics` API — no raw HTTP calls.
- **NFR-3**: All output goes through `{ content: [{ type: "text", text }], isError }` return format.
- **NFR-4**: Use `console.error()` for logging (stdout is MCP JSON-RPC only).
- **NFR-5**: Format results to be LLM-friendly: prefer structured plain text over raw JSON dumps. Summarize large factMaps rather than dumping every cell.
- **NFR-6**: Surface API limits clearly (e.g., 2,000 row sync limit, `allData: false` warnings).
- **NFR-7**: Args interfaces defined in their respective tool files (not in a shared types file), matching existing conventions.
- **NFR-8**: Formatting logic inline in each tool file (no shared formatter utility), matching existing conventions.

## Out of Scope (for this PR)
- Async report execution (polling for long-running reports) — would lift the 2,000 row sync ceiling. Can be added later.
- Pagination across tools — no existing tool in the server supports pagination. A server-wide pagination mechanism would be a separate enhancement.
- Creating, updating, or deleting reports/dashboards.
- Exporting reports to CSV/Excel.
- Report chart image rendering.
