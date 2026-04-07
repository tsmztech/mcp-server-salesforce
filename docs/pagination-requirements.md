# Requirements: Pagination Support Across All Tools

## Overview

Add offset/limit pagination to all data-fetching tools in the MCP server so that large result sets are returned in manageable pages rather than dumped in a single response.

## Motivation

Today, every data-fetching tool returns its entire result set in one response. This causes two problems:

1. **Context window overflow** — Unbounded results (e.g., `salesforce_query_records` with no limit, `salesforce_read_apex` returning every Apex class in the org) can produce responses too large for the LLM to process effectively.
2. **No way to page through data** — If a query returns 5,000 records, the user has no mechanism to see records 201–400. They must either re-query with a narrower filter or accept whatever the API returns in a single batch.

Several tools have no limit at all (`search_objects`, `read_apex`, `read_apex_trigger`), and those with limits have no offset mechanism to access subsequent pages.

## Constraints

### MCP Protocol
- `CallToolResult` has no built-in pagination fields (no cursor, no `nextPage`). Pagination must be implemented at the tool input/output level — the tool accepts pagination parameters and returns pagination metadata in its text response.

### Salesforce API
- SOQL supports `LIMIT` and `OFFSET`, but `OFFSET` maxes out at 2,000.
- SOQL `OFFSET` is not supported with `GROUP BY` (affects `aggregate_query`).
- SOSL does not support a global `OFFSET` — only per-object `LIMIT` in the `RETURNING` clause.
- The Analytics API (reports) has its own row-limiting mechanism (`topRows`) already implemented.

### Server Architecture
- Each tool call creates a fresh `jsforce.Connection` — server-side cursors (`queryMore()`) cannot survive across calls. Pagination must be stateless.

## User Stories

1. **Page through query results** — "Show me accounts 201–400 from my earlier query" → user passes `offset: 200` to `salesforce_query_records`.
2. **Know how much data exists** — "How many records match this query?" → response includes `totalSize` and `hasMore` even when only a page is returned.
3. **Control page size** — "Only show me 50 records at a time" → user sets `limit: 50`.
4. **Defaults protect the LLM** — Running a query with no limit/offset returns a sensible page (e.g., 200 records) instead of 50,000, with a note that more data exists.
5. **Page through Apex classes** — "Show me the next batch of Apex classes" → user passes `offset` to `salesforce_read_apex`.
6. **Page through analytics listings** — "Show me more reports matching 'Pipeline'" → user passes `offset` to `salesforce_list_analytics`.

## Functional Requirements

### FR-1: Shared pagination parameters

All paginated tools accept two optional parameters:
- `limit` (number) — Maximum records to return. Each tool has a sensible default.
- `offset` (number, default 0) — Number of records to skip.

### FR-2: Pagination metadata in responses

All paginated tool responses include a footer with:
```
Showing {offset+1}–{offset+returned} of {totalSize} results.{hasMore ? " Use offset: {nextOffset} to see the next page." : ""}
```

When the result set is empty: `"No results found."` (no pagination footer).

### FR-3: Tool-specific requirements

#### `salesforce_query_records`
- Add `offset` parameter (default 0).
- Change default `limit` from unlimited to 200.
- Disable jsforce autoFetch so only one page is returned.
- Append `OFFSET {offset}` and `LIMIT {limit}` to generated SOQL.
- Report `totalSize` from the query result.
- For offset > 2,000 (Salesforce OFFSET ceiling), use keyset pagination: replace OFFSET with `WHERE Id > '{lastId}' ORDER BY Id` and document this in the response.

#### `salesforce_aggregate_query`
- Default `limit` to 200 when none specified.
- No `offset` parameter — Salesforce does not support OFFSET with GROUP BY.
- Report `totalSize` from the query result so the user knows if results were truncated.
- Document in tool description that narrowing via `WHERE`/`HAVING` is the way to see different slices of aggregated data.

#### `salesforce_search_objects`
- Add `limit` (default 50) and `offset` (default 0) parameters.
- Change handler signature from `(conn, searchPattern: string)` to `(conn, args: SearchObjectsArgs)`.
- Slice the in-memory `matchingObjects` array with offset/limit.
- Report total matching count.

#### `salesforce_search_all`
- No global offset — SOSL doesn't support it.
- Per-object `limit` already exists; no changes needed.
- Add total record count per object in the response so users know if results were truncated.

