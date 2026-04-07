# Technical Design: Salesforce Reports & Dashboards MCP Tools

## Architecture

Four new tool files following the existing one-file-per-tool pattern. Reports and dashboards are combined into shared tools using a `type` discriminator, with the exception of `refresh_dashboard` which is dashboard-only.

```
src/
  tools/
    listAnalytics.ts          # salesforce_list_analytics
    describeAnalytics.ts      # salesforce_describe_analytics
    runAnalytics.ts           # salesforce_run_analytics
    refreshDashboard.ts       # salesforce_refresh_dashboard
  types/
    analytics.ts              # Re-exported jsforce analytics types (shared across tools)
```

### Design Decisions

**Combined report/dashboard tools with `type` discriminator.** The `type` param (`"report"` | `"dashboard"`) selects the behavior, similar to how `salesforce_dml_records` uses `operation` with operation-specific optional params (e.g., `externalIdField` only applies to upsert). Here, report-specific params like `filters`, `includeDetails`, and `topRows` only apply when `type` is `"report"`.

**`refresh_dashboard` is separate and dashboard-only.** Reports don't have a refresh concept — you re-run them with `salesforce_run_analytics`. Dashboards have a distinct refresh lifecycle (trigger → poll status → get updated data) that doesn't apply to reports.

**No shared formatter utility.** Every existing tool formats its own output inline. We follow the same pattern.

**Args interfaces in tool files.** Matches the project convention (`QueryArgs` in `query.ts`, `DMLArgs` in `dml.ts`, etc.).

**No pagination — smart defaults and clear warnings instead.** The existing server has no pagination support anywhere (`query_records`, `aggregate_query`, `search_all` all return a single response with no cursor or offset mechanism). The Salesforce sync report API has a hard ceiling of 2,000 detail rows with no next-page mechanism — `allData: false` tells you it's truncated, but there's no way to fetch page 2 (that requires async execution, which is out of scope for this PR).

Our approach:
- **Default detail row cap:** When `includeDetails` is true and no `topRows` is specified, the handler automatically applies `topRows: { rowLimit: 100, direction: "Desc" }`. This prevents dumping 2,000 rows into an LLM context window. The caller can override this by explicitly providing `topRows`.
- **Truncation warning:** When `allData` is false, append: `"Note: Results are truncated. The report has more rows than returned. Use salesforce_describe_analytics to see available filter columns, then narrow with filters or adjust topRows."` This guides the LLM toward a self-service resolution.
- **Aggregates and grouping summaries are always complete.** Truncation only affects detail rows — totals and group-level summaries are returned in full regardless of row count.
- **Display cap:** Even when the API returns up to 2,000 rows, we cap the formatted output at 100 detail rows with a note: `"Showing 100 of {n} detail rows. Use topRows to adjust."` This keeps responses readable.
- **Future enhancement:** Async report execution with polling (`report.executeAsync()` + `report.instance(id).retrieve()`) can lift the 2,000 row ceiling and could be added as a separate PR. Pagination across all server tools (reports, queries, searches) would be a broader architectural change.

---

## Types: `src/types/analytics.ts`

Re-exports jsforce analytics types used across multiple tool files. No custom interfaces — args interfaces live in their respective tool files per project convention.

```typescript
export type {
  ReportExecuteResult,
  ReportDescribeResult,
  ReportInfo,
  ReportMetadata,
  ReportExtendedMetadata,
  DashboardMetadata,
  DashboardResult,
  DashboardStatusResult,
  DashboardRefreshResult,
  DashboardInfo,
} from 'jsforce/lib/api/analytics/types';

export type { ReportExecuteOptions } from 'jsforce/lib/api/analytics';
```

---

## Tool Definitions

### Tool 1: `salesforce_list_analytics`

**File:** `src/tools/listAnalytics.ts`
**Follows pattern of:** `search.ts` (salesforce_search_objects)

