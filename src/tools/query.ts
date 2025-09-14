import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { 
  validateObjectName, 
  validateFieldName, 
  sanitizeWhereClause, 
  validateLimit, 
  MAX_WHERE_LENGTH 
} from "../utils/soqlSanitizer.js";

export const QUERY_RECORDS: Tool = {
  name: "salesforce_query_records",
  description: `Query records from any Salesforce object using SOQL, including relationship queries.

NOTE: For queries with GROUP BY, aggregate functions (COUNT, SUM, AVG, etc.), or HAVING clauses, use salesforce_aggregate_query instead.

Examples:
1. Parent-to-child query (e.g., Account with Contacts):
   - objectName: "Account"
   - fields: ["Name", "(SELECT Id, FirstName, LastName FROM Contacts)"]

2. Child-to-parent query (e.g., Contact with Account details):
   - objectName: "Contact"
   - fields: ["FirstName", "LastName", "Account.Name", "Account.Industry"]

3. Multiple level query (e.g., Contact -> Account -> Owner):
   - objectName: "Contact"
   - fields: ["Name", "Account.Name", "Account.Owner.Name"]

4. Related object filtering:
   - objectName: "Contact"
   - fields: ["Name", "Account.Name"]
   - whereClause: "Account.Industry = 'Technology'"

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
    // SECURITY: Validate and sanitize all inputs to prevent SOQL injection
    
    // Validate object name
    const safeObjectName = validateObjectName(objectName);
    
    // Validate field names
    const safeFields = fields.map(field => validateFieldName(field));
    
    // Validate relationship field syntax (existing validation)
    const validation = validateRelationshipFields(safeFields);
    if (!validation.isValid) {
      return {
        content: [{
          type: "text",
          text: validation.error!
        }],
        isError: true,
      };
    }

    // Sanitize WHERE clause if provided
    let safeWhereClause = '';
    if (whereClause) {
      if (whereClause.length > MAX_WHERE_LENGTH) {
        return {
          content: [{
            type: "text",
            text: `WHERE clause exceeds maximum length of ${MAX_WHERE_LENGTH} characters`
          }],
          isError: true,
        };
      }
      safeWhereClause = sanitizeWhereClause(whereClause);
    }
    
    // Validate ORDER BY clause
    let safeOrderBy = '';
    if (orderBy) {
      // Basic validation - ORDER BY should only contain field names and ASC/DESC
      const orderByPattern = /^[a-zA-Z_][a-zA-Z0-9_\.]*(\s+(ASC|DESC))?(\s*,\s*[a-zA-Z_][a-zA-Z0-9_\.]*(\s+(ASC|DESC))?)*$/i;
      if (!orderByPattern.test(orderBy.trim())) {
        return {
          content: [{
            type: "text",
            text: "Invalid ORDER BY clause format"
          }],
          isError: true,
        };
      }
      safeOrderBy = orderBy.trim();
    }
    
    // Validate LIMIT if provided
    let safeLimit: number | undefined;
    if (limit !== undefined) {
      safeLimit = validateLimit(limit);
    }

    // Construct secure SOQL query
    let soql = `SELECT ${safeFields.join(', ')} FROM ${safeObjectName}`;
    if (safeWhereClause) soql += ` WHERE ${safeWhereClause}`;
    if (safeOrderBy) soql += ` ORDER BY ${safeOrderBy}`;
    if (safeLimit) soql += ` LIMIT ${safeLimit}`;

    const result = await conn.query(soql);
    
    // Format the output
    const formattedRecords = result.records.map((record: any, index: number) => {
      const recordStr = safeFields.map(field => {
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

    if (errorMessage.includes('INVALID_FIELD')) {
      // Try to identify which relationship field caused the error
      const fieldMatch = errorMessage.match(/(?:No such column |Invalid field: )['"]?([^'")\s]+)/);
      if (fieldMatch) {
        const invalidField = fieldMatch[1];
        if (invalidField.includes('.')) {
          enhancedError = `Invalid relationship field "${invalidField}". Please check:\n` +
            `1. The relationship name is correct\n` +
            `2. The field exists on the related object\n` +
            `3. You have access to the field\n` +
            `4. For custom relationships, ensure you're using '__r' suffix`;
        }
      }
    }

    return {
      content: [{
        type: "text",
        text: `Error executing query: ${enhancedError}`
      }],
      isError: true,
    };
  }
}