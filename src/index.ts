#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as dotenv from "dotenv";

import { createSalesforceConnection } from "./utils/connection.js";
import { SEARCH_OBJECTS, handleSearchObjects } from "./tools/search.js";
import { DESCRIBE_OBJECT, handleDescribeObject } from "./tools/describe.js";
import { QUERY_RECORDS, handleQueryRecords, QueryArgs } from "./tools/query.js";
import { DML_RECORDS, handleDMLRecords, DMLArgs } from "./tools/dml.js";
import { MANAGE_OBJECT, handleManageObject, ManageObjectArgs } from "./tools/manageObject.js";
import { MANAGE_FIELD, handleManageField, ManageFieldArgs } from "./tools/manageField.js";
import { SEARCH_ALL, handleSearchAll, SearchAllArgs, WithClause } from "./tools/searchAll.js";
import { QUERY_APEX, handleQueryApex, ApexQueryArgs } from "./tools/queryApex.js";
import { MANAGE_APEX, handleManageApex, ManageApexArgs } from "./tools/manageApex.js";

dotenv.config();

const server = new Server(
  {
    name: "salesforce-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    SEARCH_OBJECTS, 
    DESCRIBE_OBJECT, 
    QUERY_RECORDS, 
    DML_RECORDS,
    MANAGE_OBJECT,
    MANAGE_FIELD,
    SEARCH_ALL,
    QUERY_APEX,
    MANAGE_APEX
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    if (!args) throw new Error('Arguments are required');

    const conn = await createSalesforceConnection();

    switch (name) {
      case "salesforce_search_objects": {
        const { searchPattern } = args as { searchPattern: string };
        if (!searchPattern) throw new Error('searchPattern is required');
        return await handleSearchObjects(conn, searchPattern);
      }

      case "salesforce_describe_object": {
        const { objectName } = args as { objectName: string };
        if (!objectName) throw new Error('objectName is required');
        return await handleDescribeObject(conn, objectName);
      }

      case "salesforce_query_records": {
        const queryArgs = args as Record<string, unknown>;
        if (!queryArgs.objectName || !Array.isArray(queryArgs.fields)) {
          throw new Error('objectName and fields array are required for query');
        }
        const validatedArgs: QueryArgs = {
          objectName: queryArgs.objectName as string,
          fields: queryArgs.fields as string[],
          whereClause: queryArgs.whereClause as string | undefined,
          orderBy: queryArgs.orderBy as string | undefined,
          limit: queryArgs.limit as number | undefined
        };
        return await handleQueryRecords(conn, validatedArgs);
      }

      case "salesforce_dml_records": {
        const dmlArgs = args as Record<string, unknown>;
        if (!dmlArgs.operation || !dmlArgs.objectName || !Array.isArray(dmlArgs.records)) {
          throw new Error('operation, objectName, and records array are required for DML');
        }
        const validatedArgs: DMLArgs = {
          operation: dmlArgs.operation as 'insert' | 'update' | 'delete' | 'upsert',
          objectName: dmlArgs.objectName as string,
          records: dmlArgs.records as Record<string, any>[],
          externalIdField: dmlArgs.externalIdField as string | undefined
        };
        return await handleDMLRecords(conn, validatedArgs);
      }

      case "salesforce_manage_object": {
        const objectArgs = args as Record<string, unknown>;
        if (!objectArgs.operation || !objectArgs.objectName) {
          throw new Error('operation and objectName are required for object management');
        }
        const validatedArgs: ManageObjectArgs = {
          operation: objectArgs.operation as 'create' | 'update',
          objectName: objectArgs.objectName as string,
          label: objectArgs.label as string | undefined,
          pluralLabel: objectArgs.pluralLabel as string | undefined,
          description: objectArgs.description as string | undefined,
          nameFieldLabel: objectArgs.nameFieldLabel as string | undefined,
          nameFieldType: objectArgs.nameFieldType as 'Text' | 'AutoNumber' | undefined,
          nameFieldFormat: objectArgs.nameFieldFormat as string | undefined,
          sharingModel: objectArgs.sharingModel as 'ReadWrite' | 'Read' | 'Private' | 'ControlledByParent' | undefined
        };
        return await handleManageObject(conn, validatedArgs);
      }

      case "salesforce_manage_field": {
        const fieldArgs = args as Record<string, unknown>;
        if (!fieldArgs.operation || !fieldArgs.objectName || !fieldArgs.fieldName) {
          throw new Error('operation, objectName, and fieldName are required for field management');
        }
        const validatedArgs: ManageFieldArgs = {
          operation: fieldArgs.operation as 'create' | 'update',
          objectName: fieldArgs.objectName as string,
          fieldName: fieldArgs.fieldName as string,
          label: fieldArgs.label as string | undefined,
          type: fieldArgs.type as string | undefined,
          required: fieldArgs.required as boolean | undefined,
          unique: fieldArgs.unique as boolean | undefined,
          externalId: fieldArgs.externalId as boolean | undefined,
          length: fieldArgs.length as number | undefined,
          precision: fieldArgs.precision as number | undefined,
          scale: fieldArgs.scale as number | undefined,
          referenceTo: fieldArgs.referenceTo as string | undefined,
          relationshipLabel: fieldArgs.relationshipLabel as string | undefined,
          relationshipName: fieldArgs.relationshipName as string | undefined,
          deleteConstraint: fieldArgs.deleteConstraint as 'Cascade' | 'Restrict' | 'SetNull' | undefined,
          picklistValues: fieldArgs.picklistValues as Array<{ label: string; isDefault?: boolean }> | undefined,
          description: fieldArgs.description as string | undefined
        };
        return await handleManageField(conn, validatedArgs);
      }

      case "salesforce_search_all": {
        const searchArgs = args as Record<string, unknown>;
        if (!searchArgs.searchTerm || !Array.isArray(searchArgs.objects)) {
          throw new Error('searchTerm and objects array are required for search');
        }

        // Validate objects array
        const objects = searchArgs.objects as Array<Record<string, unknown>>;
        if (!objects.every(obj => obj.name && Array.isArray(obj.fields))) {
          throw new Error('Each object must specify name and fields array');
        }

        // Type check and conversion
        const validatedArgs: SearchAllArgs = {
          searchTerm: searchArgs.searchTerm as string,
          searchIn: searchArgs.searchIn as "ALL FIELDS" | "NAME FIELDS" | "EMAIL FIELDS" | "PHONE FIELDS" | "SIDEBAR FIELDS" | undefined,
          objects: objects.map(obj => ({
            name: obj.name as string,
            fields: obj.fields as string[],
            where: obj.where as string | undefined,
            orderBy: obj.orderBy as string | undefined,
            limit: obj.limit as number | undefined
          })),
          withClauses: searchArgs.withClauses as WithClause[] | undefined,
          updateable: searchArgs.updateable as boolean | undefined,
          viewable: searchArgs.viewable as boolean | undefined
        };

        return await handleSearchAll(conn, validatedArgs);
      }

      case "salesforce_query_apex": {
        const apexArgs = args as Record<string, unknown>;
        const validatedArgs: ApexQueryArgs = {
          className: apexArgs.className as string | undefined,
          includeBody: apexArgs.includeBody as boolean | undefined,
          limit: apexArgs.limit as number | undefined
        };
        return await handleQueryApex(conn, validatedArgs);
      }

      case "salesforce_manage_apex": {
        const apexArgs = args as Record<string, unknown>;
        if (!apexArgs.operation || !apexArgs.className) {
          throw new Error('operation and className are required for Apex management');
        }
        const validatedArgs: ManageApexArgs = {
          operation: apexArgs.operation as 'create',
          className: apexArgs.className as string,
          body: apexArgs.body as string | undefined,
          status: apexArgs.status as 'Active' | 'Inactive' | undefined,
          apiVersion: apexArgs.apiVersion as string | undefined
        };
        return await handleManageApex(conn, validatedArgs);
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }],
      isError: true,
    };
  }
});

async function runServer() {
  try {
    console.error("Starting Salesforce MCP Server...");
    const transport = new StdioServerTransport();
    console.error("Created transport, connecting to server...");
    await server.connect(transport);
    console.error("Salesforce MCP Server running on stdio");
  } catch (error) {
    console.error("Error in runServer:", error);
    throw error;
  }
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});