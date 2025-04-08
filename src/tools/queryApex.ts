import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ApexClass } from "../types/salesforce.js";

export interface ApexQueryArgs {
  className?: string;
  includeBody?: boolean;
  limit?: number;
}

export const QUERY_APEX: Tool = {
  name: "salesforce_query_apex",
  description: "Query Apex classes from Salesforce",
  inputSchema: {
    type: "object",
    properties: {
      className: {
        type: "string",
        description: "Name of the Apex class to query (optional, will query all if not specified)"
      },
      includeBody: {
        type: "boolean",
        description: "Whether to include the Apex class body in the response"
      },
      limit: {
        type: "number",
        description: "Maximum number of records to return"
      }
    }
  }
};

export async function handleQueryApex(conn: any, args: ApexQueryArgs) {
  try {
    let query = "SELECT Id, Name, Body, Status, IsValid, LengthWithoutComments, CreatedDate, LastModifiedDate FROM ApexClass";
    
    const conditions = [];
    if (args.className) {
      conditions.push(`Name LIKE '%${args.className}%'`);
    }
    
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    
    if (args.limit) {
      query += ` LIMIT ${args.limit}`;
    }

    const result = await conn.query(query);
    
    const classes = result.records.map((record: any) => {
      const apexClass: ApexClass = {
        id: record.Id,
        name: record.Name,
        status: record.Status,
        isValid: record.IsValid,
        lengthWithoutComments: record.LengthWithoutComments,
        createdDate: record.CreatedDate,
        lastModifiedDate: record.LastModifiedDate
      };

      if (args.includeBody) {
        apexClass.body = record.Body;
      }

      return apexClass;
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify(classes, null, 2)
      }]
    };
  } catch (error) {
    throw new Error(`Failed to query Apex classes: ${error instanceof Error ? error.message : String(error)}`);
  }
} 