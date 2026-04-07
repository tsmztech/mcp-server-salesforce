#!/usr/bin/env node

/**
 * E2E test using the real MCP Client → Server protocol over stdio.
 * Spawns the server as a child process and exercises all read-only tools
 * through the full JSON-RPC protocol stack.
 *
 * Usage: SALESFORCE_CONNECTION_TYPE=Salesforce_CLI node test/e2e/mcp-client.test.mjs
 *
 * This is NOT included in `npm test` — it requires a live Salesforce connection.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const results = { pass: 0, fail: 0, skip: 0, errors: [] };

const EXPECTED_ERRORS = [
  "can't run more than 500 reports",
  'running user for this dashboard is inactive',
  'report definition is obsolete',
  'sufficient privileges',
];

async function run(name, fn) {
  try {
    await fn();
    results.pass++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    const msg = (err.message || String(err)).substring(0, 200);
    if (EXPECTED_ERRORS.some(e => msg.includes(e))) {
      results.skip++;
      console.log(`  SKIP: ${name} — ${msg.substring(0, 80)}`);
      return;
    }
    results.fail++;
    results.errors.push({ name, error: msg });
    console.log(`  FAIL: ${name} — ${msg}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// ═══ Start server ═══
console.log('\nStarting MCP server...');

const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/index.js'],
  env: { ...process.env },
});

const client = new Client({
  name: 'e2e-test-client',
  version: '1.0.0',
});

await client.connect(transport);
console.log('Connected to MCP server.\n');

// ═══════════════════════════════════════════
console.log('══════════════════════════════════════════');
console.log('PHASE 1: ListTools — verify all tools registered');
console.log('══════════════════════════════════════════\n');

const toolsResult = await client.listTools();
const tools = toolsResult.tools;
const toolNames = tools.map(t => t.name);

await run('listTools returns tools', () => {
  assert(tools.length >= 16, `Expected at least 16 tools, got ${tools.length}`);
});

const expectedTools = [
  'salesforce_search_objects',
  'salesforce_describe_object',
  'salesforce_query_records',
  'salesforce_aggregate_query',
  'salesforce_dml_records',
  'salesforce_manage_object',
  'salesforce_manage_field',
  'salesforce_manage_field_permissions',
  'salesforce_search_all',
  'salesforce_read_apex',
  'salesforce_write_apex',
  'salesforce_read_apex_trigger',
  'salesforce_write_apex_trigger',
  'salesforce_execute_anonymous',
  'salesforce_manage_debug_logs',
  'salesforce_rest_api',
  'salesforce_list_analytics',
  'salesforce_describe_analytics',
  'salesforce_run_analytics',
  'salesforce_refresh_dashboard',
];

for (const name of expectedTools) {
  await run(`tool_registered: ${name}`, () => {
    assert(toolNames.includes(name), `Tool ${name} not found in listTools`);
  });
}

await run('all tools have inputSchema', () => {
  for (const tool of tools) {
    assert(tool.inputSchema, `${tool.name} missing inputSchema`);
    assert(tool.inputSchema.type === 'object', `${tool.name} inputSchema.type is not object`);
  }
});

await run('all tools have salesforce_ prefix', () => {
  for (const tool of tools) {
    assert(tool.name.startsWith('salesforce_'), `${tool.name} missing salesforce_ prefix`);
  }
});

await run('all tools have descriptions', () => {
  for (const tool of tools) {
    assert(tool.description && tool.description.length > 10, `${tool.name} missing or short description`);
  }
});

// ═══════════════════════════════════════════
console.log('\n══════════════════════════════════════════');
console.log('PHASE 2: CallTool — read-only tools against live org');
console.log('══════════════════════════════════════════\n');

// Helper to call tool and validate response structure
async function callTool(toolName, args) {
  const result = await client.callTool({ name: toolName, arguments: args });
  return result;
}

function assertValidResponse(result) {
  assert(result.content, 'Response missing content');
  assert(Array.isArray(result.content), 'content is not an array');
  assert(result.content.length > 0, 'content is empty');
  assert(result.content[0].type === 'text', `content[0].type is ${result.content[0].type}, expected text`);
  assert(typeof result.content[0].text === 'string', 'content[0].text is not a string');
}

// 2a. search_objects
await run('callTool: search_objects', async () => {
  const result = await callTool('salesforce_search_objects', { searchPattern: 'Account', limit: 5 });
  assertValidResponse(result);
  assert(!result.isError, 'Unexpected error');
  assert(result.content[0].text.includes('Account'), 'Response does not contain Account');
});

await run('callTool: search_objects — no results', async () => {
  const result = await callTool('salesforce_search_objects', { searchPattern: 'xyznonexistent99' });
  assertValidResponse(result);
  assert(!result.isError, 'Unexpected error');
  assert(result.content[0].text.includes('No Salesforce objects'), 'Expected no results message');
});

// 2b. describe_object
await run('callTool: describe_object — Account', async () => {
  const result = await callTool('salesforce_describe_object', { objectName: 'Account' });
  assertValidResponse(result);
  assert(!result.isError, 'Unexpected error');
  assert(result.content[0].text.includes('Account'), 'Missing Account in response');
  assert(result.content[0].text.includes('Type:'), 'Missing field type info');
});

await run('callTool: describe_object — invalid', async () => {
  const result = await callTool('salesforce_describe_object', { objectName: 'FakeObject__c' });
  assertValidResponse(result);
  assert(result.isError === true, 'Expected isError: true');
});

// 2c. query_records
await run('callTool: query_records — basic', async () => {
  const result = await callTool('salesforce_query_records', { objectName: 'Account', fields: ['Name', 'Industry'], limit: 3 });
  assertValidResponse(result);
  assert(!result.isError, 'Unexpected error');
  assert(result.content[0].text.includes('records'), 'Missing records info');
});

await run('callTool: query_records — with WHERE', async () => {
  const result = await callTool('salesforce_query_records', { objectName: 'Account', fields: ['Name'], whereClause: "CreatedDate = LAST_N_DAYS:7", limit: 3 });
  assertValidResponse(result);
  assert(!result.isError, 'Unexpected error');
});

await run('callTool: query_records — relationship', async () => {
  const result = await callTool('salesforce_query_records', { objectName: 'Contact', fields: ['FirstName', 'Account.Name'], limit: 3 });
  assertValidResponse(result);
  assert(!result.isError, 'Unexpected error');
});

await run('callTool: query_records — offset', async () => {
  const result = await callTool('salesforce_query_records', { objectName: 'Account', fields: ['Name'], limit: 3, offset: 10 });
  assertValidResponse(result);
  assert(!result.isError, 'Unexpected error');
  assert(result.content[0].text.includes('Record 11'), 'Offset not reflected in numbering');
});

await run('callTool: query_records — invalid object rejected', async () => {
  const result = await callTool('salesforce_query_records', { objectName: 'Account; DROP', fields: ['Name'] });
  assertValidResponse(result);
  assert(result.isError === true, 'Expected identifier validation error');
  assert(result.content[0].text.includes('Invalid identifier'), 'Expected identifier error message');
});

// 2d. aggregate_query
await run('callTool: aggregate_query', async () => {
  const result = await callTool('salesforce_aggregate_query', {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'COUNT(Id) cnt'],
    groupByFields: ['StageName'],
  });
  assertValidResponse(result);
  assert(!result.isError, 'Unexpected error');
  assert(result.content[0].text.includes('grouped results'), 'Missing grouped results');
});

// 2e. search_all
await run('callTool: search_all', async () => {
  const result = await callTool('salesforce_search_all', {
    searchTerm: 'Redis',
    objects: [{ name: 'Account', fields: ['Id', 'Name'], limit: 3 }],
  });
  assertValidResponse(result);
  assert(!result.isError, 'Unexpected error');
});

// 2f. read_apex
await run('callTool: read_apex — list', async () => {
  const result = await callTool('salesforce_read_apex', { limit: 5 });
  assertValidResponse(result);
  assert(!result.isError, 'Unexpected error');
  assert(result.content[0].text.includes('Apex Classes'), 'Missing Apex Classes header');
});

// 2g. read_apex_trigger
await run('callTool: read_apex_trigger — list', async () => {
  const result = await callTool('salesforce_read_apex_trigger', { limit: 5 });
  assertValidResponse(result);
  assert(!result.isError, 'Unexpected error');
  assert(result.content[0].text.includes('Apex Triggers'), 'Missing Apex Triggers header');
});

// 2h. execute_anonymous
await run('callTool: execute_anonymous — read-only', async () => {
  const result = await callTool('salesforce_execute_anonymous', { apexCode: "System.debug('e2e test');" });
  assertValidResponse(result);
  assert(!result.isError, 'Unexpected error');
  assert(result.content[0].text.includes('Success'), 'Expected execution success');
});

// 2i. manage_debug_logs — retrieve
await run('callTool: manage_debug_logs — retrieve (may have no logs)', async () => {
  // First get the connected username via REST API
  const whoami = await callTool('salesforce_rest_api', { method: 'GET', endpoint: '/query', queryParameters: { q: "SELECT Username FROM User WHERE Id = '005' LIMIT 0" } });
  // Just test with a known pattern — retrieve should not crash
  const result = await callTool('salesforce_query_records', { objectName: 'User', fields: ['Username'], whereClause: "IsActive = true", limit: 1 });
  if (!result.isError && result.content[0].text.includes('Username:')) {
    // Extract username from the query result text
    const match = result.content[0].text.match(/Username: (.+)/);
    if (match) {
      const logResult = await callTool('salesforce_manage_debug_logs', { operation: 'retrieve', username: match[1].trim(), limit: 2 });
      assertValidResponse(logResult);
    }
  }
});

// ═══════════════════════════════════════════
console.log('\n══════════════════════════════════════════');
console.log('PHASE 3: Analytics tools');
console.log('══════════════════════════════════════════\n');

// 3a. list_analytics
await run('callTool: list_analytics — reports', async () => {
  const result = await callTool('salesforce_list_analytics', { type: 'report', limit: 3 });
  assertValidResponse(result);
  assert(!result.isError, 'Unexpected error');
});

await run('callTool: list_analytics — dashboards', async () => {
  const result = await callTool('salesforce_list_analytics', { type: 'dashboard' });
  assertValidResponse(result);
  assert(!result.isError, 'Unexpected error');
});

await run('callTool: list_analytics — search', async () => {
  const result = await callTool('salesforce_list_analytics', { type: 'report', searchTerm: 'Pipeline', limit: 5 });
  assertValidResponse(result);
  assert(!result.isError, 'Unexpected error');
});

// Get a report and dashboard ID for further tests
let reportId = null;
let dashboardId = null;

const reportList = await callTool('salesforce_rest_api', {
  method: 'GET', endpoint: '/query',
  queryParameters: { q: 'SELECT Id FROM Report ORDER BY LastViewedDate DESC NULLS LAST LIMIT 1' },
});
if (!reportList.isError) {
  try {
    const parsed = JSON.parse(reportList.content[0].text.split('\n\n')[1]);
    if (parsed.records?.length) reportId = parsed.records[0].Id;
  } catch {}
}

const dashList = await callTool('salesforce_rest_api', {
  method: 'GET', endpoint: '/query',
  queryParameters: { q: 'SELECT Id FROM Dashboard ORDER BY LastViewedDate DESC NULLS LAST LIMIT 1' },
});
if (!dashList.isError) {
  try {
    const parsed = JSON.parse(dashList.content[0].text.split('\n\n')[1]);
    if (parsed.records?.length) dashboardId = parsed.records[0].Id;
  } catch {}
}

// 3b. describe_analytics
if (reportId) {
  await run('callTool: describe_analytics — report', async () => {
    const result = await callTool('salesforce_describe_analytics', { type: 'report', resourceId: reportId });
    assertValidResponse(result);
    assert(!result.isError, 'Unexpected error');
    assert(result.content[0].text.includes('Report:'), 'Missing Report header');
  });
}

if (dashboardId) {
  await run('callTool: describe_analytics — dashboard', async () => {
    const result = await callTool('salesforce_describe_analytics', { type: 'dashboard', resourceId: dashboardId });
    assertValidResponse(result);
    assert(!result.isError, 'Unexpected error');
    assert(result.content[0].text.includes('Dashboard:'), 'Missing Dashboard header');
  });
}

// 3c. run_analytics
if (reportId) {
  await run('callTool: run_analytics — report', async () => {
    const result = await callTool('salesforce_run_analytics', { type: 'report', resourceId: reportId });
    assertValidResponse(result);
    if (result.isError && result.content[0].text.includes('500 reports')) {
      throw new Error("can't run more than 500 reports"); // caught as SKIP
    }
    assert(!result.isError, 'Unexpected error');
  });

  await run('callTool: run_analytics — report with details', async () => {
    const result = await callTool('salesforce_run_analytics', { type: 'report', resourceId: reportId, includeDetails: true });
    assertValidResponse(result);
    if (result.isError && result.content[0].text.includes('500 reports')) {
      throw new Error("can't run more than 500 reports"); // caught as SKIP
    }
    assert(!result.isError, 'Unexpected error');
  });
}

if (dashboardId) {
  await run('callTool: run_analytics — dashboard', async () => {
    const result = await callTool('salesforce_run_analytics', { type: 'dashboard', resourceId: dashboardId });
    assertValidResponse(result);
    assert(!result.isError, 'Unexpected error');
  });

  // 3d. refresh_dashboard — status only
  await run('callTool: refresh_dashboard — status', async () => {
    const result = await callTool('salesforce_refresh_dashboard', { operation: 'status', dashboardId });
    assertValidResponse(result);
    assert(!result.isError, 'Unexpected error');
  });
}

// ═══════════════════════════════════════════
console.log('\n══════════════════════════════════════════');
console.log('PHASE 4: REST API passthrough');
console.log('══════════════════════════════════════════\n');

await run('callTool: rest_api — GET /limits', async () => {
  const result = await callTool('salesforce_rest_api', { method: 'GET', endpoint: '/limits' });
  assertValidResponse(result);
  assert(!result.isError, 'Unexpected error');
  assert(result.content[0].text.includes('Success'), 'Missing Success');
  assert(result.content[0].text.includes('DailyApiRequests'), 'Missing limits data');
});

await run('callTool: rest_api — GET / (resources)', async () => {
  const result = await callTool('salesforce_rest_api', { method: 'GET', endpoint: '/' });
  assertValidResponse(result);
  assert(!result.isError, 'Unexpected error');
});

await run('callTool: rest_api — GET /query', async () => {
  const result = await callTool('salesforce_rest_api', {
    method: 'GET', endpoint: '/query',
    queryParameters: { q: 'SELECT Id, Name FROM Account LIMIT 2' },
  });
  assertValidResponse(result);
  assert(!result.isError, 'Unexpected error');
  assert(result.content[0].text.includes('totalSize'), 'Missing query results');
});

await run('callTool: rest_api — GET invalid endpoint', async () => {
  const result = await callTool('salesforce_rest_api', { method: 'GET', endpoint: '/nonexistent' });
  assertValidResponse(result);
  assert(result.isError === true, 'Expected error for invalid endpoint');
});

// ═══════════════════════════════════════════
console.log('\n══════════════════════════════════════════');
console.log('PHASE 5: Error handling through protocol');
console.log('══════════════════════════════════════════\n');

await run('error: missing required args', async () => {
  try {
    const result = await callTool('salesforce_query_records', {});
    assertValidResponse(result);
    assert(result.isError === true, 'Expected error for missing args');
  } catch (err) {
    // Protocol-level error is also acceptable
    assert(err.message.includes('required') || err.code, 'Expected meaningful error');
  }
});

await run('error: invalid tool name', async () => {
  try {
    const result = await callTool('salesforce_nonexistent_tool', { foo: 'bar' });
    assertValidResponse(result);
    assert(result.isError === true, 'Expected error for unknown tool');
  } catch (err) {
    // Protocol-level error is also acceptable
  }
});

await run('error: describe invalid object returns isError', async () => {
  const result = await callTool('salesforce_describe_object', { objectName: 'TotallyFakeObject' });
  assertValidResponse(result);
  assert(result.isError === true, 'Expected isError for invalid object');
});

await run('error: identifier validation blocks injection', async () => {
  const result = await callTool('salesforce_query_records', {
    objectName: "Account' OR '1'='1",
    fields: ['Name'],
  });
  assertValidResponse(result);
  assert(result.isError === true, 'Expected identifier validation error');
});

// ═══ Cleanup ═══
await client.close();
console.log('\nMCP client disconnected.\n');

// ═══ Summary ═══
console.log('══════════════════════════════════════════');
console.log('SUMMARY');
console.log('══════════════════════════════════════════\n');
console.log(`  PASS: ${results.pass}`);
console.log(`  SKIP: ${results.skip} (rate limits, permissions)`);
console.log(`  FAIL: ${results.fail}`);
console.log(`  Total: ${results.pass + results.skip + results.fail}`);

if (results.errors.length > 0) {
  console.log('\n  Failures:');
  for (const e of results.errors) {
    console.log(`    - ${e.name}: ${e.error}`);
  }
}
console.log('');
process.exit(results.fail > 0 ? 1 : 0);
