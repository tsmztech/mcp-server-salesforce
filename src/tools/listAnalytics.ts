import { Tool } from "@modelcontextprotocol/sdk/types.js";

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

export async function handleListAnalytics(conn: any, args: ListAnalyticsArgs) {
  const { type, searchTerm } = args;

  try {
    if (type === 'report') {
      return await listReports(conn, searchTerm);
    } else {
      return await listDashboards(conn, searchTerm);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text",
        text: `Error listing ${type}s: ${errorMessage}`
      }],
      isError: true,
    };
  }
}

async function listReports(conn: any, searchTerm?: string) {
  if (searchTerm) {
    // SOQL search for broader results
    const escapedTerm = searchTerm.replace(/'/g, "\\'");
    const soql = `SELECT Id, Name, FolderName, Format, Description FROM Report WHERE Name LIKE '%${escapedTerm}%' ORDER BY Name LIMIT 100`;
    const result = await conn.query(soql);

    if (result.records.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No reports found matching "${searchTerm}".`
        }],
        isError: false,
      };
    }

    const formatted = result.records.map((r: any) =>
      `${r.Id} — ${r.Name}\n  Folder: ${r.FolderName || '(none)'}\n  Format: ${r.Format || 'unknown'}`
    ).join('\n\n');

    return {
      content: [{
        type: "text",
        text: `Found ${result.records.length} reports matching "${searchTerm}":\n\n${formatted}`
      }],
      isError: false,
    };
  } else {
    // Recent reports via analytics API
    const reports = await conn.analytics.reports();

    if (reports.length === 0) {
      return {
        content: [{
          type: "text",
          text: 'No recently viewed reports found.'
        }],
        isError: false,
      };
    }

    const formatted = reports.map((r: any) =>
      `${r.id} — ${r.name}`
    ).join('\n\n');

    return {
      content: [{
        type: "text",
        text: `Found ${reports.length} recently viewed reports:\n\n${formatted}`
      }],
      isError: false,
    };
  }
}

async function listDashboards(conn: any, searchTerm?: string) {
  if (searchTerm) {
    // SOQL search for broader results
    const escapedTerm = searchTerm.replace(/'/g, "\\'");
    const soql = `SELECT Id, Title, FolderName, Description FROM Dashboard WHERE Title LIKE '%${escapedTerm}%' ORDER BY Title LIMIT 100`;
    const result = await conn.query(soql);

    if (result.records.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No dashboards found matching "${searchTerm}".`
        }],
        isError: false,
      };
    }

    const formatted = result.records.map((r: any) =>
      `${r.Id} — ${r.Title}\n  Folder: ${r.FolderName || '(none)'}`
    ).join('\n\n');

    return {
      content: [{
        type: "text",
        text: `Found ${result.records.length} dashboards matching "${searchTerm}":\n\n${formatted}`
      }],
      isError: false,
    };
  } else {
    // Recent dashboards via analytics API
    const dashboards = await conn.analytics.dashboards();

    if (dashboards.length === 0) {
      return {
        content: [{
          type: "text",
          text: 'No recently viewed dashboards found.'
        }],
        isError: false,
      };
    }

    const formatted = dashboards.map((d: any) =>
      `${d.id} — ${d.name}`
    ).join('\n\n');

    return {
      content: [{
        type: "text",
        text: `Found ${dashboards.length} recently viewed dashboards:\n\n${formatted}`
      }],
      isError: false,
    };
  }
}
