import jsforce from "jsforce";
type Connection = InstanceType<typeof jsforce.Connection>;
import { MetadataUtils, sanitizeApiName, buildReportFolderPath } from '../metadata/metadataUtils.js';

export interface ReportColumn {
  field: string;
}

export interface ReportGrouping {
  field: string;
  sortOrder?: 'Asc' | 'Desc';
  dateGranularity?: 'Day' | 'Week' | 'Month' | 'Quarter' | 'Year' | 'FiscalQuarter' | 'FiscalYear';
}

export interface ReportFilter {
  field: string;
  operator: 'equals' | 'notEqual' | 'lessThan' | 'greaterThan' | 'lessOrEqual' | 'greaterOrEqual' | 'contains' | 'notContain' | 'startsWith' | 'includes' | 'excludes';
  value: string;
}

export interface ReportChart {
  chartType: 'VerticalColumn' | 'VerticalColumnGrouped' | 'VerticalColumnStacked' | 'VerticalColumnStacked100' | 
              'HorizontalBar' | 'HorizontalBarGrouped' | 'HorizontalBarStacked' | 'HorizontalBarStacked100' |
              'Line' | 'LineGrouped' | 'Pie' | 'Donut' | 'Funnel' | 'Scatter';
  title?: string;
  subtitle?: string;
  groupingColumn?: string;
  aggregateColumn?: string;
  aggregateType?: 'Sum' | 'Average' | 'Min' | 'Max';
  showValues?: boolean;
  showPercentage?: boolean;
}

export interface CreateReportParams {
  name: string;
  reportType: string;
  format: 'TABULAR' | 'SUMMARY' | 'MATRIX';
  columns: string[];
  groupingsDown?: ReportGrouping[];
  groupingsAcross?: ReportGrouping[];
  filters?: ReportFilter[];
  chart?: ReportChart;
  folder?: string;
  description?: string;
}

/**
 * Convert field name to proper report field format
 * - Standard fields: uppercase (e.g., "Name" -> "OPPORTUNITY_NAME")
 * - Custom fields: ObjectName.FieldName__c (e.g., "Type__c" -> "Opportunity.Type__c")
 */
function formatReportFieldName(fieldName: string, objectName: string): string {
  // If it's already in the correct format (has a dot), return as-is
  if (fieldName.includes('.')) {
    return fieldName;
  }
  
  // If it's a custom field (ends with __c), add object prefix
  if (fieldName.endsWith('__c')) {
    return `${objectName}.${fieldName}`;
  }
  
  // For standard fields, try to keep as-is first (many work without conversion)
  // If this causes issues, we can add a mapping table
  return fieldName;
}

/**
 * Detect and extract date range filters from regular filters
 */
function extractDateRangeFilter(filters: ReportFilter[], objectName: string): {
  dateRangeFilter?: any;
  remainingFilters: ReportFilter[];
} {
  // Common date field patterns
  const dateFieldPatterns = ['DATE', 'CREATED_DATE', 'CLOSE_DATE', 'LAST_MODIFIED_DATE'];
  
  // Group filters by field
  const filtersByField = new Map<string, ReportFilter[]>();
  filters.forEach(filter => {
    const field = filter.field.toUpperCase();
    if (!filtersByField.has(field)) {
      filtersByField.set(field, []);
    }
    filtersByField.get(field)!.push(filter);
  });
  
  // Look for date range patterns
  for (const [field, fieldFilters] of filtersByField.entries()) {
    // Check if this looks like a date field
    const isDateField = dateFieldPatterns.some(pattern => field.includes(pattern));
    
    if (isDateField && fieldFilters.length >= 2) {
      // Look for start and end date
      const startFilter = fieldFilters.find(f => 
        f.operator === 'greaterOrEqual' || f.operator === 'greaterThan'
      );
      const endFilter = fieldFilters.find(f => 
        f.operator === 'lessOrEqual' || f.operator === 'lessThan'
      );
      
      if (startFilter && endFilter) {
        // Found a date range! Remove these from regular filters
        const remainingFilters = filters.filter(f => 
          !(f.field.toUpperCase() === field && 
            (f === startFilter || f === endFilter))
        );
        
        return {
          dateRangeFilter: {
            dateColumn: field,
            startDate: startFilter.value,
            endDate: endFilter.value,
            interval: 'INTERVAL_CUSTOM'
          },
          remainingFilters
        };
      }
    }
  }
  
  return { remainingFilters: filters };
}