#### `salesforce_list_analytics`
- Add `limit` (default 50) and `offset` (default 0) parameters.
- For the SOQL search path: replace hardcoded `LIMIT 100` with `LIMIT {limit} OFFSET {offset}`.
- For the analytics API path (recently viewed): slice the returned array with offset/limit.
- Report total count.

#### `salesforce_read_apex`
- Add `limit` (default 50) and `offset` (default 0) parameters.
- Append `LIMIT {limit} OFFSET {offset}` to the listing SOQL query.
- Report total count.
- Single-class lookup (by exact name) is not paginated.

#### `salesforce_read_apex_trigger`
- Same as `salesforce_read_apex`.

#### `salesforce_manage_debug_logs` (retrieve operation only)
- Add `offset` parameter (default 0). Already has `limit` (default 10).
- Append `OFFSET {offset}` to the log retrieval SOQL.
- Report total count.

#### `salesforce_run_analytics` (reports)
- Already has `topRows` for row limiting and display cap for output.
- No additional pagination parameters needed.
- Continue reporting truncation warnings via `allData` flag.

### FR-4: Tools that do NOT get pagination

These tools return bounded or single-entity results and don't need pagination:
- `salesforce_describe_object` — single object metadata
- `salesforce_describe_analytics` — single report/dashboard metadata
- `salesforce_dml_records` — write operation
- `salesforce_manage_object` — metadata CRUD
- `salesforce_manage_field` — metadata CRUD
- `salesforce_manage_field_permissions` — metadata CRUD
- `salesforce_write_apex` — write operation
- `salesforce_write_apex_trigger` — write operation
- `salesforce_execute_anonymous` — execute operation
- `salesforce_refresh_dashboard` — dashboard operation
- `salesforce_run_analytics` (dashboards) — component data is bounded

## Non-Functional Requirements

- **NFR-1**: All pagination parameters are optional with sensible defaults — existing calls without pagination params continue to work (backward compatible).
- **NFR-2**: Create a shared pagination utility (`src/utils/pagination.ts`) for consistent pagination metadata formatting across tools.
- **NFR-3**: No server-side state — every call is self-contained and stateless.
- **NFR-4**: Pagination metadata is embedded in the text response (footer lines), not in structured fields, since `CallToolResult` only supports `content` array.
- **NFR-5**: Default limits are tuned for LLM context windows — large enough to be useful, small enough to avoid flooding.

## Default Limits

| Tool | Current Default | New Default |
|------|----------------|-------------|
| `query_records` | Unlimited | 200 |
| `aggregate_query` | Unlimited | 200 |
| `search_objects` | Unlimited | 50 |
| `search_all` | Per-object (user-set) | No change |
| `list_analytics` | 100 (hardcoded) | 50 |
| `read_apex` | Unlimited | 50 |
| `read_apex_trigger` | Unlimited | 50 |
| `manage_debug_logs` | 10 | No change |

## Consistency Limitation

Offset/limit pagination does not guarantee a consistent snapshot across pages. If the underlying data changes between page requests (records inserted, deleted, or updated), results may shift:

- **Inserts** between pages → a record may appear on two pages or be skipped entirely.
- **Deletes** between pages → a record may be skipped as subsequent records shift left.
- **Field changes** affecting ORDER BY or WHERE → records may jump between pages.

Salesforce provides consistent pagination via server-side query cursors (`queryMore()`), but these are tied to a connection session. The MCP server creates a fresh connection per tool call (stateless architecture), so cursors cannot survive across calls. Introducing connection pooling or cursor storage would add significant complexity for a marginal benefit — in practice, Salesforce data rarely changes fast enough to affect interactive paging through an LLM conversation.

**Mitigation for users who need exact snapshots:** Use a deterministic WHERE clause to pin the result set, e.g., `WHERE CreatedDate < 2026-04-07T00:00:00Z ORDER BY Id`. This produces stable pages regardless of concurrent changes.

This limitation will be documented in the tool descriptions for `salesforce_query_records` and any other tool where it applies.

## Out of Scope

- Server-side cursor/session management (would require state store and connection pooling — architectural change).
- Async report execution with pagination (separate enhancement).
- Streaming / SSE-based pagination (MCP protocol doesn't support it for tool calls).
- Changes to tools that don't return lists of records.
