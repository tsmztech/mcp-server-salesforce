import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleReadApex } from '../../dist/tools/readApex.js';
import { createMockConnection } from '../helpers/mockConnection.js';

test('readApex — read specific class returns body', async () => {
  const conn = createMockConnection({
    query: async () => ({
      totalSize: 1,
      records: [{
        Id: '01pxx1',
        Name: 'MyController',
        Body: 'public class MyController { }',
        ApiVersion: '58.0',
        LengthWithoutComments: 30,
        Status: 'Active',
        IsValid: true,
        LastModifiedDate: '2025-01-01T00:00:00.000Z',
      }],
    }),
  });
  const result = await handleReadApex(conn, { className: 'MyController' });
  assert.equal(result.isError, undefined);
  assert.ok(result.content[0].text.includes('public class MyController'));
});

test('readApex — class not found', async () => {
  const conn = createMockConnection({
    query: async () => ({ totalSize: 0, records: [] }),
  });
  const result = await handleReadApex(conn, { className: 'NonExistent' });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('NonExistent'));
});

test('readApex — list classes returns names', async () => {
  const conn = createMockConnection({
    query: async () => ({
      totalSize: 3,
      records: [
        { Id: '01p1', Name: 'ClassA' },
        { Id: '01p2', Name: 'ClassB' },
        { Id: '01p3', Name: 'ClassC' },
      ],
    }),
  });
  const result = await handleReadApex(conn, {});
  const text = result.content[0].text;
  assert.ok(text.includes('ClassA'));
  assert.ok(text.includes('ClassB'));
  assert.ok(text.includes('ClassC'));
  assert.ok(text.includes('3'));
});

test('readApex — list with pattern includes LIKE in SOQL', async () => {
  let capturedSoql = '';
  const conn = createMockConnection({
    query: async (soql) => {
      capturedSoql = soql;
      return { totalSize: 0, records: [] };
    },
  });
  await handleReadApex(conn, { namePattern: 'Controller' });
  assert.ok(capturedSoql.includes("LIKE '%Controller%'"));
});

test('readApex — wildcard * converted to %', async () => {
  let capturedSoql = '';
  const conn = createMockConnection({
    query: async (soql) => {
      capturedSoql = soql;
      return { totalSize: 0, records: [] };
    },
  });
  await handleReadApex(conn, { namePattern: 'Account*Ctrl' });
  assert.ok(capturedSoql.includes("LIKE 'Account%Ctrl'"));
});

test('readApex — wildcard ? converted to _', async () => {
  let capturedSoql = '';
  const conn = createMockConnection({
    query: async (soql) => {
      capturedSoql = soql;
      return { totalSize: 0, records: [] };
    },
  });
  await handleReadApex(conn, { namePattern: 'Test?' });
  assert.ok(capturedSoql.includes("LIKE 'Test_'"));
});

test('readApex — includeMetadata returns table format', async () => {
  const conn = createMockConnection({
    query: async () => ({
      totalSize: 1,
      records: [{
        Id: '01p1',
        Name: 'ClassA',
        ApiVersion: '58.0',
        LengthWithoutComments: 100,
        Status: 'Active',
        IsValid: true,
        LastModifiedDate: '2025-01-01T00:00:00.000Z',
      }],
    }),
  });
  const result = await handleReadApex(conn, { includeMetadata: true });
  const text = result.content[0].text;
  assert.ok(text.includes('API Version'));
  assert.ok(text.includes('58.0'));
});

test('readApex — API error returns isError', async () => {
  const conn = createMockConnection({
    query: async () => { throw new Error('INVALID_SESSION_ID'); },
  });
  const result = await handleReadApex(conn, {});
  assert.equal(result.isError, true);
});
