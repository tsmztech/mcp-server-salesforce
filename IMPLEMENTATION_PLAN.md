# Salesforce MCP Extension: Reports & Dashboards

## Overview
This document outlines the plan to extend the existing Salesforce MCP server with Metadata API capabilities for creating and managing reports and dashboards.

## Architecture Changes

### 1. Dependencies to Add
- **jsforce**: Already in use, verify Metadata API support is enabled
- **xml2js**: For XML parsing/building (Metadata API uses XML)
- **@types/xml2js**: TypeScript definitions

### 2. New Files to Create

```
src/
├── tools/
│   ├── report/
│   │   ├── createReport.ts          # Create reports using Metadata API
│   │   ├── listReportTypes.ts       # List available report types
│   │   ├── describeReportType.ts    # Get report type details
│   │   └── cloneReport.ts           # Clone existing reports
│   ├── dashboard/
│   │   ├── createDashboard.ts       # Create dashboards
│   │   ├── addDashboardComponent.ts # Add components to dashboards
│   │   └── refreshDashboard.ts      # Refresh dashboard data
│   └── metadata/
│       ├── deployMetadata.ts        # Generic metadata deployment
│       └── retrieveMetadata.ts      # Generic metadata retrieval
```

### 3. Key Capabilities

#### Report Creation
- **salesforce_create_report**: Create new tabular, summary, or matrix reports
- **salesforce_list_report_types**: List available report types (Opportunity, Account, etc.)
- **salesforce_describe_report_type**: Get fields available for a report type
- **salesforce_clone_report**: Clone and modify existing reports

#### Dashboard Creation
- **salesforce_create_dashboard**: Create new dashboards
- **salesforce_add_dashboard_component**: Add charts/tables to dashboards
- **salesforce_refresh_dashboard**: Refresh dashboard data
- **salesforce_list_dashboards**: List existing dashboards

## Implementation Approach

### Phase 1: Metadata API Integration
1. Add JSforce Metadata API wrapper
2. Create XML builders for Report and Dashboard metadata
3. Implement metadata deployment function

### Phase 2: Report Tools
1. Implement `salesforce_create_report`
   - Support tabular, summary, and matrix formats
   - Handle groupings and aggregations
   - Support filters and sorting
2. Implement `salesforce_list_report_types`
3. Implement `salesforce_clone_report`

### Phase 3: Dashboard Tools
1. Implement `salesforce_create_dashboard`
2. Implement `salesforce_add_dashboard_component`
   - Chart types: Bar, Line, Pie, Donut, Funnel
   - Table components
3. Implement dashboard refresh

### Phase 4: Testing & Documentation
1. Add unit tests for each tool
2. Update README with new capabilities
3. Add usage examples

## Technical Details

### Report Metadata Structure (XML)
```xml
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <columns>
        <field>FIELD_NAME</field>
    </columns>
    <format>TABULAR|SUMMARY|MATRIX</format>
    <name>Report Name</name>
    <reportType>OpportunityReport</reportType>
    <scope>organization</scope>
    <showDetails>true</showDetails>
    <groupingsDown>
        <dateGranularity>Day</dateGranularity>
        <field>FIELD_NAME</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>
    <chart>
        <chartType>VerticalColumn</chartType>
        <enableHoverLabels>false</enableHoverLabels>
        <expandOthers>true</expandOthers>
        <groupingColumn>FIELD_NAME</groupingColumn>
        <location>CHART_TOP</location>
        <showAxisLabels>true</showAxisLabels>
        <showPercentage>false</showPercentage>
        <showTotal>false</showTotal>
        <showValues>false</showValues>
        <size>Medium</size>
        <summaryAxisRange>Auto</summaryAxisRange>
        <textColor>#000000</textColor>
        <textSize>12</textSize>
        <titleColor>#000000</titleColor>
        <titleSize>18</titleSize>
    </chart>
</Report>
```

### Dashboard Metadata Structure (XML)
```xml
<Dashboard xmlns="http://soap.sforce.com/2006/04/metadata">
    <backgroundEndColor>#FFFFFF</backgroundEndColor>
    <backgroundFadeDirection>Diagonal</backgroundFadeDirection>
    <backgroundStartColor>#FFFFFF</backgroundStartColor>
    <dashboardType>SpecifiedUser</dashboardType>
    <isGridLayout>false</isGridLayout>
    <runningUser>user@example.com</runningUser>
    <textColor>#000000</textColor>
    <title>Dashboard Title</title>
    <titleColor>#000000</titleColor>
    <titleSize>12</titleSize>
    <leftSection>
        <columnSize>Medium</columnSize>
        <components>
            <componentType>Bar</componentType>
            <displayUnits>Auto</displayUnits>
            <footer>Component Footer</footer>
            <header>Component Header</header>
            <report>Report_API_Name</report>
        </components>
    </leftSection>
</Dashboard>
```

## Usage Examples

### Creating a Report
```typescript
// User prompt: "Create a report showing MSP opportunities by month for 2024-2025"
// Tool call:
{
  tool: "salesforce_create_report",
  parameters: {
    name: "MSP Opportunities by Month",
    reportType: "Opportunity",
    format: "SUMMARY",
    columns: ["NAME", "AMOUNT", "STAGE_NAME", "CREATED_DATE"],
    groupings: [{
      field: "CREATED_DATE",
      dateGranularity: "Month",
      sortOrder: "Asc"
    }],
    filters: [{
      field: "Type__c",
      operator: "equals",
      value: "MSP"
    }, {
      field: "CREATED_DATE",
      operator: "greaterOrEqual",
      value: "2024-01-01"
    }],
    folder: "Private Reports"
  }
}
```

### Creating a Dashboard
```typescript
// User prompt: "Create a dashboard with a chart showing opportunities by stage"
// Tool call:
{
  tool: "salesforce_create_dashboard",
  parameters: {
    title: "Sales Pipeline Dashboard",
    runningUser: "current",
    components: [{
      type: "Bar",
      report: "Opportunities_by_Stage",
      header: "Pipeline by Stage",
      chartType: "VerticalColumn"
    }]
  }
}
```

## Next Steps

1. Review this plan
2. Install dependencies: `npm install xml2js @types/xml2js`
3. Create the new tool files
4. Implement metadata deployment utilities
5. Test with your Salesforce org
6. Update documentation
7. Publish to npm (optional)

## Benefits

- **Natural Language**: "Create a report showing..." → MCP handles the complexity
- **Comprehensive**: Full CRUD for reports and dashboards
- **Flexible**: Support all report formats and chart types
- **Integrated**: Works seamlessly with existing tools
- **Maintainable**: Clean separation of concerns

## Estimated Effort

- Phase 1: 2-3 hours
- Phase 2: 3-4 hours  
- Phase 3: 2-3 hours
- Phase 4: 2-3 hours

**Total**: ~10-13 hours of development time