```typescript
export const LIST_ANALYTICS: Tool = {
  name: "salesforce_list_analytics",
  description: `List available Salesforce reports or dashboards. Returns IDs, names, and metadata.
Use this to find IDs before describing or running them with salesforce_describe_analytics or salesforce_run_analytics.

Examples:
1. List recently viewed reports:
   - type: "report"

2. Search reports by name:
   - type: "report"
   - searchTerm: "Pipeline"

3. List recently viewed dashboards:
   - type: "dashboard"

4. Search dashboards by name:
   - type: "dashboard"
   - searchTerm: "Executive"`,
  inputSchema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["report", "dashboard"],
        description: 'Type of analytics resource to list: "report" or "dashboard"'
      },
      searchTerm: {
        type: "string",
        description: "Search term to filter by name. If omitted, returns recently viewed items."
      }
    },
    required: ["type"]
  }
};

export interface ListAnalyticsArgs {
  type: 'report' | 'dashboard';
  searchTerm?: string;
}
```

**Handler Logic — reports:**
1. If no `searchTerm`: call `conn.analytics.reports()` for the recent list.
2. If `searchTerm` provided: jsforce's `reports()` only returns recently viewed reports, so fall back to SOQL:
   ```sql
   SELECT Id, Name, FolderName, Format, Description
   FROM Report
   WHERE Name LIKE '%searchTerm%'
   ORDER BY Name
   LIMIT 100
   ```
3. Format:
   ```
   Found {count} reports:

   {id} — {name}
     Folder: {folderName}
     Format: {format}
   ```

**Handler Logic — dashboards:**
1. If no `searchTerm`: call `conn.analytics.dashboards()` for the recent list.
2. If `searchTerm` provided: fall back to SOQL:
   ```sql
   SELECT Id, Title, FolderName, Description
   FROM Dashboard
   WHERE Title LIKE '%searchTerm%'
   ORDER BY Title
   LIMIT 100
   ```
3. Format:
   ```
   Found {count} dashboards:

   {id} — {title}
     Folder: {folderName}
   ```

---

### Tool 2: `salesforce_describe_analytics`

**File:** `src/tools/describeAnalytics.ts`
**Follows pattern of:** `describe.ts` (salesforce_describe_object)

```typescript
export const DESCRIBE_ANALYTICS: Tool = {
  name: "salesforce_describe_analytics",
  description: `Get detailed metadata for a Salesforce report or dashboard.

For reports: returns columns, groupings, filters, aggregates, date filter, and available filter operators. Use this to understand a report's structure before running it with salesforce_run_analytics.

For dashboards: returns component list (headers, visualization types, associated report IDs), filters, running user, and layout info.

Examples:
1. Describe a report:
   - type: "report"
   - resourceId: "00Oxx000000XXXXX"

2. Describe a dashboard:
   - type: "dashboard"
   - resourceId: "01Zxx000000XXXXX"`,
  inputSchema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["report", "dashboard"],
        description: 'Type of analytics resource: "report" or "dashboard"'
      },
      resourceId: {
        type: "string",
        description: "The 15 or 18-character Salesforce report or dashboard ID"
      }
    },
    required: ["type", "resourceId"]
  }
};

export interface DescribeAnalyticsArgs {
  type: 'report' | 'dashboard';
  resourceId: string;
}
```

**Handler Logic — report:**
1. `const report = conn.analytics.report(resourceId);`
2. `const desc = await report.describe();`
3. Format by cross-referencing `reportMetadata` with `reportExtendedMetadata`:
   ```
   Report: {name}
   Format: {reportFormat}
   Report Type: {reportType.label}

   Detail Columns:
     - {label} ({apiName}) — {dataType}

   Row Groupings:
     - {label} ({apiName}), granularity: {dateGranularity}

   Column Groupings:
     - {label} ({apiName}), granularity: {dateGranularity}

   Aggregates:
     - {label}

   Current Filters:
     - {column} {operator} "{value}"

   Boolean Filter Logic: {reportBooleanFilter}

   Standard Date Filter:
     Column: {column}, Range: {durationValue} ({startDate} to {endDate})

   Scope: {scope}
   ```

