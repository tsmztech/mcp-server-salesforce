import jsforce from "jsforce";
type Connection = InstanceType<typeof jsforce.Connection>;
import { MetadataUtils } from '../metadata/metadataUtils.js';

/**
 * Read report metadata from Salesforce
 */
export async function readReport(
  conn: Connection,
  reportName: string
): Promise<{ success: boolean; metadata?: any; error?: string }> {
  try {
    const metadataUtils = new MetadataUtils(conn);
    
    // Retrieve the report metadata
    const result = await metadataUtils.retrieveMetadata('Report', reportName);
    
    return {
      success: true,
      metadata: result
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * List all reports (or search by pattern)
 */
export async function listReports(
  conn: Connection,
  searchPattern?: string
): Promise<{ success: boolean; reports?: any[]; error?: string }> {
  try {
    const metadataUtils = new MetadataUtils(conn);
    
    // List all reports
    const results = await metadataUtils.listMetadata('Report');
    
    // Filter by search pattern if provided
    let filteredReports = results;
    if (searchPattern) {
      const pattern = searchPattern.toLowerCase();
      filteredReports = results.filter((report: any) => 
        report.fullName.toLowerCase().includes(pattern) ||
        (report.namespacePrefix && report.namespacePrefix.toLowerCase().includes(pattern))
      );
    }
    
    return {
      success: true,
      reports: filteredReports
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Tool definition for reading report metadata
 */
export const readReportTool = {
  name: 'salesforce_read_report',
  description: 'Read detailed metadata for a Salesforce report including columns, filters, groupings, and chart configuration. Use this to inspect existing reports and understand their structure.',
  inputSchema: {
    type: 'object',
    properties: {
      reportName: {
        type: 'string',
        description: 'Full name of the report (e.g., "unfiled$public/Report_Name" or just "Report_Name")'
      }
    },
    required: ['reportName']
  }
};

/**
 * Tool definition for listing reports
 */
export const listReportsTool = {
  name: 'salesforce_list_reports',
  description: 'List all reports in Salesforce or search for reports by name pattern. Returns report names and IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      searchPattern: {
        type: 'string',
        description: 'Optional search pattern to filter reports by name'
      }
    }
  }
};
