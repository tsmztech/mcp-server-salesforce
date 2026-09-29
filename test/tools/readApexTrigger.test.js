import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleReadApexTrigger } from '../../dist/tools/readApexTrigger.js';
import { createMockConnection } from '../helpers/mockConnection.js';

test('readApexTrigger — read specific trigger returns body', async () => {
  const conn = createMockConnection({
    query: async () => ({
      totalSize: 1,
      records: [{
        Id: '01qxx1',
        Name: 'AccountTrigger',
        Body: 'trigger AccountTrigger on Account (before insert) { }',
        ApiVersion: '58.0',
        TableEnumOrId: 'Account',
        Status: 'Active',
        IsValid: true,
        LastModifiedDate: '2025-01-01T00:00:00.000Z',
      }],
    }),
  });
  const result = await handleReadApexTrigger(conn, { triggerName: 'AccountTrigger' });
  assert.equal(result.isError, undefined);
  assert.ok(result.content[0].text.includes('trigger AccountTrigger'));
});

test('readApexTrigger — trigger not found', async () => {
  const conn = createMockConnection({
    query: async () => ({ totalSize: 0, records: [] }),
  });
  const result = await handleReadApexTrigger(conn, { triggerName: 'NonExistent' });
  assert.equal(result.isError, true);
});

test('readApexTrigger — list triggers returns names', async () => {
  const conn = createMockConnection({
    query: async () => ({
      totalSize: 2,
      records: [
        { Id: '01q1', Name: 'TriggerA' },
        { Id: '01q2', Name: 'TriggerB' },
      ],
    }),
  });
  const result = await handleReadApexTrigger(conn, {});
  const text = result.content[0].text;
  assert.ok(text.includes('TriggerA'));
  assert.ok(text.includes('TriggerB'));
});

test('readApexTrigger — list with pattern includes LIKE', async () => {
  let capturedSoql = '';
  const conn = createMockConnection({
    query: async (soql) => {
      capturedSoql = soql;
      return { totalSize: 0, records: [] };
    },
  });
  await handleReadApexTrigger(conn, { namePattern: 'Account*' });
  assert.ok(capturedSoql.includes("LIKE 'Account%'"));
});

test('readApexTrigger — includeMetadata returns table with object name', async () => {
  const conn = createMockConnection({
    query: async () => ({
      totalSize: 1,
      records: [{
        Id: '01q1',
        Name: 'AccountTrigger',
        ApiVersion: '58.0',
        TableEnumOrId: 'Account',
        Status: 'Active',
        IsValid: true,
        LastModifiedDate: '2025-01-01T00:00:00.000Z',
      }],
    }),
  });
  const result = await handleReadApexTrigger(conn, { includeMetadata: true });
  const text = result.content[0].text;
  assert.ok(text.includes('Object'));
  assert.ok(text.includes('Account'));
});

test('readApexTrigger — API error returns isError', async () => {
  const conn = createMockConnection({
    query: async () => { throw new Error('SESSION_EXPIRED'); },
  });
  const result = await handleReadApexTrigger(conn, {});
  assert.equal(result.isError, true);
});
