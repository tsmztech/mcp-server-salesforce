import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DashboardRefreshResult, DashboardStatusResult } from "../types/analytics.js";

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

export async function handleRefreshDashboard(conn: any, args: RefreshDashboardArgs) {
  const { operation, dashboardId } = args;

  try {
    const dashboard = conn.analytics.dashboard(dashboardId);

    if (operation === 'refresh') {
      const result: DashboardRefreshResult = await dashboard.refresh();
      return {
        content: [{
          type: "text",
          text: `Dashboard refresh initiated. Status URL: ${result.statusUrl}\n\nUse operation "status" to check progress, then salesforce_run_analytics with type "dashboard" to retrieve updated data.`
        }],
        isError: false,
      };
    } else {
      const result: DashboardStatusResult = await dashboard.status();

      if (!result.componentStatus || result.componentStatus.length === 0) {
        return {
          content: [{
            type: "text",
            text: 'No component status available for this dashboard.'
          }],
          isError: false,
        };
      }

      let output = 'Dashboard Refresh Status:\n\n';
      for (const cs of result.componentStatus) {
        output += `Component ${cs.componentId}:\n`;
        output += `  Status: ${cs.refreshStatus}\n`;
        output += `  Last Refresh: ${cs.refreshDate || '(never)'}\n\n`;
      }

      return {
        content: [{
          type: "text",
          text: output
        }],
        isError: false,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    let enhancedError = errorMessage;

    if (errorMessage.includes('NOT_FOUND') || errorMessage.includes('ENTITY_IS_DELETED')) {
      enhancedError = `Dashboard with ID "${dashboardId}" not found. Use salesforce_list_analytics with type "dashboard" to find valid IDs.`;
    } else if (errorMessage.includes('INSUFFICIENT_ACCESS') || errorMessage.includes('INSUFFICIENT_PRIVILEGES')) {
      enhancedError = `Insufficient permissions. The connected user needs 'View Dashboards' permission.`;
    }

    return {
      content: [{
        type: "text",
        text: `Error ${operation === 'refresh' ? 'refreshing' : 'checking status of'} dashboard: ${enhancedError}`
      }],
      isError: true,
    };
  }
}
