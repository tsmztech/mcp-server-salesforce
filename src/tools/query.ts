import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const QUERY_RECORDS: Tool = {
  name: "salesforce_query_records",
  description: `Query records from any Salesforce object using SOQL, including relationship queries.

NOTE: For queries with GROUP BY, aggregate functions (COUNT, SUM, AVG, etc.), or HAVING clauses, use salesforce_aggregate_query instead.

IMPORTANT: Time-based queries are automatically enhanced to be more inclusive:
- "LAST_WEEK" becomes "LAST_N_DAYS:10" (includes more recent data)
- "THIS_WEEK" becomes "THIS_WEEK OR TODAY" (ensures today is included)
- Date ranges are expanded to include TODAY when querying recent data

Recommended fields for common objects:
- Opportunity: ["Id", "Name", "StageName", "Amount", "CloseDate", "CreatedDate", "LastModifiedDate", "Account.Name", "Owner.Name"]
- Account: ["Id", "Name", "Industry", "Type", "CreatedDate", "LastModifiedDate", "Owner.Name"]  
- Contact: ["Id", "FirstName", "LastName", "Email", "Account.Name", "CreatedDate", "LastModifiedDate"]
- Case: ["Id", "CaseNumber", "Subject", "Status", "Priority", "CreatedDate", "LastModifiedDate", "Account.Name", "Contact.Name"]

⚠️  IMPORTANT: If Account.Industry or custom fields like Account.Account_Tier__c return null:
1. The field might not exist in your Salesforce org
2. The field might be empty/not populated for those records  
3. You might not have access permissions to that field
4. Use salesforce_describe_object to verify field names and availability

Examples:
1. Recent Opportunities (automatically enhanced for broader results):
   - objectName: "Opportunity"
   - fields: ["Id", "Name", "StageName", "Amount", "CloseDate", "CreatedDate", "Account.Name"]
   - whereClause: "CreatedDate = LAST_WEEK" (will be enhanced to LAST_N_DAYS:10)

2. Parent-to-child query (e.g., Account with Contacts):
   - objectName: "Account"
   - fields: ["Name", "(SELECT Id, FirstName, LastName FROM Contacts)"]

3. Child-to-parent query (e.g., Contact with Account details):
   - objectName: "Contact"
   - fields: ["FirstName", "LastName", "Account.Name", "Account.Industry"]

4. Multiple level query (e.g., Contact -> Account -> Owner):
   - objectName: "Contact"
   - fields: ["Name", "Account.Name", "Account.Owner.Name"]

Note: When using relationship fields:
- Use dot notation for parent relationships (e.g., "Account.Name")
- Use subqueries in parentheses for child relationships (e.g., "(SELECT Id FROM Contacts)")
- Custom relationship fields end in "__r" (e.g., "CustomObject__r.Name")`,
  inputSchema: {
    type: "object",
    properties: {
      objectName: {
        type: "string",
        description: "API name of the object to query"
      },
      fields: {
        type: "array",
        items: { type: "string" },
        description: "List of fields to retrieve, including relationship fields"
      },
      whereClause: {
        type: "string",
        description: "WHERE clause, can include conditions on related objects",
        optional: true
      },
      orderBy: {
        type: "string",
        description: "ORDER BY clause, can include fields from related objects",
        optional: true
      },
      limit: {
        type: "number",
        description: "Maximum number of records to return",
        optional: true
      }
    },
    required: ["objectName", "fields"]
  }
};

export interface QueryArgs {
  objectName: string;
  fields: string[];
  whereClause?: string;
  orderBy?: string;
  limit?: number;
}

// Helper function to validate relationship field syntax
function validateRelationshipFields(fields: string[]): { isValid: boolean; error?: string } {
  for (const field of fields) {
    // Check for parent relationship syntax (dot notation)
    if (field.includes('.')) {
      const parts = field.split('.');
      // Check for empty parts
      if (parts.some(part => !part)) {
        return {
          isValid: false,
          error: `Invalid relationship field format: "${field}". Relationship fields should use proper dot notation (e.g., "Account.Name")`
        };
      }
      // Check for too many levels (Salesforce typically limits to 5)
      if (parts.length > 5) {
        return {
          isValid: false,
          error: `Relationship field "${field}" exceeds maximum depth of 5 levels`
        };
      }
    }

    // Check for child relationship syntax (subqueries)
    if (field.includes('SELECT') && !field.match(/^\(SELECT.*FROM.*\)$/)) {
      return {
        isValid: false,
        error: `Invalid subquery format: "${field}". Child relationship queries should be wrapped in parentheses`
      };
    }
  }

  return { isValid: true };
}