**Handler Logic — dashboard:**
1. `const dashboard = conn.analytics.dashboard(resourceId);`
2. `const desc = await dashboard.describe();`
3. Format:
   ```
   Dashboard: {name}
   Running User: {runningUser.displayName}
   Type: {dashboardType}

   Filters:
     - {name}: {selectedOption || "(none)"}

   Components:
     - {header} [{type} — {visualizationType}]
       Report: {reportId}
   ```

---

### Tool 3: `salesforce_run_analytics`

**File:** `src/tools/runAnalytics.ts`
**Follows pattern of:** `query.ts` (salesforce_query_records) — the most parameter-rich existing tool

```typescript
export const RUN_ANALYTICS: Tool = {
  name: "salesforce_run_analytics",
  description: `Execute a Salesforce report or retrieve current dashboard component data.

For reports: runs the report synchronously via the Analytics API. Supports optional runtime filter overrides, date filter overrides, and detail row inclusion. When includeDetails is true, defaults to returning 100 rows (override with topRows). The sync API has a hard maximum of 2,000 detail rows — a warning is included if results are truncated. Aggregates and grouping summaries are always returned in full.

For dashboards: retrieves each component's current data (aggregates, grouping summaries) without triggering a refresh. To refresh first, use salesforce_refresh_dashboard.

Examples:
1. Run a report with saved defaults:
   - type: "report"
   - resourceId: "00Oxx000000XXXXX"

2. Run a report with detail rows:
   - type: "report"
   - resourceId: "00Oxx000000XXXXX"
   - includeDetails: true

3. Run a report with filter overrides:
   - type: "report"
   - resourceId: "00Oxx000000XXXXX"
   - includeDetails: true
   - filters: [{ "column": "STAGE_NAME", "operator": "equals", "value": "Closed Won" }]
   - standardDateFilter: { "column": "CLOSE_DATE", "durationValue": "LAST_N_DAYS:90" }

4. Run a report with row limit:
   - type: "report"
   - resourceId: "00Oxx000000XXXXX"
   - includeDetails: true
   - topRows: { "rowLimit": 50, "direction": "Desc" }

5. Run a report with multiple filters and boolean logic:
   - type: "report"
   - resourceId: "00Oxx000000XXXXX"
   - filters: [
       { "column": "STAGE_NAME", "operator": "equals", "value": "Closed Won" },
       { "column": "AMOUNT", "operator": "greaterThan", "value": "10000" }
     ]
   - booleanFilter: "1 AND 2"

6. Get current dashboard component data:
   - type: "dashboard"
   - resourceId: "01Zxx000000XXXXX"`,
  inputSchema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["report", "dashboard"],
        description: 'Type of analytics resource: "report" or "dashboard"'
      },
      resourceId: {
        type: "string",
        description: "The 15 or 18-character Salesforce report or dashboard ID"
      },
      includeDetails: {
        type: "boolean",
        description: "Reports only. Include detail rows in results (default false). Capped at 2,000 rows by the API."
      },
      filters: {
        type: "array",
        items: {
          type: "object",
          properties: {
            column: { type: "string", description: "API name of the filter column (from salesforce_describe_analytics)" },
            operator: {
              type: "string",
              enum: ["equals","notEqual","lessThan","greaterThan","lessOrEqual",
                     "greaterOrEqual","contains","notContain","startsWith",
                     "includes","excludes","within"],
              description: "Filter operator"
            },
            value: { type: "string", description: "Filter value" }
          },
          required: ["column", "operator", "value"]
        },
        description: "Reports only. Runtime filter overrides applied for this execution only."
      },
      booleanFilter: {
        type: "string",
        description: 'Reports only. Boolean filter logic string (e.g., "1 AND (2 OR 3)").'
      },
      standardDateFilter: {
        type: "object",
        properties: {
          column: { type: "string", description: "Date column API name" },
          durationValue: { type: "string", description: 'Relative date value (e.g., "THIS_FISCAL_QUARTER", "LAST_N_DAYS:90", "CUSTOM")' },
          startDate: { type: "string", description: "Start date (YYYY-MM-DD) when durationValue is CUSTOM" },
          endDate: { type: "string", description: "End date (YYYY-MM-DD) when durationValue is CUSTOM" }
        },
        description: "Reports only. Standard date filter override."
      },
      topRows: {
        type: "object",
        properties: {
          rowLimit: { type: "number", description: "Maximum number of rows" },
          direction: { type: "string", enum: ["Asc", "Desc"], description: "Sort direction for limiting" }
        },
        description: "Reports only. Row limit with sort direction."
      }
    },
    required: ["type", "resourceId"]
  }
};

export interface RunAnalyticsArgs {
  type: 'report' | 'dashboard';
  resourceId: string;
  includeDetails?: boolean;
  filters?: Array<{
    column: string;
    operator: string;
    value: string;
  }>;
  booleanFilter?: string;
  standardDateFilter?: {
    column: string;
    durationValue: string;
    startDate?: string;
    endDate?: string;
  };
  topRows?: {
    rowLimit: number;
    direction: string;
  };
}
```

