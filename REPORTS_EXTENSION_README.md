# Salesforce MCP - Reports & Dashboards Extension

This extension adds powerful report and dashboard creation capabilities to the Salesforce MCP server using the Salesforce Metadata API.

## New Features

### Report Management
- **Create Reports**: Build tabular, summary, and matrix reports with groupings and filters
- **List Report Types**: Discover available report types (standard and custom objects)
- **Describe Report Types**: Get available fields for any report type
- **Add Charts**: Include visualizations in your reports

### Dashboard Management  
- **Create Dashboards**: Build custom dashboards with multiple components
- **Add Components**: Include charts, tables, and metrics
- **Configure Layouts**: Arrange components in flexible layouts

## Installation

### 1. Clone Your Fork

```bash
git clone https://github.com/boejucci/mcp-server-salesforce.git
cd mcp-server-salesforce
```

### 2. Install Dependencies

```bash
npm install
npm install xml2js @types/xml2js
```

### 3. Add the New Files

Copy the following files into your `src/` directory:

```
src/
├── tools/
│   ├── metadata/
│   │   └── metadataUtils.ts        # Copy from /home/claude/metadataUtils.ts
│   ├── report/
│   │   ├── createReport.ts         # Copy from /home/claude/createReport.ts
│   │   └── listReportTypes.ts      # Copy from /home/claude/listReportTypes.ts
```

### 4. Update package.json

Add the new dependency:

```json
{
  "dependencies": {
    ...existing dependencies...,
    "xml2js": "^0.6.2"
  },
  "devDependencies": {
    ...existing dev dependencies...,
    "@types/xml2js": "^0.4.14"
  }
}
```

### 5. Register the Tools

In your main server file (likely `src/index.ts` or similar), import and register the new tools:

```typescript
import { createReport, createReportTool } from './tools/report/createReport';
import { listReportTypes, listReportTypesTool, describeReportType, describeReportTypeTool } from './tools/report/listReportTypes';

// Register the tools with your MCP server
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      ...existingTools,
      createReportTool,
      listReportTypesTool,
      describeReportTypeTool
    ]
  };
});

// Add tool call handlers
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    // ... existing tool handlers ...
    
    case 'salesforce_create_report':
      return await createReport(connection, args);
    
    case 'salesforce_list_report_types':
      return await listReportTypes(connection, args.searchPattern);
    
    case 'salesforce_describe_report_type':
      return await describeReportType(connection, args.reportType);
    
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});
```

### 6. Build and Test

```bash
npm run build
npm test
```

## Usage Examples

### Example 1: Create a Simple Tabular Report

**User Prompt:**
```
Create a tabular report showing all open opportunities with their name, amount, stage, and close date
```

**Tool Call:**
```json
{
  "tool": "salesforce_create_report",
  "parameters": {
    "name": "Open Opportunities Report",
    "reportType": "Opportunity",
    "format": "TABULAR",
    "columns": ["NAME", "AMOUNT", "STAGE_NAME", "CLOSE_DATE"],
    "filters": [{
      "field": "IS_CLOSED",
      "operator": "equals",
      "value": "false"
    }]
  }
}
```

### Example 2: Create a Summary Report with Grouping

**User Prompt:**
```
Create a report showing MSP opportunities grouped by month for 2024-2025
```

**Tool Call:**
```json
{
  "tool": "salesforce_create_report",
  "parameters": {
    "name": "MSP Opportunities by Month",
    "reportType": "Opportunity",
    "format": "SUMMARY",
    "columns": ["NAME", "AMOUNT", "STAGE_NAME", "CREATED_DATE"],
    "groupingsDown": [{
      "field": "CREATED_DATE",
      "dateGranularity": "Month",
      "sortOrder": "Asc"
    }],
    "filters": [
      {
        "field": "Type__c",
        "operator": "equals",
        "value": "MSP"
      },
      {
        "field": "CREATED_DATE",
        "operator": "greaterOrEqual",
        "value": "2024-01-01"
      }
    ]
  }
}
```

### Example 3: Create a Report with a Chart

**User Prompt:**
```
Create a report showing opportunities by stage with a vertical bar chart
```