// Helper function to enhance time-based WHERE clauses to be more inclusive
function enhanceTimeBasedQuery(whereClause: string): string {
  if (!whereClause) return whereClause;
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Common time range patterns and their more inclusive alternatives
  const timeEnhancements = [
    // "last week" should include today and be more generous
    {
      pattern: /LAST_WEEK/gi,
      replacement: `LAST_N_DAYS:10` // More inclusive than just 7 days
    },
    // "this week" should definitely include today
    {
      pattern: /THIS_WEEK/gi,
      replacement: `THIS_WEEK OR TODAY`
    },
    // "last 7 days" should be more inclusive
    {
      pattern: /LAST_N_DAYS:7/gi,
      replacement: `LAST_N_DAYS:10`
    },
    // Add TODAY to any date range that might miss it
    {
      pattern: /CreatedDate\s*>=\s*(\d{4}-\d{2}-\d{2})/gi,
      replacement: (match: string, dateStr: string) => {
        const queryDate = new Date(dateStr);
        const daysBetween = Math.floor((now.getTime() - queryDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysBetween <= 10) {
          // If querying recent data, make sure to include today
          return `(${match} OR CreatedDate = TODAY)`;
        }
        return match;
      }
    }
  ];
  
  let enhancedClause = whereClause;
  
  timeEnhancements.forEach(enhancement => {
    if (typeof enhancement.replacement === 'string') {
      enhancedClause = enhancedClause.replace(enhancement.pattern, enhancement.replacement);
    } else {
      enhancedClause = enhancedClause.replace(enhancement.pattern, enhancement.replacement);
    }
  });
  
  // Log if we made any enhancements
  if (enhancedClause !== whereClause) {
    console.log(`[QUERY_ENHANCEMENT] Original WHERE: ${whereClause}`);
    console.log(`[QUERY_ENHANCEMENT] Enhanced WHERE: ${enhancedClause}`);
  }
  
  return enhancedClause;
}

// Helper function to format relationship query results
function formatRelationshipResults(record: any, field: string, prefix = ''): string {
  if (field.includes('.')) {
    const [relationship, ...rest] = field.split('.');
    const relatedRecord = record[relationship];
    if (relatedRecord === null) {
      return `${prefix}${field}: null`;
    }
    return formatRelationshipResults(relatedRecord, rest.join('.'), `${prefix}${relationship}.`);
  }

  const value = record[field];
  if (Array.isArray(value)) {
    // Handle child relationship arrays
    return `${prefix}${field}: [${value.length} records]`;
  }
  return `${prefix}${field}: ${value !== null && value !== undefined ? value : 'null'}`;
}

export async function handleQueryRecords(conn: any, args: QueryArgs) {
  const { objectName, fields, whereClause, orderBy, limit } = args;

  try {
    // Log the fields being requested for debugging
    console.log(`[QUERY_FIELDS] Requested fields for ${objectName}:`, fields);
    
    // Validate relationship field syntax
    const validation = validateRelationshipFields(fields);
    if (!validation.isValid) {
      return {
        content: [{
          type: "text",
          text: validation.error!
        }],
        isError: true,
      };
    }

    // Enhance time-based queries to be more inclusive
    const enhancedWhereClause = whereClause ? enhanceTimeBasedQuery(whereClause) : whereClause;
    
    // Apply smart defaults for better results
    const smartLimit = limit || (enhancedWhereClause ? 200 : 100); // Higher limit for filtered queries
    const smartOrderBy = orderBy || (fields.includes('CreatedDate') ? 'CreatedDate DESC' : 
                                   fields.includes('LastModifiedDate') ? 'LastModifiedDate DESC' : 
                                   orderBy);
    
    // Log smart enhancements
    if (!limit) {
      console.log(`[QUERY_ENHANCEMENT] Applied smart limit: ${smartLimit}`);
    }
    if (!orderBy && smartOrderBy) {
      console.log(`[QUERY_ENHANCEMENT] Applied smart ordering: ${smartOrderBy}`);
    }
    
    // Construct SOQL query
    let soql = `SELECT ${fields.join(', ')} FROM ${objectName}`;
    if (enhancedWhereClause) soql += ` WHERE ${enhancedWhereClause}`;
    if (smartOrderBy) soql += ` ORDER BY ${smartOrderBy}`;
    soql += ` LIMIT ${smartLimit}`;

    console.log(`[SOQL] Executing query: ${soql}`);
    const result = await conn.query(soql);
    console.log(`[SOQL] Query returned ${result.records.length} records`);
    
    // Format the output
    const formattedRecords = result.records.map((record: any, index: number) => {
      const recordStr = fields.map(field => {
        // Handle special case for subqueries (child relationships)
        if (field.startsWith('(SELECT')) {
          const relationshipName = field.match(/FROM\s+(\w+)/)?.[1];
          if (!relationshipName) return `    ${field}: Invalid subquery format`;
          const childRecords = record[relationshipName];
          return `    ${relationshipName}: [${childRecords?.length || 0} records]`;
        }
        return '    ' + formatRelationshipResults(record, field);
      }).join('\n');
      return `Record ${index + 1}:\n${recordStr}`;
    }).join('\n\n');

    return {
      content: [{
        type: "text",
        text: `Query returned ${result.records.length} records:\n\n${formattedRecords}`
      }],
      isError: false,
    };
  } catch (error) {
    // Enhanced error handling for relationship queries
    const errorMessage = error instanceof Error ? error.message : String(error);
    let enhancedError = errorMessage;

    console.log(`[QUERY_ERROR] Original error:`, errorMessage);

    if (errorMessage.includes('INVALID_FIELD') || errorMessage.includes('No such column')) {
      // Try to identify which field caused the error
      const fieldMatch = errorMessage.match(/(?:No such column |Invalid field: )['"]?([^'")\s,]+)/);
      if (fieldMatch) {
        const invalidField = fieldMatch[1];
        console.log(`[QUERY_ERROR] Invalid field identified:`, invalidField);
        
        if (invalidField.includes('.')) {
          enhancedError = `❌ Invalid relationship field "${invalidField}"\n\n` +
            `Troubleshooting steps:\n` +
            `1. Check if the relationship name is correct (e.g., "Account" not "account")\n` +
            `2. Verify the field exists on the related object\n` +
            `3. Ensure you have access permissions to the field\n` +
            `4. For custom relationships, use '__r' suffix (e.g., "Custom_Object__r.Name")\n\n` +
            `💡 Try using salesforce_describe_object on "${objectName}" to see available relationship fields.`;
        } else {
          enhancedError = `❌ Invalid field "${invalidField}" on ${objectName} object\n\n` +
            `Troubleshooting steps:\n` +
            `1. Check field name spelling and capitalization\n` +
            `2. Verify the field exists on the ${objectName} object\n` +
            `3. Ensure you have access permissions to the field\n` +
            `4. For custom fields, ensure '__c' suffix is included\n\n` +
            `💡 Try using salesforce_describe_object on "${objectName}" to see all available fields.`;
        }
      }
    } else if (errorMessage.includes('MALFORMED_QUERY')) {
      enhancedError = `❌ Malformed SOQL query\n\n` +
        `The query syntax is invalid. Common issues:\n` +
        `1. Missing quotes around string values in WHERE clause\n` +
        `2. Invalid date format (use YYYY-MM-DD or Salesforce date literals)\n` +
        `3. Incorrect aggregate function usage\n\n` +
        `💡 Check the SOQL syntax and try again.`;
    }

    return {
      content: [{
        type: "text",
        text: `Error executing query: ${enhancedError}\n\n🔍 Query attempted: SELECT ${fields.join(', ')} FROM ${objectName}${whereClause ? ` WHERE ${whereClause}` : ''}`
      }],
      isError: true,
    };
  }
}