import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const AGGREGATE_QUERY: Tool = {
  name: "salesforce_aggregate_query",
  description: `Execute SOQL queries with GROUP BY, aggregate functions, and statistical analysis. Use this tool for queries that summarize and group data rather than returning individual records.

NOTE: For regular queries without GROUP BY or aggregates, use salesforce_query_records instead.

This tool handles:
1. GROUP BY queries (single/multiple fields, related objects, date functions)
2. Aggregate functions: COUNT(), COUNT_DISTINCT(), SUM(), AVG(), MIN(), MAX()
3. HAVING clauses for filtering grouped results
4. Date/time grouping: CALENDAR_YEAR(), CALENDAR_MONTH(), CALENDAR_QUARTER(), FISCAL_YEAR(), FISCAL_QUARTER()

Examples:
1. Count opportunities by stage:
   - objectName: "Opportunity"
   - selectFields: ["StageName", "COUNT(Id) OpportunityCount"]
   - groupByFields: ["StageName"]

2. Analyze cases by priority and status:
   - objectName: "Case"
   - selectFields: ["Priority", "Status", "COUNT(Id) CaseCount", "AVG(Days_Open__c) AvgDaysOpen"]
   - groupByFields: ["Priority", "Status"]

3. Count contacts by account industry:
   - objectName: "Contact"
   - selectFields: ["Account.Industry", "COUNT(Id) ContactCount"]
   - groupByFields: ["Account.Industry"]

4. Quarterly opportunity analysis:
   - objectName: "Opportunity"
   - selectFields: ["CALENDAR_YEAR(CloseDate) Year", "CALENDAR_QUARTER(CloseDate) Quarter", "SUM(Amount) Revenue"]
   - groupByFields: ["CALENDAR_YEAR(CloseDate)", "CALENDAR_QUARTER(CloseDate)"]

5. Find accounts with more than 10 opportunities:
   - objectName: "Opportunity"
   - selectFields: ["Account.Name", "COUNT(Id) OpportunityCount"]
   - groupByFields: ["Account.Name"]
   - havingClause: "COUNT(Id) > 10"

Important Rules:
- All non-aggregate fields in selectFields MUST be included in groupByFields
- Use whereClause to filter rows BEFORE grouping
- Use havingClause to filter AFTER grouping (for aggregate conditions)
- ORDER BY can only use fields from groupByFields or aggregate functions
- OFFSET is not supported with GROUP BY in Salesforce`,
  inputSchema: {
    type: "object",
    properties: {
      objectName: {
        type: "string",
        description: "API name of the object to query"
      },
      selectFields: {
        type: "array",
        items: { type: "string" },
        description: "Fields to select - mix of group fields and aggregates. Format: 'FieldName' or 'COUNT(Id) AliasName'"
      },
      groupByFields: {
        type: "array",
        items: { type: "string" },
        description: "Fields to group by - must include all non-aggregate fields from selectFields"
      },
      whereClause: {
        type: "string",
        description: "WHERE clause to filter rows BEFORE grouping (cannot contain aggregate functions)",
        optional: true
      },
      havingClause: {
        type: "string",
        description: "HAVING clause to filter results AFTER grouping (use for aggregate conditions)",
        optional: true
      },
      orderBy: {
        type: "string",
        description: "ORDER BY clause - can only use grouped fields or aggregate functions",
        optional: true
      },
      limit: {
        type: "number",
        description: "Maximum number of grouped results to return",
        optional: true
      }
    },
    required: ["objectName", "selectFields", "groupByFields"]
  }
};

export interface AggregateQueryArgs {
  objectName: string;
  selectFields: string[];
  groupByFields: string[];
  whereClause?: string;
  havingClause?: string;
  orderBy?: string;
  limit?: number;
}

// Aggregate functions that don't need to be in GROUP BY
const AGGREGATE_FUNCTIONS = ['COUNT', 'COUNT_DISTINCT', 'SUM', 'AVG', 'MIN', 'MAX'];
const DATE_FUNCTIONS = ['CALENDAR_YEAR', 'CALENDAR_MONTH', 'CALENDAR_QUARTER', 'FISCAL_YEAR', 'FISCAL_QUARTER'];

// Helper function to detect if a field contains an aggregate function
function isAggregateField(field: string): boolean {
  const upperField = field.toUpperCase();
  return AGGREGATE_FUNCTIONS.some(func => upperField.includes(`${func}(`));
}

// Helper function to extract the base field from a select field (removing alias)
function extractBaseField(field: string): string {
  // Remove alias if present (e.g., "COUNT(Id) OpportunityCount" -> "COUNT(Id)")
  const parts = field.trim().split(/\s+/);
  return parts[0];
}

// Helper function to extract non-aggregate fields from select fields
function extractNonAggregateFields(selectFields: string[]): string[] {
  return selectFields
    .filter(field => !isAggregateField(field))
    .map(field => extractBaseField(field));
}

// Helper function to validate that all non-aggregate fields are in GROUP BY
function validateGroupByFields(selectFields: string[], groupByFields: string[]): { isValid: boolean; missingFields?: string[] } {
  const nonAggregateFields = extractNonAggregateFields(selectFields);
  const groupBySet = new Set(groupByFields.map(f => f.trim()));
  
  const missingFields = nonAggregateFields.filter(field => !groupBySet.has(field));
  
  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}