/**
 * Create a Salesforce report using Metadata API
 */
export async function createReport(
  conn: Connection,
  params: CreateReportParams
): Promise<{ success: boolean; reportId?: string; reportName: string; error?: string }> {
  try {
    const metadataUtils = new MetadataUtils(conn);

    // Build report API name
    const reportApiName = sanitizeApiName(params.name);
    const folderPath = buildReportFolderPath(params.folder || 'Private Reports');
    const fullName = `${folderPath}/${reportApiName}`;

    // Build report metadata
    const reportMetadata: any = {
      columns: params.columns.map(field => ({ field })),
      format: params.format,
      name: params.name,
      reportType: params.reportType,
      scope: 'organization',
      showDetails: true
    };

    // Add description if provided
    if (params.description) {
      reportMetadata.description = params.description;
    }

    // Add groupings for SUMMARY and MATRIX reports
    if (params.format === 'SUMMARY' || params.format === 'MATRIX') {
      if (params.groupingsDown && params.groupingsDown.length > 0) {
        reportMetadata.groupingsDown = params.groupingsDown.map(g => ({
          dateGranularity: g.dateGranularity || 'Day',
          field: g.field,
          sortOrder: g.sortOrder || 'Asc'
        }));
      }

      if (params.format === 'MATRIX' && params.groupingsAcross && params.groupingsAcross.length > 0) {
        reportMetadata.groupingsAcross = params.groupingsAcross.map(g => ({
          dateGranularity: g.dateGranularity || 'Day',
          field: g.field,
          sortOrder: g.sortOrder || 'Asc'
        }));
      }

      reportMetadata.showGrandTotal = true;
      reportMetadata.showSubTotals = true;
    }

    // Process filters - detect date ranges and format field names
    if (params.filters && params.filters.length > 0) {
      // Extract date range filter if present
      const { dateRangeFilter, remainingFilters } = extractDateRangeFilter(
        params.filters, 
        params.reportType
      );
      
      // Add date range filter if found
      if (dateRangeFilter) {
        reportMetadata.timeFrameFilter = dateRangeFilter;
      }
      
      // Add remaining filters with proper field formatting
      if (remainingFilters.length > 0) {
        reportMetadata.filter = {
          criteriaItems: remainingFilters.map(f => ({
            column: formatReportFieldName(f.field, params.reportType),
            operator: f.operator,
            value: f.value,
            columnToColumn: false
          })),
        };
      }
    }

    // Add chart if specified
    if (params.chart) {
      reportMetadata.chart = {
        chartType: params.chart.chartType,
        enableHoverLabels: false,
        expandOthers: true,
        groupingColumn: params.chart.groupingColumn || (params.groupingsDown && params.groupingsDown[0]?.field),
        location: 'CHART_TOP',
        showAxisLabels: true,
        showPercentage: params.chart.showPercentage || false,
        showTotal: false,
        showValues: params.chart.showValues || false,
        size: 'Medium',
        summaryAxisRange: 'Auto',
        textColor: '#000000',
        textSize: 12,
        titleColor: '#000000',
        titleSize: 18
      };

      if (params.chart.title) {
        reportMetadata.chart.title = params.chart.title;
      }

      if (params.chart.subtitle) {
        reportMetadata.chart.subtitle = params.chart.subtitle;
      }
    }

    // Deploy the report
    const result = await metadataUtils.deployMetadata(reportMetadata, 'Report', fullName);

    if (result.success || result[0]?.success) {
      // Query to get the report ID
      const reports = await conn.query(
        `SELECT Id, Name FROM Report WHERE DeveloperName = '${reportApiName}' LIMIT 1`
      );

      return {
        success: true,
        reportId: reports.records[0]?.Id,
        reportName: fullName
      };
    } else {
      return {
        success: false,
        reportName: fullName,
        error: result.errors || result[0]?.errors || 'Unknown error occurred'
      };
    }
  } catch (error) {
    return {
      success: false,
      reportName: params.name,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Tool definition for MCP
 */
export const createReportTool = {
  name: 'salesforce_create_report',
  description: `Create a new Salesforce report using the Metadata API. Supports tabular, summary, and matrix formats with groupings, filters, and charts.

IMPORTANT FIELD NAMING:
- Use UPPERCASE for standard fields: OPPORTUNITY_NAME, AMOUNT, STAGE_NAME, CREATED_DATE, CLOSE_DATE
- Use exact API names for custom fields: Type__c (will be automatically prefixed with object name)
- Date range filters are automatically detected and converted to timeFrameFilter format

EXAMPLES:
1. MSP opportunities by month (2024-2025):
   - columns: ["OPPORTUNITY_NAME", "AMOUNT", "STAGE_NAME"]
   - filters: [
       {"field": "Type__c", "operator": "equals", "value": "MSP"},
       {"field": "CREATED_DATE", "operator": "greaterOrEqual", "value": "2024-01-01"},
       {"field": "CREATED_DATE", "operator": "lessOrEqual", "value": "2025-12-31"}
     ]
   - groupingsDown: [{"field": "CREATED_DATE", "dateGranularity": "Month"}]

2. Accounts by industry:
   - reportType: "Account"
   - columns: ["ACCOUNT_NAME", "INDUSTRY", "ANNUAL_REVENUE"]
   - filters: [{"field": "INDUSTRY", "operator": "notEqual", "value": ""}]`,
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the report'
      },
      reportType: {
        type: 'string',
        description: 'Report type (e.g., "Opportunity", "Account", "Contact"). This determines which object the report is based on.'
      },
      format: {
        type: 'string',
        enum: ['TABULAR', 'SUMMARY', 'MATRIX'],
        description: 'Report format: TABULAR (simple list), SUMMARY (with groupings and subtotals), or MATRIX (rows and columns)'
      },
      columns: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of field names in UPPERCASE (e.g., ["OPPORTUNITY_NAME", "AMOUNT", "STAGE_NAME"])'
      },
      groupingsDown: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string', description: 'Field name in UPPERCASE' },
            sortOrder: { type: 'string', enum: ['Asc', 'Desc'] },
            dateGranularity: { type: 'string', enum: ['Day', 'Week', 'Month', 'Quarter', 'Year', 'FiscalQuarter', 'FiscalYear'] }
          },
          required: ['field']
        },
        description: 'Groupings for rows (SUMMARY/MATRIX only)'
      },
      groupingsAcross: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            sortOrder: { type: 'string', enum: ['Asc', 'Desc'] },
            dateGranularity: { type: 'string', enum: ['Day', 'Week', 'Month', 'Quarter', 'Year'] }
          },
          required: ['field']
        },
        description: 'Groupings for columns (MATRIX only)'
      },
      filters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { 
              type: 'string',
              description: 'Field name (UPPERCASE for standard fields, exact API name for custom fields like Type__c)'
            },
            operator: { 
              type: 'string',
              enum: ['equals', 'notEqual', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual', 'contains', 'notContain', 'startsWith', 'includes', 'excludes']
            },
            value: { type: 'string' }
          },
          required: ['field', 'operator', 'value']
        },
        description: 'Filters to apply. Date ranges (two filters on same date field with greaterOrEqual/lessOrEqual) are automatically converted to timeFrameFilter.'
      },
      chart: {
        type: 'object',
        properties: {
          chartType: {
            type: 'string',
            enum: ['VerticalColumn', 'VerticalColumnGrouped', 'VerticalColumnStacked', 'HorizontalBar', 'Line', 'Pie', 'Donut', 'Funnel'],
            description: 'Type of chart to display'
          },
          title: { type: 'string' },
          groupingColumn: { type: 'string' },
          showValues: { type: 'boolean' },
          showPercentage: { type: 'boolean' }
        }
      },
      folder: {
        type: 'string',
        description: 'Report folder (default: "unfiled$public" for public reports)'
      },
      description: {
        type: 'string',
        description: 'Report description'
      }
    },
    required: ['name', 'reportType', 'format', 'columns']
  }
};