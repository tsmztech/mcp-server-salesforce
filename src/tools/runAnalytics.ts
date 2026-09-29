import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ReportExecuteResult, ReportExecuteOptions, DashboardResult } from "../types/analytics.js";

const DEFAULT_DETAIL_ROW_LIMIT = 100;
const DISPLAY_ROW_CAP = 100;

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

export async function handleRunAnalytics(conn: any, args: RunAnalyticsArgs) {
  const { type, resourceId } = args;

  try {
    if (type === 'report') {
      return await runReport(conn, args);
    } else {
      // Warn if report-only params are provided for dashboards
      if (args.filters || args.includeDetails || args.booleanFilter || args.standardDateFilter || args.topRows) {
        return {
          content: [{
            type: "text",
            text: 'filters, includeDetails, booleanFilter, standardDateFilter, and topRows only apply to reports, not dashboards. Remove these parameters and try again.'
          }],
          isError: true,
        };
      }
      return await runDashboard(conn, resourceId);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    let enhancedError = errorMessage;

    if (errorMessage.includes('NOT_FOUND') || errorMessage.includes('ENTITY_IS_DELETED')) {
      enhancedError = `${type === 'report' ? 'Report' : 'Dashboard'} with ID "${resourceId}" not found. Use salesforce_list_analytics to find valid IDs.`;
    } else if (errorMessage.includes('INVALID_REPORT_METADATA')) {
      enhancedError = `Invalid filter column or operator. Use salesforce_describe_analytics to see available columns and operators.`;
    } else if (errorMessage.includes('INSUFFICIENT_ACCESS') || errorMessage.includes('INSUFFICIENT_PRIVILEGES')) {
      enhancedError = `Insufficient permissions. The connected user needs '${type === 'report' ? 'Run Reports' : 'View Dashboards'}' permission.`;
    }

    return {
      content: [{
        type: "text",
        text: `Error running ${type}: ${enhancedError}`
      }],
      isError: true,
    };
  }
}

async function runReport(conn: any, args: RunAnalyticsArgs) {
  const report = conn.analytics.report(args.resourceId);

  // Apply default detail row cap when includeDetails is true and no explicit topRows
  let defaultApplied = !!(args.includeDetails && !args.topRows);
  let effectiveTopRows = args.topRows ??
    (args.includeDetails ? { rowLimit: DEFAULT_DETAIL_ROW_LIMIT, direction: "Desc" } : undefined);

  // Build execution options
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
      } as any
    };
  }

  let result: ReportExecuteResult;
  let topRowsIgnored = false;
  try {
    result = await report.execute(options);
  } catch (error) {
    // Some report formats/configurations don't support topRows — retry without it
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('row limit filter') && effectiveTopRows) {
      defaultApplied = false;
      topRowsIgnored = !!args.topRows; // track if user-provided topRows was dropped
      effectiveTopRows = undefined;
      if (options.metadata?.reportMetadata) {
        delete (options.metadata.reportMetadata as any).topRows;
        if (Object.keys(options.metadata.reportMetadata).length === 0) {
          delete options.metadata;
        }
      }
      result = await report.execute(options);
    } else {
      throw error;
    }
  }

  // Format the result
  const output = formatReportResult(result, defaultApplied, topRowsIgnored);

  return {
    content: [{
      type: "text",
      text: output
    }],
    isError: false,
  };
}

function formatReportResult(result: ReportExecuteResult, defaultCapApplied: boolean, topRowsIgnored: boolean = false): string {
  const metadata = result.reportMetadata;
  const extMetadata = result.reportExtendedMetadata;
  const warnings: string[] = [];

  let output = `Report: ${metadata.name}\n`;
  output += `Format: ${metadata.reportFormat}\n\n`;

  // Grand totals (always at T!T)
  const grandTotal = result.factMap['T!T'];
  if (grandTotal) {
    output += `Grand Totals:\n`;
    const aggKeys = Object.keys(extMetadata.aggregateColumnInfo);
    grandTotal.aggregates.forEach((agg, i) => {
      const label = aggKeys[i] ? extMetadata.aggregateColumnInfo[aggKeys[i]]?.label || aggKeys[i] : `Aggregate ${i + 1}`;
      output += `  ${label}: ${agg.label}\n`;
    });
    output += '\n';
  }

  // Grouping summaries
  if (result.groupingsDown?.groupings && result.groupingsDown.groupings.length > 0) {
    output += `Grouping Summary:\n`;
    output += formatGroupings(result.groupingsDown.groupings, result.factMap, extMetadata, 'T', 1);
    output += '\n';
  }

  // Matrix: column groupings
  if (result.groupingsAcross?.groupings && result.groupingsAcross.groupings.length > 0) {
    output += `Column Groupings:\n`;
    for (const g of result.groupingsAcross.groupings) {
      output += `  ${g.label}\n`;
    }
    output += '\n';
  }

  // Detail rows
  if (result.hasDetailRows) {
    const allRows = collectDetailRows(result);
    if (allRows.length > 0) {
      // Column headers
      const detailCols = metadata.detailColumns || [];
      const headers = detailCols.map(col => {
        const info = extMetadata.detailColumnInfo[col];
        return info?.label || col;
      });

      output += `Detail Rows:\n`;
      output += `  ${headers.join('\t')}\n`;

      const displayCount = Math.min(allRows.length, DISPLAY_ROW_CAP);
      for (let i = 0; i < displayCount; i++) {
        const row = allRows[i];
        const cells = row.dataCells.map((cell: any) => cell.label ?? String(cell.value ?? '')).join('\t');
        output += `  ${cells}\n`;
      }

      if (allRows.length > DISPLAY_ROW_CAP) {
        warnings.push(`Showing ${DISPLAY_ROW_CAP} of ${allRows.length} detail rows. Use topRows to adjust.`);
      }
    }
  }

  // Warnings
  if (!result.allData) {
    warnings.push('Results are truncated. The report has more rows than the 2,000 row API limit. Use salesforce_describe_analytics to see available filter columns, then narrow with filters or adjust topRows.');
  }

  if (defaultCapApplied) {
    warnings.push(`Showing up to ${DEFAULT_DETAIL_ROW_LIMIT} detail rows (default limit). Provide topRows to adjust.`);
  }

  if (topRowsIgnored) {
    warnings.push('topRows was ignored because this report format does not support row limit filters. All available detail rows are included.');
  }

  if (warnings.length > 0) {
    output += '\n';
    for (const w of warnings) {
      output += `Note: ${w}\n`;
    }
  }

  return output;
}