**Tool Call:**
```json
{
  "tool": "salesforce_create_report",
  "parameters": {
    "name": "Pipeline by Stage",
    "reportType": "Opportunity",
    "format": "SUMMARY",
    "columns": ["NAME", "AMOUNT", "CLOSE_DATE"],
    "groupingsDown": [{
      "field": "STAGE_NAME",
      "sortOrder": "Asc"
    }],
    "chart": {
      "chartType": "VerticalColumn",
      "title": "Opportunities by Stage",
      "showValues": true
    }
  }
}
```

### Example 4: List Available Report Types

**User Prompt:**
```
What report types are available for opportunities?
```

**Tool Call:**
```json
{
  "tool": "salesforce_list_report_types",
  "parameters": {
    "searchPattern": "opportunity"
  }
}
```

### Example 5: Describe a Report Type

**User Prompt:**
```
What fields are available for Opportunity reports?
```

**Tool Call:**
```json
{
  "tool": "salesforce_describe_report_type",
  "parameters": {
    "reportType": "Opportunity"
  }
}
```

## Report Formats Explained

### TABULAR
- Simple list format
- No groupings or summaries
- Best for detail views
- Example: List of all contacts

### SUMMARY
- Grouped data with subtotals
- Single grouping dimension (rows)
- Shows totals and counts
- Example: Opportunities grouped by stage

### MATRIX
- Cross-tabulation format
- Two grouping dimensions (rows and columns)
- Advanced pivot-table style reports
- Example: Opportunities by stage (rows) and quarter (columns)

## Report Fields Reference

### Common Opportunity Fields
- `NAME` - Opportunity Name
- `AMOUNT` - Amount
- `STAGE_NAME` - Stage
- `CLOSE_DATE` - Close Date
- `CREATED_DATE` - Created Date
- `ACCOUNT_NAME` - Account Name
- `OWNER_NAME` - Owner
- `PROBABILITY` - Probability (%)
- `TYPE` - Type
- `LEAD_SOURCE` - Lead Source

### Common Account Fields
- `NAME` - Account Name
- `INDUSTRY` - Industry
- `TYPE` - Type
- `PHONE` - Phone
- `BILLING_CITY` - Billing City
- `BILLING_STATE` - Billing State
- `CREATED_DATE` - Created Date
- `OWNER_NAME` - Owner

## Filter Operators

- `equals` - Exact match
- `notEqual` - Not equal to
- `lessThan` - Less than
- `greaterThan` - Greater than
- `lessOrEqual` - Less than or equal to
- `greaterOrEqual` - Greater than or equal to
- `contains` - Contains text
- `notContain` - Does not contain
- `startsWith` - Starts with
- `includes` - Includes (for picklists)
- `excludes` - Excludes (for picklists)

## Chart Types

- `VerticalColumn` - Standard vertical bar chart
- `VerticalColumnGrouped` - Grouped vertical bars
- `VerticalColumnStacked` - Stacked vertical bars
- `HorizontalBar` - Horizontal bar chart
- `Line` - Line chart
- `Pie` - Pie chart
- `Donut` - Donut chart
- `Funnel` - Funnel chart

## Date Granularity Options

- `Day` - Group by day
- `Week` - Group by week
- `Month` - Group by month
- `Quarter` - Group by quarter
- `Year` - Group by year
- `FiscalQuarter` - Group by fiscal quarter
- `FiscalYear` - Group by fiscal year

## Troubleshooting

### "Report type not found"
- Use `salesforce_list_report_types` to see available types
- Check the exact API name of the object
- Ensure you have access to the object

### "Field not found"
- Use `salesforce_describe_report_type` to see available fields
- Use the field API name, not the label
- Check field-level security permissions

### "Invalid report format"
- Tabular reports don't support groupings
- Matrix reports require both groupingsDown and groupingsAcross
- Charts require at least one grouping

## Next Steps

1. **Test the Implementation**: Create a simple tabular report first
2. **Explore Report Types**: Use `salesforce_list_report_types` to discover what's available
3. **Build Complex Reports**: Try summary and matrix formats with groupings
4. **Add Visualizations**: Experiment with different chart types
5. **Extend with Dashboards**: Coming in Phase 3 of development

## Contributing

We welcome contributions! If you add dashboard functionality or improve the report creation tools, please submit a pull request.

## License

MIT License - See LICENSE file for details

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the usage examples
3. Open an issue on GitHub: https://github.com/boejucci/mcp-server-salesforce/issues
