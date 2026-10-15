import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ReportDescribeResult, DashboardMetadata } from "../types/analytics.js";

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

export async function handleDescribeAnalytics(conn: any, args: DescribeAnalyticsArgs) {
  const { type, resourceId } = args;

  try {
    if (type === 'report') {
      return await describeReport(conn, resourceId);
    } else {
      return await describeDashboard(conn, resourceId);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    let enhancedError = errorMessage;

    if (errorMessage.includes('NOT_FOUND') || errorMessage.includes('ENTITY_IS_DELETED')) {
      enhancedError = `${type === 'report' ? 'Report' : 'Dashboard'} with ID "${resourceId}" not found. Use salesforce_list_analytics to find valid IDs.`;
    } else if (errorMessage.includes('INSUFFICIENT_ACCESS') || errorMessage.includes('INSUFFICIENT_PRIVILEGES')) {
      enhancedError = `Insufficient permissions. The connected user needs '${type === 'report' ? 'Run Reports' : 'View Dashboards'}' permission.`;
    }

    return {
      content: [{
        type: "text",
        text: `Error describing ${type}: ${enhancedError}`
      }],
      isError: true,
    };
  }
}

async function describeReport(conn: any, reportId: string) {
  const report = conn.analytics.report(reportId);
  const desc: ReportDescribeResult = await report.describe();

  const metadata = desc.reportMetadata;
  const extMetadata = desc.reportExtendedMetadata;

  let output = `Report: ${metadata.name}\n`;
  output += `Format: ${metadata.reportFormat}\n`;
  output += `Report Type: ${metadata.reportType.label}\n`;

  // Detail columns
  if (metadata.detailColumns && metadata.detailColumns.length > 0) {
    output += `\nDetail Columns:\n`;
    for (const col of metadata.detailColumns) {
      const info = extMetadata.detailColumnInfo[col];
      if (info) {
        output += `  - ${info.label} (${col}) — ${info.dataType}\n`;
      } else {
        output += `  - ${col}\n`;
      }
    }
  }

  // Row groupings
  if (metadata.groupingsDown && metadata.groupingsDown.length > 0) {
    output += `\nRow Groupings:\n`;
    for (const g of metadata.groupingsDown) {
      const info = extMetadata.groupingColumnInfo?.[g.name];
      const label = info?.label || g.name;
      output += `  - ${label} (${g.name}), granularity: ${g.dateGranularity}\n`;
    }
  }

  // Column groupings
  if (metadata.groupingsAcross && metadata.groupingsAcross.length > 0) {
    output += `\nColumn Groupings:\n`;
    for (const g of metadata.groupingsAcross) {
      const info = extMetadata.groupingColumnInfo?.[g.name];
      const label = info?.label || g.name;
      output += `  - ${label} (${g.name}), granularity: ${g.dateGranularity}\n`;
    }
  }

  // Aggregates
  if (metadata.aggregates && metadata.aggregates.length > 0) {
    output += `\nAggregates:\n`;
    for (const agg of metadata.aggregates) {
      const info = extMetadata.aggregateColumnInfo[agg];
      output += `  - ${info?.label || agg}\n`;
    }
  }

  // Filters
  if (metadata.reportFilters && metadata.reportFilters.length > 0) {
    output += `\nCurrent Filters:\n`;
    for (const f of metadata.reportFilters) {
      output += `  - ${f.column} ${f.operator} "${f.value}"\n`;
    }
  }

  // Boolean filter logic
  if (metadata.reportBooleanFilter) {
    output += `\nBoolean Filter Logic: ${metadata.reportBooleanFilter}\n`;
  }

  // Standard date filter
  if (metadata.standardDateFilter) {
    const sdf = metadata.standardDateFilter;
    output += `\nStandard Date Filter:\n`;
    output += `  Column: ${sdf.column}, Range: ${sdf.durationValue}`;
    if (sdf.startDate || sdf.endDate) {
      output += ` (${sdf.startDate || '...'} to ${sdf.endDate || '...'})`;
    }
    output += '\n';
  }

  // Scope
  if (metadata.scope) {
    output += `\nScope: ${metadata.scope}\n`;
  }

  return {
    content: [{
      type: "text",
      text: output
    }],
    isError: false,
  };
}

async function describeDashboard(conn: any, dashboardId: string) {
  const dashboard = conn.analytics.dashboard(dashboardId);
  const desc: DashboardMetadata = await dashboard.describe();

  let output = `Dashboard: ${desc.name}\n`;
  output += `Running User: ${desc.runningUser?.displayName || '(unknown)'}\n`;
  if (desc.dashboardType) {
    output += `Type: ${desc.dashboardType}\n`;
  }
  if (desc.description) {
    output += `Description: ${desc.description}\n`;
  }

  // Filters
  if (desc.filters && desc.filters.length > 0) {
    output += `\nFilters:\n`;
    for (const f of desc.filters) {
      output += `  - ${f.name}: ${f.selectedOption || '(none)'}\n`;
    }
  }

  // Components
  if (desc.components && desc.components.length > 0) {
    output += `\nComponents (${desc.components.length}):\n`;
    for (const c of desc.components) {
      const header = c.header || '(untitled)';
      const vizType = (c.properties as any)?.visualizationType || c.type || 'unknown';
      output += `  - ${header} [${c.type} — ${vizType}]\n`;
      if (c.reportId) {
        output += `    Report: ${c.reportId}\n`;
      }
    }
  }

  return {
    content: [{
      type: "text",
      text: output
    }],
    isError: false,
  };
}