function formatGroupings(
  groupings: any[],
  factMap: Record<string, any>,
  extMetadata: any,
  acrossKey: string,
  depth: number
): string {
  let output = '';
  const indent = '  '.repeat(depth);

  for (const g of groupings) {
    output += `${indent}${g.label}:\n`;

    // Look up this grouping's factMap entry
    const factKey = `${g.key}!${acrossKey}`;
    const fact = factMap[factKey];
    if (fact) {
      const aggKeys = Object.keys(extMetadata.aggregateColumnInfo);
      fact.aggregates.forEach((agg: any, i: number) => {
        const label = aggKeys[i] ? extMetadata.aggregateColumnInfo[aggKeys[i]]?.label || aggKeys[i] : `Aggregate ${i + 1}`;
        output += `${indent}  ${label}: ${agg.label}\n`;
      });
    }

    // Recurse into nested groupings
    if (g.groupings && g.groupings.length > 0) {
      output += formatGroupings(g.groupings, factMap, extMetadata, acrossKey, depth + 1);
    }
  }

  return output;
}

function collectDetailRows(result: ReportExecuteResult): any[] {
  const rows: any[] = [];
  for (const key of Object.keys(result.factMap)) {
    const fact = result.factMap[key];
    if (fact.rows) {
      rows.push(...fact.rows);
    }
  }
  return rows;
}

async function runDashboard(conn: any, dashboardId: string) {
  const dashboard = conn.analytics.dashboard(dashboardId);
  const result: DashboardResult = await dashboard.components();

  const meta = result.dashboardMetadata;
  let output = `Dashboard: ${meta.name}\n`;
  output += `Running User: ${meta.runningUser?.displayName || '(unknown)'}\n\n`;

  if (!result.componentData || result.componentData.length === 0) {
    output += 'No component data available.\n';
    return {
      content: [{
        type: "text",
        text: output
      }],
      isError: false,
    };
  }

  // Build a lookup from component index to component metadata
  const componentMeta = meta.components || [];

  for (const cd of result.componentData) {
    const comp = componentMeta.find((c: any) => c.id === cd.componentId);
    const header = comp?.header || cd.componentId;
    const vizType = (comp?.properties as any)?.visualizationType || comp?.type || 'unknown';

    output += `--- ${header} [${vizType}] ---\n`;

    // Component status
    if (cd.status) {
      if (cd.status.dataStatus === 'ERROR') {
        output += `  Status: ERROR — ${cd.status.errorMessage || 'Unknown error'}\n`;
        continue;
      }
      if (cd.status.dataStatus === 'NODATA') {
        output += `  No data available\n`;
        continue;
      }
    }

    // Report result for this component
    const rr = cd.reportResult;
    if (rr) {
      const extMeta = rr.reportExtendedMetadata;

      // Grand total
      const gt = rr.factMap['T!T'];
      if (gt) {
        const aggKeys = Object.keys(extMeta.aggregateColumnInfo);
        gt.aggregates.forEach((agg, i) => {
          const label = aggKeys[i] ? extMeta.aggregateColumnInfo[aggKeys[i]]?.label || aggKeys[i] : `Aggregate ${i + 1}`;
          output += `  ${label}: ${agg.label}\n`;
        });
      }

      // Grouping summaries
      if (rr.groupingsDown?.groupings && rr.groupingsDown.groupings.length > 0) {
        output += formatGroupings(rr.groupingsDown.groupings, rr.factMap, extMeta, 'T', 1);
      }
    }

    output += '\n';
  }

  return {
    content: [{
      type: "text",
      text: output
    }],
    isError: false,
  };
}