**Handler Logic — report:**
1. `const report = conn.analytics.report(resourceId);`
2. Apply default detail row cap — if `includeDetails` is true and `topRows` is not provided, default to `{ rowLimit: 100, direction: "Desc" }`:
   ```typescript
   const DEFAULT_DETAIL_ROW_LIMIT = 100;
   const effectiveTopRows = args.topRows ??
     (args.includeDetails ? { rowLimit: DEFAULT_DETAIL_ROW_LIMIT, direction: "Desc" } : undefined);
   ```
3. Build `ReportExecuteOptions`:
   ```typescript
   const options: ReportExecuteOptions = {
     details: args.includeDetails ?? false,
   };
   if (args.filters || args.booleanFilter || args.standardDateFilter || effectiveTopRows) {
     options.metadata = {
       reportMetadata: {
         ...(args.filters && { reportFilters: args.filters }),
         ...(args.booleanFilter && { reportBooleanFilter: args.booleanFilter }),
         ...(args.standardDateFilter && { standardDateFilter: args.standardDateFilter }),
         ...(effectiveTopRows && { topRows: effectiveTopRows }),
       }
     };
   }
   ```
4. `const result = await report.execute(options);`
5. Format result inline (see formatting algorithm below).
6. Append warnings as needed:
   - If `result.allData === false`: `"Note: Results are truncated. The report has more rows than the 2,000 row API limit. Use salesforce_describe_analytics to see available filter columns, then narrow with filters or adjust topRows."`
   - If default cap was applied: `"Note: Showing up to 100 detail rows (default limit). Provide topRows to adjust."`

**Report Result Formatting Algorithm:**
1. **Header**: Report name and format from `result.reportMetadata`.
2. **Grand totals**: Always present at factMap key `"T!T"`. Render aggregates with labels from `reportExtendedMetadata.aggregateColumnInfo`.
3. **Grouping summaries** (SUMMARY/MATRIX):
   - Walk `result.groupingsDown.groupings` (and `groupingsAcross` for MATRIX).
   - For each grouping, look up its factMap entry and render aggregates.
   - Use indentation for nested groupings.
4. **Detail rows** (when `hasDetailRows` is true):
   - Render column headers from `reportExtendedMetadata.detailColumnInfo`.
   - Render each row's `dataCells` as a tab-separated line.
   - Cap displayed rows at 100 with a note: `"Showing 100 of {n} detail rows. Use topRows to adjust."`
5. **Truncation warning**: If `result.allData === false`.

