import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DEFAULT_LIMITS, applyDefaults, formatPaginationFooter } from "../utils/pagination.js";

export const QUERY_RECORDS: Tool = {
  name: "salesforce_query_records",
  description: `Query records from any Salesforce object using SOQL, including relationship queries.

NOTE: For queries with GROUP BY, aggregate functions (COUNT, SUM, AVG, etc.), or HAVING clauses, use salesforce_aggregate_query instead.

Pagination: Results default to 200 records per page. Use limit and offset to page through results. Response includes total record count and next offset. Note: Pages are not snapshot-consistent — if data changes between requests, records may shift. For stable pagination, add a deterministic WHERE clause (e.g., WHERE CreatedDate < 2026-04-07T00:00:00Z ORDER BY Id).

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

5. Paginate through results:
   - objectName: "Account"
   - fields: ["Name"]
   - limit: 50
   - offset: 100

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
        description: "WHERE clause, can include conditions on related objects"
      },
      orderBy: {
        type: "string",
        description: "ORDER BY clause, can include fields from related objects"
      },
      limit: {
        type: "number",
        description: "Maximum number of records to return (default 200)"
      },
      offset: {
        type: "number",
        description: "Number of records to skip for pagination (default 0, max 2000)"
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
  offset?: number;
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
  const { objectName, fields, whereClause, orderBy } = args;
  const { limit, offset } = applyDefaults(
    { limit: args.limit, offset: args.offset },
    DEFAULT_LIMITS.query
  );

  try {
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

    // Construct SOQL query
    let soql = `SELECT ${fields.join(', ')} FROM ${objectName}`;
    if (whereClause) soql += ` WHERE ${whereClause}`;
    if (orderBy) soql += ` ORDER BY ${orderBy}`;
    soql += ` LIMIT ${limit}`;
    if (offset > 0) {
      if (offset > 2000) {
        return {
          content: [{
            type: "text",
            text: `Offset cannot exceed 2,000 (Salesforce SOQL limit). Use a WHERE clause to narrow results instead (e.g., WHERE Id > 'lastSeenId' ORDER BY Id).`
          }],
          isError: true,
        };
      }
      soql += ` OFFSET ${offset}`;
    }

    // Get total count for pagination info
    let totalSize: number;
    let countSoql = `SELECT COUNT() FROM ${objectName}`;
    if (whereClause) countSoql += ` WHERE ${whereClause}`;
    try {
      const countResult = await conn.query(countSoql);
      totalSize = countResult.totalSize;
    } catch {
      // COUNT() may fail on some objects; fall back to unknown total
      totalSize = -1;
    }

    const result = await conn.query(soql, { autoFetch: false });

    // Format the output
    const recordStartIndex = offset;
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
      return `Record ${recordStartIndex + index + 1}:\n${recordStr}`;
    }).join('\n\n');

    // Use totalSize from count query, or fall back to result.totalSize
    const effectiveTotal = totalSize >= 0 ? totalSize : result.totalSize;
    const returned = result.records.length;
    const hasMore = (offset + returned) < effectiveTotal;

    let text = `Query returned ${returned} of ${effectiveTotal} records:\n\n${formattedRecords}`;
    text += formatPaginationFooter({
      totalSize: effectiveTotal,
      returned,
      offset,
      limit,
      hasMore,
    });

    return {
      content: [{
        type: "text",
        text,
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