import jsforce from "jsforce";
type Connection = InstanceType<typeof jsforce.Connection>;

export interface ReportTypeInfo {
  type: string;
  label: string;
  category?: string;
}

/**
 * List available report types in Salesforce
 */
export async function listReportTypes(
  conn: Connection,
  searchPattern?: string
): Promise<{ success: boolean; reportTypes?: ReportTypeInfo[]; error?: string }> {
  try {
    // Query ReportType metadata
    // Note: We'll use the Analytics API to get report types
    const endpoint = `${conn.instanceUrl}/services/data/v59.0/analytics/reportTypes`;
    
    const response = await conn.request(endpoint);
    
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid response from Salesforce API');
    }

    const reportTypesData: any = response;
    let reportTypes: ReportTypeInfo[] = [];

    // Parse the response based on API format
    if (Array.isArray(reportTypesData)) {
      reportTypes = reportTypesData.map((rt: any) => ({
        type: rt.type || rt.developerName,
        label: rt.label,
        category: rt.category
      }));
    } else if (reportTypesData.reportTypeList) {
      reportTypes = reportTypesData.reportTypeList.map((rt: any) => ({
        type: rt.type || rt.developerName,
        label: rt.label,
        category: rt.category
      }));
    }

    // Filter by search pattern if provided
    if (searchPattern) {
      const pattern = searchPattern.toLowerCase();
      reportTypes = reportTypes.filter(rt => 
        rt.type.toLowerCase().includes(pattern) ||
        rt.label.toLowerCase().includes(pattern)
      );
    }

    return {
      success: true,
      reportTypes: reportTypes
    };
  } catch (error) {
    // Fallback: Query common object types
    try {
      const commonTypes: ReportTypeInfo[] = [
        { type: 'Opportunity', label: 'Opportunities', category: 'Sales' },
        { type: 'Account', label: 'Accounts', category: 'Customers' },
        { type: 'Contact', label: 'Contacts', category: 'Customers' },
        { type: 'Lead', label: 'Leads', category: 'Sales' },
        { type: 'Case', label: 'Cases', category: 'Service' },
        { type: 'Task', label: 'Tasks', category: 'Activities' },
        { type: 'Event', label: 'Events', category: 'Activities' },
        { type: 'Campaign', label: 'Campaigns', category: 'Marketing' },
        { type: 'Quote', label: 'Quotes', category: 'Sales' },
        { type: 'Order', label: 'Orders', category: 'Sales' },
        { type: 'Contract', label: 'Contracts', category: 'Sales' },
        { type: 'Product2', label: 'Products', category: 'Products' },
        { type: 'Pricebook2', label: 'Price Books', category: 'Products' },
        { type: 'User', label: 'Users', category: 'Administration' }
      ];

      // Get custom objects
      const customObjects = await conn.describeGlobal();
      const customReportTypes = customObjects.sobjects
        .filter((obj: any) => obj.customSetting === false && obj.queryable === true)
        .filter((obj: any) => obj.name.endsWith('__c'))
        .map((obj: any) => ({
          type: obj.name,
          label: obj.label,
          category: 'Custom Objects'
        }));

      let allTypes = [...commonTypes, ...customReportTypes];

      // Filter by search pattern if provided
      if (searchPattern) {
        const pattern = searchPattern.toLowerCase();
        allTypes = allTypes.filter(rt => 
          rt.type.toLowerCase().includes(pattern) ||
          rt.label.toLowerCase().includes(pattern)
        );
      }

      return {
        success: true,
        reportTypes: allTypes
      };
    } catch (fallbackError) {
      return {
        success: false,
        error: `Failed to list report types: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
      };
    }
  }
}

/**
 * Get detailed information about a specific report type
 */
export async function describeReportType(
  conn: Connection,
  reportType: string
): Promise<{ success: boolean; fields?: any[]; error?: string }> {
  try {
    // Use the Analytics API to describe the report type
    const endpoint = `${conn.instanceUrl}/services/data/v59.0/analytics/reportTypes/${reportType}`;
    
    try {
      const response = await conn.request(endpoint);
      
      if (response && typeof response === 'object') {
        const reportTypeData: any = response;
        
        // Extract available fields
        const fields = [];
        
        // Columns
        if (reportTypeData.columns) {
          for (const [fieldName, fieldData] of Object.entries(reportTypeData.columns)) {
            fields.push({
              name: fieldName,
              label: (fieldData as any).label,
              dataType: (fieldData as any).dataType,
              filterable: (fieldData as any).filterable
            });
          }
        }

        return {
          success: true,
          fields: fields
        };
      }
    } catch (apiError) {
      // API might not be available, fallback to describe
    }

    // Fallback: Use standard object describe
    const describe = await conn.sobject(reportType).describe();
    
    const fields = describe.fields.map((field: any) => ({
      name: field.name,
      label: field.label,
      type: field.type,
      filterable: field.filterable,
      groupable: field.groupable,
      sortable: field.sortable
    }));

    return {
      success: true,
      fields: fields
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to describe report type: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Tool definition for listing report types
 */
export const listReportTypesTool = {
  name: 'salesforce_list_report_types',
  description: 'List available report types in Salesforce. Report types determine which objects can be used as the basis for reports (e.g., Opportunity, Account, Contact, or custom objects).',
  inputSchema: {
    type: 'object',
    properties: {
      searchPattern: {
        type: 'string',
        description: 'Optional search pattern to filter report types by name'
      }
    }
  }
};

/**
 * Tool definition for describing report types
 */
export const describeReportTypeTool = {
  name: 'salesforce_describe_report_type',
  description: 'Get detailed information about a specific report type, including available fields that can be used in reports.',
  inputSchema: {
    type: 'object',
    properties: {
      reportType: {
        type: 'string',
        description: 'The API name of the report type to describe (e.g., "Opportunity", "Account", "Custom_Object__c")'
      }
    },
    required: ['reportType']
  }
};