**Handler Logic — dashboard:**
1. `const dashboard = conn.analytics.dashboard(resourceId);`
2. `const result = await dashboard.components();` — returns `DashboardResult` with `dashboardMetadata` and `componentData[]`.
3. Format dashboard-level info: name, running user, filters.
4. For each component, format:
   - Header/title from `dashboardMetadata.components`
   - Visualization type (Bar, Pie, Table, Metric, etc.)
   - Aggregates and grouping summaries from `componentData[].reportResult`
   - Component status (data/nodata/error)

---

### Tool 4: `salesforce_refresh_dashboard`

**File:** `src/tools/refreshDashboard.ts`
**Follows pattern of:** `manageDebugLogs.ts` (salesforce_manage_debug_logs) — operations sharing the same entity and parameter shape use an `operation` param.

Dashboard-only. Reports don't have a refresh concept — use `salesforce_run_analytics` to re-execute a report.

```typescript
export const REFRESH_DASHBOARD: Tool = {
  name: "salesforce_refresh_dashboard",
  description: `Refresh a Salesforce dashboard or check its refresh status.

Examples:
1. Trigger a dashboard refresh:
   - operation: "refresh"
   - dashboardId: "01Zxx000000XXXXX"

2. Check refresh status:
   - operation: "status"
   - dashboardId: "01Zxx000000XXXXX"

Notes:
- The "refresh" operation triggers a refresh and returns a status URL
- The "status" operation returns per-component refresh status and data status
- Use salesforce_run_analytics with type "dashboard" to retrieve the updated data after refresh completes`,
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["refresh", "status"],
        description: 'Operation: "refresh" to trigger a refresh, "status" to check refresh progress'
      },
      dashboardId: {
        type: "string",
        description: "The 15 or 18-character Salesforce dashboard ID"
      }
    },
    required: ["operation", "dashboardId"]
  }
};

export interface RefreshDashboardArgs {
  operation: 'refresh' | 'status';
  dashboardId: string;
}
```

**Handler Logic — `refresh`:**
1. `const dashboard = conn.analytics.dashboard(dashboardId);`
2. `const result = await dashboard.refresh();`
3. Return: `"Dashboard refresh initiated. Status URL: {result.statusUrl}. Use operation 'status' to check progress, then salesforce_run_analytics with type 'dashboard' to retrieve updated data."`

**Handler Logic — `status`:**
1. `const dashboard = conn.analytics.dashboard(dashboardId);`
2. `const result = await dashboard.status();`
3. Format:
   ```
   Dashboard Refresh Status:

   Component {componentId}:
     Status: {refreshStatus}
     Last Refresh: {refreshDate}
   ```

---

## Registration in `index.ts`

Add to imports:
```typescript
import { LIST_ANALYTICS, handleListAnalytics, ListAnalyticsArgs } from "./tools/listAnalytics.js";
import { DESCRIBE_ANALYTICS, handleDescribeAnalytics, DescribeAnalyticsArgs } from "./tools/describeAnalytics.js";
import { RUN_ANALYTICS, handleRunAnalytics, RunAnalyticsArgs } from "./tools/runAnalytics.js";
import { REFRESH_DASHBOARD, handleRefreshDashboard, RefreshDashboardArgs } from "./tools/refreshDashboard.js";
```

Add to `ListToolsRequestSchema` handler array:
```typescript
LIST_ANALYTICS,
DESCRIBE_ANALYTICS,
RUN_ANALYTICS,
REFRESH_DASHBOARD,
```

