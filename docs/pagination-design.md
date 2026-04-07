# Technical Design: Pagination Support Across All Tools

## Architecture

### Pagination Model: Stateless Offset/Limit

Every paginated tool accepts optional `limit` and `offset` parameters and returns pagination metadata in a footer line. No server-side state, no cursors. Each tool call is completely self-contained.

**Stateless by design — multi-instance safe:** The MCP server can run as multiple instances (e.g., one per Claude conversation) with no shared state. Pagination works identically across all instances because every call rebuilds its query from the `offset` parameter alone. There is nothing to coordinate — no cursor table, no session store, no cross-instance concerns.

**Why offset/limit, not cursors:**
- Each MCP tool call creates a fresh `jsforce.Connection` (line 78 of `index.ts`). Salesforce's `queryMore()` cursor is tied to a connection session and cannot survive across calls — even within the same MCP instance.
- Introducing server-side cursor storage (in-memory, Redis, etc.) would break the stateless architecture, create cross-instance coordination problems, and add operational complexity for limited benefit.
- Offset/limit is stateless and maps directly to SOQL `LIMIT`/`OFFSET` syntax that every tool already uses or can adopt.

**Salesforce OFFSET ceiling (2,000):** SOQL's `OFFSET` maxes out at 2,000. For `salesforce_query_records` — the only tool likely to need offsets beyond 2,000 — we fall back to keyset pagination (`WHERE Id > :lastId ORDER BY Id`). Other tools are unlikely to hit this ceiling given their default page sizes (50).

**Consistency trade-off:** Offset/limit does not guarantee a consistent snapshot across pages. If data changes between page requests, records may shift (duplicates or gaps). Salesforce's `queryMore()` cursors provide consistency but require a persistent connection session — incompatible with our stateless, connection-per-call architecture. In practice, Salesforce data rarely changes fast enough to affect interactive LLM paging. For exact snapshots, users should pin results with a deterministic WHERE clause (e.g., `WHERE CreatedDate < 2026-04-07T00:00:00Z ORDER BY Id`). This trade-off and mitigation will be documented in the tool descriptions for `salesforce_query_records`.

### New File: `src/utils/pagination.ts`

Shared types and a formatting helper. Keeps pagination metadata consistent across all tools.

```typescript
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginationInfo {
  totalSize: number;
  returned: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export const DEFAULT_LIMITS: Record<string, number> = {
  query: 200,
  aggregate: 200,
  search_objects: 50,
  list_analytics: 50,
  read_apex: 50,
  read_apex_trigger: 50,
  debug_logs: 10,
};

export function formatPaginationFooter(info: PaginationInfo): string {
  if (info.totalSize === 0) return '';

  const start = info.offset + 1;
  const end = info.offset + info.returned;
  let footer = `\nShowing ${start}–${end} of ${info.totalSize} results.`;

  if (info.hasMore) {
    footer += ` Use offset: ${info.offset + info.limit} to see the next page.`;
  }

  return footer;
}

export function applyDefaults(
  params: PaginationParams,
  defaultLimit: number
): Required<PaginationParams> {
  return {
    limit: params.limit ?? defaultLimit,
    offset: params.offset ?? 0,
  };
}
```

---

## Tool-by-Tool Changes

### Tool 1: `salesforce_query_records` (highest impact)

**File:** `src/tools/query.ts`

**Current behavior:** Constructs SOQL with optional `LIMIT` from user, no `OFFSET`. Calls `conn.query(soql)` which returns all records (jsforce autoFetch). Response says `"Query returned N records"` with no total count or paging info.

**Changes:**

1. Add `offset` to `QueryArgs` and `inputSchema`:
   ```typescript
   export interface QueryArgs {
     objectName: string;
     fields: string[];
     whereClause?: string;
     orderBy?: string;
     limit?: number;
     offset?: number;  // NEW
   }
   ```

2. Default `limit` to 200 when not provided:
   ```typescript
   const { limit: rawLimit, offset: rawOffset } = args;
   const limit = rawLimit ?? DEFAULT_LIMITS.query;
   const offset = rawOffset ?? 0;
   ```

3. Disable jsforce autoFetch so we get a single page:
   ```typescript
   const result = await conn.query(soql, { autoFetch: false, maxFetch: limit });
   ```

4. Append `LIMIT` and `OFFSET` to SOQL:
   ```typescript
   soql += ` LIMIT ${limit}`;
   if (offset > 0) soql += ` OFFSET ${offset}`;
   ```

