import { Tool } from "@modelcontextprotocol/sdk/types.js";
import jsforce from "jsforce";

// Bulk API query for large datasets
async function bulkQuery(conn: any, soql: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const records: any[] = [];

    conn.bulk.query(soql)
      .on("record", (record: any) => records.push(record))
      .on("end", () => resolve(records))
      .on("error", (err: any) => reject(err));
  });
}

export const QUERY_RECORDS: Tool = {
  name: "salesforce_query_records",
  description: "Query records from any Salesforce object using SOQL",
  inputSchema: {
    type: "object",
    properties: {
      objectName: { type: "string" },
      fields: { type: "array", items: { type: "string" } },
      whereClause: { type: "string", optional: true },
      orderBy: { type: "string", optional: true },
      limit: { type: "number", optional: true }
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

function validateRelationshipFields(fields: string[]): { isValid: boolean; error?: string } {
  for (const field of fields) {
    if (field.includes(".")) {
      const parts = field.split(".");
      if (parts.some(part => !part)) {
        return { isValid: false, error: `Invalid relationship field format: "${field}"` };
      }
      if (parts.length > 5) {
        return { isValid: false, error: `Relationship field "${field}" exceeds maximum depth` };
      }
    }

    if (field.includes("SELECT") && !field.match(/^\(SELECT.*FROM.*\)$/)) {
      return { isValid: false, error: `Invalid subquery format: "${field}"` };
    }
  }
  return { isValid: true };
}

function formatRelationshipResults(record: any, field: string, prefix = ""): string {
  if (field.includes(".")) {
    const [relationship, ...rest] = field.split(".");
    const relatedRecord = record[relationship];
    if (relatedRecord === null) return `${prefix}${field}: null`;
    return formatRelationshipResults(relatedRecord, rest.join("."), `${prefix}${relationship}.`);
  }

  const value = record[field];
  if (Array.isArray(value)) {
    return `${prefix}${field}: [${value.length} records]`;
  }
  return `${prefix}${field}: ${value ?? "null"}`;
}

export async function handleQueryRecords(conn: any, args: QueryArgs) {
  const { objectName, fields, whereClause, orderBy, limit } = args;

  try {
    const validation = validateRelationshipFields(fields);
    if (!validation.isValid) {
      return {
        content: [{ type: "text", text: validation.error! }],
        isError: true
      };
    }

    let soql = `SELECT ${fields.join(", ")} FROM ${objectName}`;
    if (whereClause) soql += ` WHERE ${whereClause}`;
    if (orderBy) soql += ` ORDER BY ${orderBy}`;
    if (limit) soql += ` LIMIT ${limit}`;

    let records: any[] = [];
    const lower = soql.toLowerCase();

    if (
      lower.includes("limit") ||
      lower.includes("count") ||
      lower.includes("group by")
    ) {
      const result = await conn.query(soql);
      records = result.records;
    } else {
      records = await bulkQuery(conn, soql);
    }

    const formattedRecords = records.map((record: any, index: number) => {
      const recordStr = fields.map(field => {
        if (field.startsWith("(SELECT")) {
          const relationshipName = field.match(/FROM\s+(\w+)/)?.[1];
          const childRecords = record[relationshipName!];
          return `    ${relationshipName}: [${childRecords?.length || 0} records]`;
        }
        return "    " + formatRelationshipResults(record, field);
      }).join("\n");

      return `Record ${index + 1}:\n${recordStr}`;
    }).join("\n\n");

    return {
      content: [{
        type: "text",
        text: `Query returned ${records.length} records:\n\n${formattedRecords}`
      }],
      isError: false
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      content: [{
        type: "text",
        text: `Error executing query: ${errorMessage}`
      }],
      isError: true
    };
  }
}