Add switch cases in `CallToolRequestSchema` handler:
```typescript
case "salesforce_list_analytics": {
  const listArgs = args as Record<string, unknown>;
  if (!listArgs.type) {
    throw new Error('type is required');
  }
  const validatedArgs: ListAnalyticsArgs = {
    type: listArgs.type as 'report' | 'dashboard',
    searchTerm: listArgs.searchTerm as string | undefined,
  };
  return await handleListAnalytics(conn, validatedArgs);
}

case "salesforce_describe_analytics": {
  const descArgs = args as Record<string, unknown>;
  if (!descArgs.type || !descArgs.resourceId) {
    throw new Error('type and resourceId are required');
  }
  const validatedArgs: DescribeAnalyticsArgs = {
    type: descArgs.type as 'report' | 'dashboard',
    resourceId: descArgs.resourceId as string,
  };
  return await handleDescribeAnalytics(conn, validatedArgs);
}

case "salesforce_run_analytics": {
  const runArgs = args as Record<string, unknown>;
  if (!runArgs.type || !runArgs.resourceId) {
    throw new Error('type and resourceId are required');
  }
  const validatedArgs: RunAnalyticsArgs = {
    type: runArgs.type as 'report' | 'dashboard',
    resourceId: runArgs.resourceId as string,
    includeDetails: runArgs.includeDetails as boolean | undefined,
    filters: runArgs.filters as RunAnalyticsArgs['filters'],
    booleanFilter: runArgs.booleanFilter as string | undefined,
    standardDateFilter: runArgs.standardDateFilter as RunAnalyticsArgs['standardDateFilter'],
    topRows: runArgs.topRows as RunAnalyticsArgs['topRows'],
  };
  return await handleRunAnalytics(conn, validatedArgs);
}

case "salesforce_refresh_dashboard": {
  const refreshArgs = args as Record<string, unknown>;
  if (!refreshArgs.operation || !refreshArgs.dashboardId) {
    throw new Error('operation and dashboardId are required');
  }
  const validatedArgs: RefreshDashboardArgs = {
    operation: refreshArgs.operation as 'refresh' | 'status',
    dashboardId: refreshArgs.dashboardId as string,
  };
  return await handleRefreshDashboard(conn, validatedArgs);
}
```

---

## Error Handling

Follow existing patterns:
- Handlers return `{ content: [...], isError: true }` for expected failures.
- The top-level catch in `index.ts` handles unexpected errors.
- Add analytics-specific error context:
  - `REPORT_NOT_FOUND` / `ENTITY_IS_DELETED` → "Report with ID {id} not found. Use salesforce_list_analytics to find valid report IDs."
  - `INVALID_REPORT_METADATA` → "Invalid filter column or operator. Use salesforce_describe_analytics to see available columns and operators."
  - Permission errors → "Insufficient permissions. The connected user needs 'Run Reports' / 'View Dashboards' permission."
  - Report-only params on dashboard → "filters, includeDetails, booleanFilter, standardDateFilter, and topRows only apply to reports, not dashboards."

---

## File Summary

| File | Type | Description |
|------|------|-------------|
| `src/tools/listAnalytics.ts` | New | Tool definition, `ListAnalyticsArgs`, handler for listing/searching reports and dashboards |
| `src/tools/describeAnalytics.ts` | New | Tool definition, `DescribeAnalyticsArgs`, handler for report/dashboard metadata |
| `src/tools/runAnalytics.ts` | New | Tool definition, `RunAnalyticsArgs`, handler for executing reports and getting dashboard data |
| `src/tools/refreshDashboard.ts` | New | Tool definition, `RefreshDashboardArgs`, handler for dashboard refresh/status |
| `src/types/analytics.ts` | New | Re-exported jsforce analytics types shared across tool files |
| `src/index.ts` | Modified | Register 4 new tools (imports, tool list, switch cases) |
| `test/analytics.test.js` | New | Guardrail tests for tool definitions and input schemas |

---

## Testing Plan

### Testing approach

The existing test suite uses Node.js built-in test runner (`node:test` via `npm test`) and contains only repo guardrail tests — package.json validation and file existence checks. There are zero unit tests for any of the 15 existing tool handlers. No jsforce mocking infrastructure exists.

We match the existing testing bar for this PR: guardrail tests for our new tools plus manual sandbox testing. Adding unit tests with jsforce mocks for our 4 tools but not the existing 15 would be inconsistent and could create review friction. Unit test coverage for tool handlers across the whole server is a good follow-up enhancement.

### Automated tests

**File:** `test/analytics.test.js`

