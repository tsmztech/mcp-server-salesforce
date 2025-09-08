#!/usr/bin/env node
import express, { Request, Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as dotenv from "dotenv";
import { createSalesforceConnection } from "./utils/connection.js";
import { SEARCH_OBJECTS, handleSearchObjects } from "./tools/search.js";
import { DESCRIBE_OBJECT, handleDescribeObject } from "./tools/describe.js";
import { QUERY_RECORDS, handleQueryRecords, QueryArgs } from "./tools/query.js";
import { AGGREGATE_QUERY, handleAggregateQuery, AggregateQueryArgs } from "./tools/aggregateQuery.js";
import { DML_RECORDS, handleDMLRecords, DMLArgs } from "./tools/dml.js";
import { MANAGE_OBJECT, handleManageObject, ManageObjectArgs } from "./tools/manageObject.js";
import { MANAGE_FIELD, handleManageField, ManageFieldArgs } from "./tools/manageField.js";
import { MANAGE_FIELD_PERMISSIONS, handleManageFieldPermissions, ManageFieldPermissionsArgs } from "./tools/manageFieldPermissions.js";
import { SEARCH_ALL, handleSearchAll, SearchAllArgs, WithClause } from "./tools/searchAll.js";
import { READ_APEX, handleReadApex, ReadApexArgs } from "./tools/readApex.js";
import { WRITE_APEX, handleWriteApex, WriteApexArgs } from "./tools/writeApex.js";
import { READ_APEX_TRIGGER, handleReadApexTrigger, ReadApexTriggerArgs } from "./tools/readApexTrigger.js";
import { WRITE_APEX_TRIGGER, handleWriteApexTrigger, WriteApexTriggerArgs } from "./tools/writeApexTrigger.js";
import { EXECUTE_ANONYMOUS, handleExecuteAnonymous, ExecuteAnonymousArgs } from "./tools/executeAnonymous.js";
import { MANAGE_DEBUG_LOGS, handleManageDebugLogs, ManageDebugLogsArgs } from "./tools/manageDebugLogs.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

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

// Read only tools
const READ_ONLY_TOOLS = [
  SEARCH_OBJECTS,
  DESCRIBE_OBJECT,
  QUERY_RECORDS,
  AGGREGATE_QUERY,
  SEARCH_ALL,
  EXECUTE_ANONYMOUS
]

const WRITE_TOOLS = [
  DML_RECORDS,
  MANAGE_OBJECT,
  MANAGE_FIELD,
  MANAGE_FIELD_PERMISSIONS,
  MANAGE_DEBUG_LOGS,
  READ_APEX,
  WRITE_APEX,
  READ_APEX_TRIGGER,
  WRITE_APEX_TRIGGER,
]

const getTools = () => {
  if (process.env.ENABLE_WRITE_TOOLS === 'true') {
    return READ_ONLY_TOOLS.concat(WRITE_TOOLS);
  }
  return READ_ONLY_TOOLS;
}


// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: getTools(),
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
            // Type check and conversion
            const validatedArgs: QueryArgs = {
              objectName: queryArgs.objectName as string,
              fields: queryArgs.fields as string[],
              whereClause: queryArgs.whereClause as string | undefined,
              orderBy: queryArgs.orderBy as string | undefined,
              limit: queryArgs.limit as number | undefined
            };
            console.log(`[MCP] Executing SOQL query for ${validatedArgs.objectName}`);
            console.log(`[MCP] WHERE clause:`, validatedArgs.whereClause || 'None');
            const result = await handleQueryRecords(conn, validatedArgs);
            return result;
          }

          case "salesforce_aggregate_query": {
            const aggregateArgs = args as Record<string, unknown>;
            if (!aggregateArgs.objectName || !Array.isArray(aggregateArgs.selectFields) || !Array.isArray(aggregateArgs.groupByFields)) {
              throw new Error('objectName, selectFields array, and groupByFields array are required for aggregate query');
            }
            // Type check and conversion
            const validatedArgs: AggregateQueryArgs = {
              objectName: aggregateArgs.objectName as string,
              selectFields: aggregateArgs.selectFields as string[],
              groupByFields: aggregateArgs.groupByFields as string[],
              whereClause: aggregateArgs.whereClause as string | undefined,
              havingClause: aggregateArgs.havingClause as string | undefined,
              orderBy: aggregateArgs.orderBy as string | undefined,
              limit: aggregateArgs.limit as number | undefined
            };
            console.log(`[MCP] Executing aggregate query for ${validatedArgs.objectName}`);
            console.log(`[MCP] WHERE clause:`, validatedArgs.whereClause || 'None');
            const result = await handleAggregateQuery(conn, validatedArgs);
            console.log(`[MCP] Aggregate query completed successfully`);
            return result;
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
          description: fieldArgs.description as string | undefined,
          grantAccessTo: fieldArgs.grantAccessTo as string[] | undefined
        };
        return await handleManageField(conn, validatedArgs);
      }

      case "salesforce_manage_field_permissions": {
        const permArgs = args as Record<string, unknown>;
        if (!permArgs.operation || !permArgs.objectName || !permArgs.fieldName) {
          throw new Error('operation, objectName, and fieldName are required for field permissions management');
        }
        const validatedArgs: ManageFieldPermissionsArgs = {
          operation: permArgs.operation as 'grant' | 'revoke' | 'view',
          objectName: permArgs.objectName as string,
          fieldName: permArgs.fieldName as string,
          profileNames: permArgs.profileNames as string[] | undefined,
          readable: permArgs.readable as boolean | undefined,
          editable: permArgs.editable as boolean | undefined
        };
        return await handleManageFieldPermissions(conn, validatedArgs);
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

      case "salesforce_read_apex": {
        const apexArgs = args as Record<string, unknown>;
        
        // Type check and conversion
        const validatedArgs: ReadApexArgs = {
          className: apexArgs.className as string | undefined,
          namePattern: apexArgs.namePattern as string | undefined,
          includeMetadata: apexArgs.includeMetadata as boolean | undefined
        };

        return await handleReadApex(conn, validatedArgs);
      }

      case "salesforce_write_apex": {
        const apexArgs = args as Record<string, unknown>;
        if (!apexArgs.operation || !apexArgs.className || !apexArgs.body) {
          throw new Error('operation, className, and body are required for writing Apex');
        }
        
        // Type check and conversion
        const validatedArgs: WriteApexArgs = {
          operation: apexArgs.operation as 'create' | 'update',
          className: apexArgs.className as string,
          apiVersion: apexArgs.apiVersion as string | undefined,
          body: apexArgs.body as string
        };

        return await handleWriteApex(conn, validatedArgs);
      }

      case "salesforce_read_apex_trigger": {
        const triggerArgs = args as Record<string, unknown>;
        
        // Type check and conversion
        const validatedArgs: ReadApexTriggerArgs = {
          triggerName: triggerArgs.triggerName as string | undefined,
          namePattern: triggerArgs.namePattern as string | undefined,
          includeMetadata: triggerArgs.includeMetadata as boolean | undefined
        };

        return await handleReadApexTrigger(conn, validatedArgs);
      }

      case "salesforce_write_apex_trigger": {
        const triggerArgs = args as Record<string, unknown>;
        if (!triggerArgs.operation || !triggerArgs.triggerName || !triggerArgs.body) {
          throw new Error('operation, triggerName, and body are required for writing Apex trigger');
        }
        
        // Type check and conversion
        const validatedArgs: WriteApexTriggerArgs = {
          operation: triggerArgs.operation as 'create' | 'update',
          triggerName: triggerArgs.triggerName as string,
          objectName: triggerArgs.objectName as string | undefined,
          apiVersion: triggerArgs.apiVersion as string | undefined,
          body: triggerArgs.body as string
        };

        return await handleWriteApexTrigger(conn, validatedArgs);
      }

      case "salesforce_execute_anonymous": {
        const executeArgs = args as Record<string, unknown>;
        if (!executeArgs.apexCode) {
          throw new Error('apexCode is required for executing anonymous Apex');
        }
        
        // Type check and conversion
        const validatedArgs: ExecuteAnonymousArgs = {
          apexCode: executeArgs.apexCode as string,
          logLevel: executeArgs.logLevel as 'NONE' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'FINE' | 'FINER' | 'FINEST' | undefined
        };

        return await handleExecuteAnonymous(conn, validatedArgs);
      }

      case "salesforce_manage_debug_logs": {
        const debugLogsArgs = args as Record<string, unknown>;
        if (!debugLogsArgs.operation || !debugLogsArgs.username) {
          throw new Error('operation and username are required for managing debug logs');
        }
        
        // Type check and conversion
        const validatedArgs: ManageDebugLogsArgs = {
          operation: debugLogsArgs.operation as 'enable' | 'disable' | 'retrieve',
          username: debugLogsArgs.username as string,
          logLevel: debugLogsArgs.logLevel as 'NONE' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'FINE' | 'FINER' | 'FINEST' | undefined,
          expirationTime: debugLogsArgs.expirationTime as number | undefined,
          limit: debugLogsArgs.limit as number | undefined,
          logId: debugLogsArgs.logId as string | undefined,
          includeBody: debugLogsArgs.includeBody as boolean | undefined
        };

        return await handleManageDebugLogs(conn, validatedArgs);
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

const app = express();
app.use(express.json());

// Remove unused transports map - not needed in stateless mode

app.post('/mcp', async (req: Request, res: Response) => {
  // In stateless mode, create a new instance of transport for each request
  // to ensure complete isolation. A single instance would cause request ID collisions
  // when multiple clients connect concurrently.
  
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[HTTP] Received MCP request ${requestId}`);
  
  try {
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    
    // Create a new server instance for this request to avoid conflicts
    const requestServer = new Server(
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

    // Set up request handlers for this server instance
    requestServer.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: getTools(),
    }));

    requestServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;
        if (!args) throw new Error('Arguments are required');

        console.log(`[MCP] Processing tool: ${name}`);
        console.log(`[MCP] Tool arguments:`, JSON.stringify(args, null, 2));
        const conn = await createSalesforceConnection();
        console.log(`[MCP] Salesforce connection established for tool: ${name}`);

        switch (name) {
          case "salesforce_search_objects": {
            const { searchPattern } = args as { searchPattern: string };
            if (!searchPattern) throw new Error('searchPattern is required');
            const result = await handleSearchObjects(conn, searchPattern);
            return result;
          }

          case "salesforce_describe_object": {
            const { objectName } = args as { objectName: string };
            if (!objectName) throw new Error('objectName is required');
            const result = await handleDescribeObject(conn, objectName);
            return result;
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

          case "salesforce_aggregate_query": {
            const aggregateArgs = args as Record<string, unknown>;
            if (!aggregateArgs.objectName || !Array.isArray(aggregateArgs.selectFields) || !Array.isArray(aggregateArgs.groupByFields)) {
              throw new Error('objectName, selectFields array, and groupByFields array are required for aggregate query');
            }
            const validatedArgs: AggregateQueryArgs = {
              objectName: aggregateArgs.objectName as string,
              selectFields: aggregateArgs.selectFields as string[],
              groupByFields: aggregateArgs.groupByFields as string[],
              whereClause: aggregateArgs.whereClause as string | undefined,
              havingClause: aggregateArgs.havingClause as string | undefined,
              orderBy: aggregateArgs.orderBy as string | undefined,
              limit: aggregateArgs.limit as number | undefined
            };
            return await handleAggregateQuery(conn, validatedArgs);
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
              description: fieldArgs.description as string | undefined,
              grantAccessTo: fieldArgs.grantAccessTo as string[] | undefined
            };
            return await handleManageField(conn, validatedArgs);
          }

          case "salesforce_manage_field_permissions": {
            const permArgs = args as Record<string, unknown>;
            if (!permArgs.operation || !permArgs.objectName || !permArgs.fieldName) {
              throw new Error('operation, objectName, and fieldName are required for field permissions management');
            }
            const validatedArgs: ManageFieldPermissionsArgs = {
              operation: permArgs.operation as 'grant' | 'revoke' | 'view',
              objectName: permArgs.objectName as string,
              fieldName: permArgs.fieldName as string,
              profileNames: permArgs.profileNames as string[] | undefined,
              readable: permArgs.readable as boolean | undefined,
              editable: permArgs.editable as boolean | undefined
            };
            return await handleManageFieldPermissions(conn, validatedArgs);
          }

          case "salesforce_search_all": {
            const searchArgs = args as Record<string, unknown>;
            if (!searchArgs.searchTerm || !Array.isArray(searchArgs.objects)) {
              throw new Error('searchTerm and objects array are required for search');
            }

            const objects = searchArgs.objects as Array<Record<string, unknown>>;
            if (!objects.every(obj => obj.name && Array.isArray(obj.fields))) {
              throw new Error('Each object must specify name and fields array');
            }

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

          case "salesforce_read_apex": {
            const apexArgs = args as Record<string, unknown>;
            
            const validatedArgs: ReadApexArgs = {
              className: apexArgs.className as string | undefined,
              namePattern: apexArgs.namePattern as string | undefined,
              includeMetadata: apexArgs.includeMetadata as boolean | undefined
            };

            return await handleReadApex(conn, validatedArgs);
          }

          case "salesforce_write_apex": {
            const apexArgs = args as Record<string, unknown>;
            if (!apexArgs.operation || !apexArgs.className || !apexArgs.body) {
              throw new Error('operation, className, and body are required for writing Apex');
            }
            
            const validatedArgs: WriteApexArgs = {
              operation: apexArgs.operation as 'create' | 'update',
              className: apexArgs.className as string,
              apiVersion: apexArgs.apiVersion as string | undefined,
              body: apexArgs.body as string
            };

            return await handleWriteApex(conn, validatedArgs);
          }

          case "salesforce_read_apex_trigger": {
            const triggerArgs = args as Record<string, unknown>;
            
            const validatedArgs: ReadApexTriggerArgs = {
              triggerName: triggerArgs.triggerName as string | undefined,
              namePattern: triggerArgs.namePattern as string | undefined,
              includeMetadata: triggerArgs.includeMetadata as boolean | undefined
            };

            return await handleReadApexTrigger(conn, validatedArgs);
          }

          case "salesforce_write_apex_trigger": {
            const triggerArgs = args as Record<string, unknown>;
            if (!triggerArgs.operation || !triggerArgs.triggerName || !triggerArgs.body) {
              throw new Error('operation, triggerName, and body are required for writing Apex trigger');
            }
            
            const validatedArgs: WriteApexTriggerArgs = {
              operation: triggerArgs.operation as 'create' | 'update',
              triggerName: triggerArgs.triggerName as string,
              objectName: triggerArgs.objectName as string | undefined,
              apiVersion: triggerArgs.apiVersion as string | undefined,
              body: triggerArgs.body as string
            };

            return await handleWriteApexTrigger(conn, validatedArgs);
          }

          case "salesforce_execute_anonymous": {
            const executeArgs = args as Record<string, unknown>;
            if (!executeArgs.apexCode) {
              throw new Error('apexCode is required for executing anonymous Apex');
            }
            
            const validatedArgs: ExecuteAnonymousArgs = {
              apexCode: executeArgs.apexCode as string,
              logLevel: executeArgs.logLevel as 'NONE' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'FINE' | 'FINER' | 'FINEST' | undefined
            };

            return await handleExecuteAnonymous(conn, validatedArgs);
          }

          case "salesforce_manage_debug_logs": {
            const debugLogsArgs = args as Record<string, unknown>;
            if (!debugLogsArgs.operation || !debugLogsArgs.username) {
              throw new Error('operation and username are required for managing debug logs');
            }
            
            const validatedArgs: ManageDebugLogsArgs = {
              operation: debugLogsArgs.operation as 'enable' | 'disable' | 'retrieve',
              username: debugLogsArgs.username as string,
              logLevel: debugLogsArgs.logLevel as 'NONE' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'FINE' | 'FINER' | 'FINEST' | undefined,
              expirationTime: debugLogsArgs.expirationTime as number | undefined,
              limit: debugLogsArgs.limit as number | undefined,
              logId: debugLogsArgs.logId as string | undefined,
              includeBody: debugLogsArgs.includeBody as boolean | undefined
            };

            return await handleManageDebugLogs(conn, validatedArgs);
          }

          default:
            return {
              content: [{ type: "text", text: `Unknown tool: ${name}` }],
              isError: true,
            };
        }
      } catch (error) {
        console.error(`[MCP] Error in tool ${request.params.name}:`, error);
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    });
    
    res.on('close', () => {
      console.log(`[HTTP] Request ${requestId} closed`);
      transport.close();
      // Don't close the main server - only close the transport
    });
    
    await requestServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
    console.log(`[HTTP] Request ${requestId} completed successfully`);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  try {
    const conn = await createSalesforceConnection();
    await conn.query('SELECT Id FROM User LIMIT 1');
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      salesforce: 'connected'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ 
      status: 'unhealthy', 
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      salesforce: 'disconnected'
    });
  }
});

// SSE notifications not supported in stateless mode
app.get('/mcp', async (req: Request, res: Response) => {
  console.log('Received GET MCP request - Method not allowed in stateless mode');
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "GET method not supported in stateless mode. Use POST /mcp for requests."
    },
    id: null
  });
});

// Session termination not needed in stateless mode
app.delete('/mcp', async (req: Request, res: Response) => {
  console.log('Received DELETE MCP request - Method not allowed in stateless mode');
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "DELETE method not supported in stateless mode. Use POST /mcp for requests."
    },
    id: null
  });
});

app.listen(3000, () => {
  console.log("Salesforce MCP Server running on http://localhost:3000");
});
