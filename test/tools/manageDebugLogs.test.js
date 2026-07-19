import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleManageDebugLogs } from '../../dist/tools/manageDebugLogs.js';
import { createMockConnection } from '../helpers/mockConnection.js';
import { createSpy } from '../helpers/spy.js';

function userLookupConn(overrides = {}) {
  return createMockConnection({
    query: async (soql) => {
      if (soql.includes('FROM User')) {
        return { totalSize: 1, records: [{ Id: '005xx1', Username: 'test@example.com', Name: 'Test User', IsActive: true }] };
      }
      return { totalSize: 0, records: [] };
    },
    ...overrides,
  });
}

test('manageDebugLogs — enable creates trace flag', async () => {
  const createSpy_ = createSpy(async () => ({ id: '07Lxx1', success: true, errors: [] }));
  const conn = userLookupConn({
    tooling: {
      query: async () => ({ totalSize: 0, records: [] }),
      sobject: (name) => ({
        create: createSpy_,
        update: async () => ({}),
        delete: async () => ({}),
      }),
    },
  });
  const result = await handleManageDebugLogs(conn, {
    operation: 'enable',
    username: 'test@example.com',
    logLevel: 'DEBUG',
  });
  assert.ok(!result.isError);
  assert.ok(createSpy_.calls.length >= 1);
});

test('manageDebugLogs — enable with unknown user returns error', async () => {
  const conn = createMockConnection({
    query: async () => ({ totalSize: 0, records: [] }),
  });
  const result = await handleManageDebugLogs(conn, {
    operation: 'enable',
    username: 'nonexistent@example.com',
  });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('nonexistent@example.com'));
});

test('manageDebugLogs — retrieve lists logs', async () => {
  const conn = userLookupConn({
    tooling: {
      query: async (soql) => {
        if (soql.includes('FROM ApexLog')) {
          return {
            totalSize: 2,
            records: [
              { Id: '07Lxx1', LogUserId: '005xx1', Operation: '/apex/MyPage', Application: 'Browser', Status: 'Success', LogLength: 1024, LastModifiedDate: '2025-01-01T00:00:00.000Z', Request: 'GET' },
              { Id: '07Lxx2', LogUserId: '005xx1', Operation: '/apex/OtherPage', Application: 'Browser', Status: 'Success', LogLength: 2048, LastModifiedDate: '2025-01-01T01:00:00.000Z', Request: 'GET' },
            ],
          };
        }
        return { totalSize: 0, records: [] };
      },
      sobject: () => ({ create: async () => ({}), update: async () => ({}), delete: async () => ({}) }),
    },
  });
  const result = await handleManageDebugLogs(conn, {
    operation: 'retrieve',
    username: 'test@example.com',
  });
  assert.ok(!result.isError);
  const text = result.content[0].text;
  assert.ok(text.includes('07Lxx1'));
  assert.ok(text.includes('07Lxx2'));
  assert.ok(text.includes('/apex/MyPage'));
});

test('manageDebugLogs — retrieve with no logs', async () => {
  const conn = userLookupConn({
    tooling: {
      query: async () => ({ totalSize: 0, records: [] }),
      sobject: () => ({ create: async () => ({}), update: async () => ({}), delete: async () => ({}) }),
    },
  });
  const result = await handleManageDebugLogs(conn, {
    operation: 'retrieve',
    username: 'test@example.com',
  });
  assert.ok(!result.isError);
  assert.ok(result.content[0].text.includes('No debug logs found'));
});

test('manageDebugLogs — retrieve specific log by ID', async () => {
  const conn = userLookupConn({
    tooling: {
      query: async (soql) => {
        if (soql.includes('FROM ApexLog')) {
          return {
            totalSize: 1,
            records: [{
              Id: '07Lxx1', LogUserId: '005xx1', Operation: '/apex/MyPage',
              Application: 'Browser', Status: 'Success', LogLength: 1024,
              LastModifiedDate: '2025-01-01T00:00:00.000Z', Request: 'GET',
            }],
          };
        }
        return { totalSize: 0, records: [] };
      },
      sobject: () => ({ create: async () => ({}), update: async () => ({}), delete: async () => ({}) }),
      request: async () => 'DEBUG LOG BODY CONTENT',
    },
  });
  const result = await handleManageDebugLogs(conn, {
    operation: 'retrieve',
    username: 'test@example.com',
    logId: '07Lxx1',
    includeBody: true,
  });
  assert.ok(!result.isError);
  assert.ok(result.content[0].text.includes('DEBUG LOG BODY CONTENT'));
});

test('manageDebugLogs — API error returns isError', async () => {
  const conn = createMockConnection({
    query: async () => { throw new Error('INVALID_SESSION'); },
  });
  const result = await handleManageDebugLogs(conn, {
    operation: 'retrieve',
    username: 'test@example.com',
  });
  assert.equal(result.isError, true);
});