Guardrail-style tests using `node:test`, following the pattern in `test/package.test.js` and `test/repo.guardrails.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Import tool definitions (build output)
import { LIST_ANALYTICS } from '../dist/tools/listAnalytics.js';
import { DESCRIBE_ANALYTICS } from '../dist/tools/describeAnalytics.js';
import { RUN_ANALYTICS } from '../dist/tools/runAnalytics.js';
import { REFRESH_DASHBOARD } from '../dist/tools/refreshDashboard.js';

const tools = [LIST_ANALYTICS, DESCRIBE_ANALYTICS, RUN_ANALYTICS, REFRESH_DASHBOARD];

test('all analytics tools have required MCP tool properties', () => {
  for (const tool of tools) {
    assert.ok(tool.name, `tool should have a name`);
    assert.ok(tool.name.startsWith('salesforce_'), `${tool.name} should have salesforce_ prefix`);
    assert.ok(tool.description, `${tool.name} should have a description`);
    assert.ok(tool.inputSchema, `${tool.name} should have an inputSchema`);
    assert.equal(tool.inputSchema.type, 'object', `${tool.name} inputSchema type should be "object"`);
    assert.ok(tool.inputSchema.properties, `${tool.name} should have inputSchema.properties`);
  }
});

test('salesforce_list_analytics has correct schema', () => {
  const props = LIST_ANALYTICS.inputSchema.properties;
  assert.ok(props.type, 'should have type property');
  assert.deepEqual(props.type.enum, ['report', 'dashboard']);
  assert.deepEqual(LIST_ANALYTICS.inputSchema.required, ['type']);
});

test('salesforce_describe_analytics has correct schema', () => {
  const props = DESCRIBE_ANALYTICS.inputSchema.properties;
  assert.ok(props.type, 'should have type property');
  assert.ok(props.resourceId, 'should have resourceId property');
  assert.deepEqual(DESCRIBE_ANALYTICS.inputSchema.required, ['type', 'resourceId']);
});

test('salesforce_run_analytics has correct schema', () => {
  const props = RUN_ANALYTICS.inputSchema.properties;
  assert.ok(props.type, 'should have type property');
  assert.ok(props.resourceId, 'should have resourceId property');
  assert.ok(props.includeDetails, 'should have includeDetails property');
  assert.ok(props.filters, 'should have filters property');
  assert.ok(props.topRows, 'should have topRows property');
  assert.deepEqual(RUN_ANALYTICS.inputSchema.required, ['type', 'resourceId']);
});

test('salesforce_refresh_dashboard has correct schema', () => {
  const props = REFRESH_DASHBOARD.inputSchema.properties;
  assert.ok(props.operation, 'should have operation property');
  assert.ok(props.dashboardId, 'should have dashboardId property');
  assert.deepEqual(props.operation.enum, ['refresh', 'status']);
  assert.deepEqual(REFRESH_DASHBOARD.inputSchema.required, ['operation', 'dashboardId']);
});
```

These tests verify:
- All 4 tools export valid MCP tool definitions (name, description, inputSchema)
- Tool names follow the `salesforce_` prefix convention
- Input schemas have the correct required fields and enum values
- The `type` discriminator is properly defined on the combined tools

### Manual testing against a Salesforce sandbox

1. **List reports** — with and without search term
2. **List dashboards** — with and without search term
3. **Describe** a tabular, summary, and matrix report
4. **Describe** a dashboard
5. **Run** each report format with default filters
6. **Run** with filter overrides and date filter overrides
7. **Run** with `includeDetails: true` — verify detail rows appear and default 100-row cap message shows
8. **Run** with explicit `topRows` — verify it overrides the default cap
9. **Verify** truncation warning when `allData` is false
10. **Run** a dashboard — verify component data renders
11. **Refresh** a dashboard and check status
12. **Verify** report-only params on dashboard type produce a clear error

### Edge cases

- Report/dashboard with no results
- Report/dashboard the user doesn't have access to
- Dashboard with components in error state
- Invalid report/dashboard ID
- Report with `includeDetails: true` that exceeds 2,000 rows
