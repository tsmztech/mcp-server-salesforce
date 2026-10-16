import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleWriteApex } from '../../dist/tools/writeApex.js';
import { createMockConnection } from '../helpers/mockConnection.js';
import { createSpy } from '../helpers/spy.js';

test('writeApex — create new class', async () => {
  const createSpy_ = createSpy(async () => ({ id: '01pxx1', success: true, errors: [] }));
  const conn = createMockConnection({
    query: async () => ({ totalSize: 0, records: [] }),
    tooling: { sobject: () => ({ create: createSpy_, update: async () => ({}) }) },
  });
  const result = await handleWriteApex(conn, {
    operation: 'create',
    className: 'MyClass',
    body: 'public class MyClass { }',
  });
  assert.ok(!result.isError);
  assert.ok(result.content[0].text.includes('Successfully created'));
  assert.equal(createSpy_.calls.length, 1);
});

test('writeApex — create fails if class already exists', async () => {
  const conn = createMockConnection({
    query: async () => ({ totalSize: 1, records: [{ Id: '01pxx1' }] }),
  });
  const result = await handleWriteApex(conn, {
    operation: 'create',
    className: 'MyClass',
    body: 'public class MyClass { }',
  });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('already exists'));
});

test('writeApex — update existing class', async () => {
  let queryCount = 0;
  const conn = createMockConnection({
    query: async () => {
      queryCount++;
      if (queryCount === 1) return { totalSize: 1, records: [{ Id: '01pxx1' }] };
      return { totalSize: 1, records: [{ Id: '01pxx1', Name: 'MyClass', ApiVersion: '58.0', Status: 'Active', LastModifiedDate: '2025-01-01T00:00:00.000Z' }] };
    },
    tooling: { sobject: () => ({ create: async () => ({}), update: async () => ({ success: true }) }) },
  });
  const result = await handleWriteApex(conn, {
    operation: 'update',
    className: 'MyClass',
    body: 'public class MyClass { /* updated */ }',
  });
  assert.ok(!result.isError);
  assert.ok(result.content[0].text.includes('Successfully updated'));
});

test('writeApex — update fails if class not found', async () => {
  const conn = createMockConnection({
    query: async () => ({ totalSize: 0, records: [] }),
  });
  const result = await handleWriteApex(conn, {
    operation: 'update',
    className: 'NonExistent',
    body: 'public class NonExistent { }',
  });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('No Apex class found'));
});

test('writeApex — body class name mismatch returns error', async () => {
  const conn = createMockConnection();
  const result = await handleWriteApex(conn, {
    operation: 'create',
    className: 'MyClass',
    body: 'public class WrongName { }',
  });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('must match'));
});

test('writeApex — API error returns isError', async () => {
  const conn = createMockConnection({
    query: async () => ({ totalSize: 0, records: [] }),
    tooling: { sobject: () => ({ create: async () => { throw new Error('COMPILE_ERROR'); } }) },
  });
  const result = await handleWriteApex(conn, {
    operation: 'create',
    className: 'BadClass',
    body: 'public class BadClass { }',
  });
  assert.equal(result.isError, true);
});