// Helper function to validate WHERE clause doesn't contain aggregates
function validateWhereClause(whereClause: string | undefined): { isValid: boolean; error?: string } {
  if (!whereClause) return { isValid: true };
  
  const upperWhere = whereClause.toUpperCase();
  for (const func of AGGREGATE_FUNCTIONS) {
    if (upperWhere.includes(`${func}(`)) {
      return {
        isValid: false,
        error: `WHERE clause cannot contain aggregate functions. Use HAVING clause instead for aggregate conditions like ${func}()`
      };
    }
  }
  
  return { isValid: true };
}

// Helper function to validate ORDER BY fields
function validateOrderBy(orderBy: string | undefined, groupByFields: string[], selectFields: string[]): { isValid: boolean; error?: string } {
  if (!orderBy) return { isValid: true };
  
  // Extract fields from ORDER BY (handling DESC/ASC)
  const orderByParts = orderBy.split(',').map(part => {
    return part.trim().replace(/ (DESC|ASC)$/i, '').trim();
  });
  
  const groupBySet = new Set(groupByFields);
  const aggregateFields = selectFields.filter(field => isAggregateField(field)).map(field => extractBaseField(field));
  
  for (const orderField of orderByParts) {
    // Check if it's in GROUP BY or is an aggregate
    if (!groupBySet.has(orderField) && !aggregateFields.some(agg => agg === orderField) && !isAggregateField(orderField)) {
      return {
        isValid: false,
        error: `ORDER BY field '${orderField}' must be in GROUP BY clause or be an aggregate function`
      };
    }
  }
  
  return { isValid: true };
}

export async function handleAggregateQuery(conn: any, args: AggregateQueryArgs) {
  const { objectName, selectFields, groupByFields, whereClause, havingClause, orderBy, limit } = args;

  try {
    // Validate GROUP BY contains all non-aggregate fields
    const groupByValidation = validateGroupByFields(selectFields, groupByFields);
    if (!groupByValidation.isValid) {
      return {
        content: [{
          type: "text",
          text: `Error: The following non-aggregate fields must be included in GROUP BY clause: ${groupByValidation.missingFields!.join(', ')}\n\n` +
                `All fields in SELECT that are not aggregate functions (COUNT, SUM, AVG, etc.) must be included in GROUP BY.`
        }],
        isError: true,
      };
    }

    // Validate WHERE clause doesn't contain aggregates
    const whereValidation = validateWhereClause(whereClause);
    if (!whereValidation.isValid) {
      return {
        content: [{
          type: "text",
          text: whereValidation.error!
        }],
        isError: true,
      };
    }

    // Validate ORDER BY fields
    const orderByValidation = validateOrderBy(orderBy, groupByFields, selectFields);
    if (!orderByValidation.isValid) {
      return {
        content: [{
          type: "text",
          text: orderByValidation.error!
        }],
        isError: true,
      };
    }

    // Construct SOQL query
    let soql = `SELECT ${selectFields.join(', ')} FROM ${objectName}`;
    if (whereClause) soql += ` WHERE ${whereClause}`;
    soql += ` GROUP BY ${groupByFields.join(', ')}`;
    if (havingClause) soql += ` HAVING ${havingClause}`;
    if (orderBy) soql += ` ORDER BY ${orderBy}`;
    if (limit) soql += ` LIMIT ${limit}`;

    const result = await conn.query(soql);
    
    // Format the output
    const formattedRecords = result.records.map((record: any, index: number) => {
      const recordStr = selectFields.map(field => {
        const baseField = extractBaseField(field);
        const fieldParts = field.trim().split(/\s+/);
        const displayName = fieldParts.length > 1 ? fieldParts[fieldParts.length - 1] : baseField;
        
        // Handle nested fields in results
        if (baseField.includes('.')) {
          const parts = baseField.split('.');
          let value = record;
          for (const part of parts) {
            value = value?.[part];
          }
          return `    ${displayName}: ${value !== null && value !== undefined ? value : 'null'}`;
        }
        
        const value = record[baseField] || record[displayName];
        return `    ${displayName}: ${value !== null && value !== undefined ? value : 'null'}`;
      }).join('\n');
      return `Group ${index + 1}:\n${recordStr}`;
    }).join('\n\n');

    return {
      content: [{
        type: "text",
        text: `Aggregate query returned ${result.records.length} grouped results:\n\n${formattedRecords}`
      }],
      isError: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Provide more helpful error messages for common issues
    let enhancedError = errorMessage;
    if (errorMessage.includes('MALFORMED_QUERY')) {
      if (errorMessage.includes('GROUP BY')) {
        enhancedError = `Query error: ${errorMessage}\n\nCommon issues:\n` +
          `1. Ensure all non-aggregate fields in SELECT are in GROUP BY\n` +
          `2. Check that date functions match exactly between SELECT and GROUP BY\n` +
          `3. Verify field names and relationships are correct`;
      }
    }

    return {
      content: [{
        type: "text",
        text: `Error executing aggregate query: ${enhancedError}`
      }],
      isError: true,
    };
  }
} 