5. For offset > 2,000 — keyset pagination fallback:
   ```typescript
   if (offset > 2000) {
     // Keyset: replace OFFSET with WHERE Id > lastId
     // Requires ORDER BY Id — add it if not present, or warn if orderBy conflicts
     // Fetch the last Id from the previous page by querying OFFSET 2000
     // This is documented in the response as a behavior note
   }
   ```

   **Design decision:** For the keyset fallback, we fetch the boundary Id by running a lightweight query: `SELECT Id FROM {object} {where} ORDER BY Id LIMIT 1 OFFSET 2000`, then use `WHERE Id > '{boundaryId}'` with the adjusted offset. This adds one extra API call but avoids requiring the user to pass a `lastId` parameter.

   **Alternative considered:** Add an explicit `afterId` param for keyset pagination. Rejected because it's a worse UX — the user would need to extract and pass the last Id from the previous response. The automatic approach is seamless.

6. Update response text:
   ```typescript
   // Before:
   `Query returned ${result.records.length} records:\n\n${formattedRecords}`

   // After:
   `Query returned ${result.records.length} of ${result.totalSize} records:\n\n${formattedRecords}${formatPaginationFooter(paginationInfo)}`
   ```

7. Update tool description to document pagination behavior and consistency limitation:
   ```
   Pagination: Results default to 200 records per page. Use limit and offset to page through results.
   Response includes total record count and next offset.

   Note: Pages are not snapshot-consistent — if data changes between requests, records may shift.
   For stable pagination, add a deterministic WHERE clause (e.g., WHERE CreatedDate < 2026-04-07T00:00:00Z ORDER BY Id).
   ```

**Registration in `index.ts`:** Add `offset` to the validation/casting block:
```typescript
case "salesforce_query_records": {
  // ... existing validation ...
  const validatedArgs: QueryArgs = {
    // ... existing fields ...
    offset: queryArgs.offset as number | undefined,  // NEW
  };
}
```

---

### Tool 2: `salesforce_aggregate_query`

**File:** `src/tools/aggregateQuery.ts`

