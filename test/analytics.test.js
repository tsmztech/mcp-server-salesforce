import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LIST_ANALYTICS } from '../dist/tools/listAnalytics.js';
import { DESCRIBE_ANALYTICS } from '../dist/tools/describeAnalytics.js';
import { RUN_ANALYTICS } from '../dist/tools/runAnalytics.js';
import { REFRESH_DASHBOARD } from '../dist/tools/refreshDashboard.js';

const tools = [LIST_ANALYTICS, DESCRIBE_ANALYTICS, RUN_ANALYTICS, REFRESH_DASHBOARD];

test('all analytics tools have required MCP tool properties', () => {
  for (const tool of tools) {
    assert.ok(tool.name, `tool should have a name`);
    assert.ok(tool.name.startsWith('salesforce_'), `${tool.name} should have salesforce_ prefix`);
    assert.ok(tool.description, `${tool.name} should have a description`);
    assert.ok(tool.inputSchema, `${tool.name} should have an inputSchema`);
    assert.equal(tool.inputSchema.type, 'object', `${tool.name} inputSchema type should be "object"`);
    assert.ok(tool.inputSchema.properties, `${tool.name} should have inputSchema.properties`);
  }
});

test('salesforce_list_analytics has correct schema', () => {
  const props = LIST_ANALYTICS.inputSchema.properties;
  assert.ok(props.type, 'should have type property');
  assert.deepEqual(props.type.enum, ['report', 'dashboard']);
  assert.deepEqual(LIST_ANALYTICS.inputSchema.required, ['type']);
});

test('salesforce_describe_analytics has correct schema', () => {
  const props = DESCRIBE_ANALYTICS.inputSchema.properties;
  assert.ok(props.type, 'should have type property');
  assert.ok(props.resourceId, 'should have resourceId property');
  assert.deepEqual(DESCRIBE_ANALYTICS.inputSchema.required, ['type', 'resourceId']);
});

test('salesforce_run_analytics has correct schema', () => {
  const props = RUN_ANALYTICS.inputSchema.properties;
  assert.ok(props.type, 'should have type property');
  assert.ok(props.resourceId, 'should have resourceId property');
  assert.ok(props.includeDetails, 'should have includeDetails property');
  assert.ok(props.filters, 'should have filters property');
  assert.ok(props.topRows, 'should have topRows property');
  assert.ok(props.booleanFilter, 'should have booleanFilter property');
  assert.ok(props.standardDateFilter, 'should have standardDateFilter property');
  assert.deepEqual(RUN_ANALYTICS.inputSchema.required, ['type', 'resourceId']);
});

test('salesforce_refresh_dashboard has correct schema', () => {
  const props = REFRESH_DASHBOARD.inputSchema.properties;
  assert.ok(props.operation, 'should have operation property');
  assert.ok(props.dashboardId, 'should have dashboardId property');
  assert.deepEqual(props.operation.enum, ['refresh', 'status']);
  assert.deepEqual(REFRESH_DASHBOARD.inputSchema.required, ['operation', 'dashboardId']);
});