**Current behavior:** Constructs `GROUP BY` SOQL with optional `LIMIT`. No `OFFSET` (Salesforce doesn't support OFFSET with GROUP BY).

**Changes:**

1. Default `limit` to 200 when not provided:
   ```typescript
   const limit = args.limit ?? DEFAULT_LIMITS.aggregate;
   ```
   Currently the limit is only appended when the user provides it. Change to always append.

2. Add `totalSize` to response:
   ```typescript
   // Before:
   `Aggregate query returned ${result.records.length} grouped results`

   // After:
   `Aggregate query returned ${result.records.length} of ${result.totalSize} grouped results.${result.records.length < result.totalSize ? ' Narrow with WHERE/HAVING to see different slices (OFFSET not supported with GROUP BY).' : ''}`
   ```

3. No `offset` parameter — just update the tool description to explain why:
   ```
   Note: OFFSET is not supported with GROUP BY in Salesforce. Use WHERE/HAVING clauses to narrow results instead.
   ```

**No schema changes** beyond defaulting the existing `limit`.

---

### Tool 3: `salesforce_search_objects`

**File:** `src/tools/search.ts`

**Current behavior:** Calls `conn.describeGlobal()`, filters in-memory, returns all matches. Handler signature is `handleSearchObjects(conn, searchPattern: string)`.

**Changes:**

1. Change handler signature to accept an args object:
   ```typescript
   export interface SearchObjectsArgs {
     searchPattern: string;
     limit?: number;
     offset?: number;
   }

   // Before:
   export async function handleSearchObjects(conn: any, searchPattern: string)

   // After:
   export async function handleSearchObjects(conn: any, args: SearchObjectsArgs)
   ```

2. Add `limit` and `offset` to `inputSchema`:
   ```typescript
   inputSchema: {
     type: "object",
     properties: {
       searchPattern: { ... },
       limit: {
         type: "number",
         description: "Maximum number of results to return (default 50)"
       },
       offset: {
         type: "number",
         description: "Number of results to skip (default 0)"
       }
     },
     required: ["searchPattern"]
   }
   ```

3. Slice the filtered results:
   ```typescript
   const totalMatches = matchingObjects.length;
   const paged = matchingObjects.slice(offset, offset + limit);
   ```

4. Update response with pagination footer.

**Registration in `index.ts`:** Change from passing bare `searchPattern` to passing args object:
```typescript
// Before:
case "salesforce_search_objects": {
  const { searchPattern } = args as { searchPattern: string };
  if (!searchPattern) throw new Error('searchPattern is required');
  return await handleSearchObjects(conn, searchPattern);
}

// After:
case "salesforce_search_objects": {
  const searchArgs = args as Record<string, unknown>;
  if (!searchArgs.searchPattern) throw new Error('searchPattern is required');
  const validatedArgs: SearchObjectsArgs = {
    searchPattern: searchArgs.searchPattern as string,
    limit: searchArgs.limit as number | undefined,
    offset: searchArgs.offset as number | undefined,
  };
  return await handleSearchObjects(conn, validatedArgs);
}
```

---

### Tool 4: `salesforce_list_analytics`

**File:** `src/tools/listAnalytics.ts`

**Current behavior:**
- With `searchTerm`: SOQL with hardcoded `LIMIT 100`, no `OFFSET`.
- Without `searchTerm`: `conn.analytics.reports()` / `conn.analytics.dashboards()` returns recently viewed items with no limit.

**Changes:**

1. Add `limit` and `offset` to `ListAnalyticsArgs` and `inputSchema`:
   ```typescript
   export interface ListAnalyticsArgs {
     type: 'report' | 'dashboard';
     searchTerm?: string;
     limit?: number;   // NEW
     offset?: number;  // NEW
   }
   ```

2. SOQL search path — parameterize:
   ```typescript
   // Before:
   `... ORDER BY Name LIMIT 100`

   // After:
   `... ORDER BY Name LIMIT ${limit} OFFSET ${offset}`
   ```

3. Analytics API path — slice the returned array:
   ```typescript
   const all = await conn.analytics.reports();
   const total = all.length;
   const paged = all.slice(offset, offset + limit);
   ```

4. Add pagination footer to both paths.

---

### Tool 5: `salesforce_read_apex`

**File:** `src/tools/readApex.ts`

**Current behavior:** Listing query has `ORDER BY Name` but NO `LIMIT` — returns every Apex class in the org. Single-class lookup (by `className`) is not paginated.

**Changes:**

1. Add `limit` and `offset` to `ReadApexArgs` and `inputSchema`:
   ```typescript
   export interface ReadApexArgs {
     className?: string;
     namePattern?: string;
     includeMetadata?: boolean;
     limit?: number;   // NEW
     offset?: number;  // NEW
   }
   ```

2. Append to listing SOQL:
   ```typescript
   query += ` ORDER BY Name LIMIT ${limit} OFFSET ${offset}`;
   ```

3. Get `totalSize` from query result for pagination footer.

4. Single-class lookup (`className` provided) — not paginated, no changes.

---

### Tool 6: `salesforce_read_apex_trigger`

**File:** `src/tools/readApexTrigger.ts`

Same pattern as `salesforce_read_apex`. Identical changes.

---

### Tool 7: `salesforce_manage_debug_logs` (retrieve operation)

**File:** `src/tools/manageDebugLogs.ts`

**Current behavior:** Retrieve operation already has `limit` (default 10). No `offset`.

**Changes:**

1. Add `offset` to `ManageDebugLogsArgs` and `inputSchema`:
   ```typescript
   offset: {
     type: "number",
     description: "Number of logs to skip for pagination (retrieve operation only)"
   }
   ```

2. Append to log retrieval SOQL:
   ```typescript
   // Before:
   `... ORDER BY LastModifiedDate DESC LIMIT ${limit}`

   // After:
   `... ORDER BY LastModifiedDate DESC LIMIT ${limit} OFFSET ${offset}`
   ```

3. Add pagination footer.

---

### Tool 8: `salesforce_search_all` (minimal changes)

**File:** `src/tools/searchAll.ts`

**Current behavior:** SOSL with per-object `LIMIT` in `RETURNING` clause. No global offset.

**Changes:** Minimal — SOSL doesn't support global OFFSET.

1. Add per-object record count to response:
   ```typescript
   // For each object in the RETURNING results, show count:
   `{objectName}: ${count} records returned`
   ```

2. No new pagination params. The existing per-object `limit` is sufficient.

---

### Tools with NO changes

| Tool | Reason |
|------|--------|
| `salesforce_describe_object` | Returns metadata for a single object — not a list |
| `salesforce_describe_analytics` | Returns metadata for a single report/dashboard |
| `salesforce_dml_records` | Write operation — no result set to paginate |
| `salesforce_manage_object` | Metadata CRUD — single entity |
| `salesforce_manage_field` | Metadata CRUD — single entity |
| `salesforce_manage_field_permissions` | Metadata CRUD / bounded view |
| `salesforce_write_apex` | Write operation |
| `salesforce_write_apex_trigger` | Write operation |
| `salesforce_execute_anonymous` | Execute operation |
| `salesforce_refresh_dashboard` | Dashboard operation — status check |
| `salesforce_run_analytics` (reports) | Already has `topRows` + display cap + truncation warning |
| `salesforce_run_analytics` (dashboards) | Component data is bounded |

---

## Registration Changes in `index.ts`

**Modified cases:**
1. `salesforce_query_records` — add `offset` to validated args
2. `salesforce_search_objects` — change from bare string to args object
3. `salesforce_list_analytics` — add `limit`, `offset` to validated args
4. `salesforce_read_apex` — add `limit`, `offset` to validated args
5. `salesforce_read_apex_trigger` — add `limit`, `offset` to validated args
6. `salesforce_manage_debug_logs` — add `offset` to validated args

**No changes to:** all other cases.

---

## Keyset Pagination Deep Dive (query_records only)

When `offset > 2000`, Salesforce rejects the SOQL. Instead of erroring, we transparently switch to keyset pagination:

**Algorithm:**
1. User calls with `offset: 2500, limit: 200`.
2. Handler detects offset > 2000.
3. Run a boundary query: `SELECT Id FROM {object} {where} ORDER BY Id LIMIT 1 OFFSET 1999` to find the Id at position 2000.
4. Rewrite the main query: replace `OFFSET 2500` with `WHERE Id > '{boundaryId}' ORDER BY Id OFFSET 499 LIMIT 200`.
   - 2500 - 2000 = 500, but we started from position 2001, so OFFSET = 499.
   - Actually simpler: `OFFSET (offset - 2000)` with the boundary WHERE clause.
5. Append a note to the response: `"Note: Offset > 2,000 uses keyset pagination (ordered by Id). Custom ORDER BY is not applied beyond the 2,000 threshold."`

**Trade-off:** Custom `orderBy` cannot be honored when keyset pagination kicks in. The records are ordered by Id instead. This is documented in the response and in the tool description update.

**Alternative considered:** Error when offset > 2000 and tell the user to narrow with WHERE. Rejected — keyset pagination gives a better experience for the majority of cases where the user just wants to page through a large result set.

---

## File Summary

| File | Change | Description |
|------|--------|-------------|
| `src/utils/pagination.ts` | New | Shared `PaginationParams`, `PaginationInfo`, `formatPaginationFooter()`, `DEFAULT_LIMITS` |
| `src/tools/query.ts` | Modified | Add `offset`, default `limit` to 200, disable autoFetch, keyset fallback, pagination footer |
| `src/tools/aggregateQuery.ts` | Modified | Default `limit` to 200, add `totalSize` to response |
| `src/tools/search.ts` | Modified | Change handler signature to args object, add `limit`/`offset`, slice in-memory results |
| `src/tools/searchAll.ts` | Modified | Add per-object count to response |
| `src/tools/listAnalytics.ts` | Modified | Add `limit`/`offset`, replace hardcoded `LIMIT 100`, slice analytics API results |
| `src/tools/readApex.ts` | Modified | Add `limit`/`offset` to listing query |
| `src/tools/readApexTrigger.ts` | Modified | Add `limit`/`offset` to listing query |
| `src/tools/manageDebugLogs.ts` | Modified | Add `offset` to retrieve operation |
| `src/index.ts` | Modified | Update 6 case blocks for new/changed args |

---

## Implementation Order

1. `src/utils/pagination.ts` — shared utility (no dependencies)
2. `src/tools/query.ts` — highest-impact tool, most complex changes (keyset fallback)
3. `src/tools/search.ts` — handler signature change (breaking)
4. `src/tools/aggregateQuery.ts` — simple default limit + totalSize
5. `src/tools/listAnalytics.ts` — parameterize existing limit
6. `src/tools/readApex.ts` + `readApexTrigger.ts` — identical pattern
7. `src/tools/manageDebugLogs.ts` — add offset to existing limit
8. `src/tools/searchAll.ts` — minimal change (counts only)
9. `src/index.ts` — update all modified case blocks (do incrementally with each tool)
10. `test/analytics.test.js` — update schema tests for new params on `list_analytics`

---

## Backward Compatibility

All new parameters are optional with defaults. Existing tool calls without `limit`/`offset` will:

| Tool | Before | After |
|------|--------|-------|
| `query_records` (no limit) | Returns all records | Returns first 200 + pagination footer |
| `search_objects` | Returns all matches | Returns first 50 + pagination footer |
| `read_apex` (listing) | Returns all classes | Returns first 50 + pagination footer |
| All others | Same as before | Same as before (defaults match current behavior) |

**Breaking behavior change:** `query_records` and `search_objects` will return fewer results by default. This is intentional — unbounded results are the problem we're solving. The pagination footer tells the user how to get more.

**Breaking API change:** `handleSearchObjects` signature changes from `(conn, string)` to `(conn, SearchObjectsArgs)`. This only affects `index.ts` (internal).
