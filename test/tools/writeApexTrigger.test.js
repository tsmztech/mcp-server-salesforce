import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleWriteApexTrigger } from '../../dist/tools/writeApexTrigger.js';
import { createMockConnection } from '../helpers/mockConnection.js';
import { createSpy } from '../helpers/spy.js';

test('writeApexTrigger — create new trigger', async () => {
  const createSpy_ = createSpy(async () => ({ id: '01qxx1', success: true, errors: [] }));
  const conn = createMockConnection({
    query: async () => ({ totalSize: 0, records: [] }),
    tooling: { sobject: () => ({ create: createSpy_, update: async () => ({}) }) },
  });
  const result = await handleWriteApexTrigger(conn, {
    operation: 'create',
    triggerName: 'AccountTrigger',
    objectName: 'Account',
    body: 'trigger AccountTrigger on Account (before insert) { }',
  });
  assert.ok(!result.isError);
  assert.ok(result.content[0].text.includes('Successfully created'));
  assert.equal(createSpy_.calls.length, 1);
});

test('writeApexTrigger — create fails if trigger already exists', async () => {
  const conn = createMockConnection({
    query: async () => ({ totalSize: 1, records: [{ Id: '01qxx1' }] }),
  });
  const result = await handleWriteApexTrigger(conn, {
    operation: 'create',
    triggerName: 'AccountTrigger',
    objectName: 'Account',
    body: 'trigger AccountTrigger on Account (before insert) { }',
  });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('already exists'));
});

test('writeApexTrigger — update existing trigger', async () => {
  let queryCount = 0;
  const conn = createMockConnection({
    query: async (soql) => {
      queryCount++;
      if (queryCount === 1) return { totalSize: 1, records: [{ Id: '01qxx1', TableEnumOrId: 'Account' }] };
      return { totalSize: 1, records: [{ Id: '01qxx1', Name: 'AccountTrigger', ApiVersion: '58.0', TableEnumOrId: 'Account', Status: 'Active', IsValid: true, LastModifiedDate: '2025-01-01T00:00:00.000Z' }] };
    },
    tooling: { sobject: () => ({ create: async () => ({}), update: async () => ({ success: true }) }) },
  });
  const result = await handleWriteApexTrigger(conn, {
    operation: 'update',
    triggerName: 'AccountTrigger',
    body: 'trigger AccountTrigger on Account (before insert) { /* updated */ }',
  });
  assert.ok(!result.isError);
  assert.ok(result.content[0].text.includes('Successfully updated'));
});

test('writeApexTrigger — update fails if trigger not found', async () => {
  const conn = createMockConnection({
    query: async () => ({ totalSize: 0, records: [] }),
  });
  const result = await handleWriteApexTrigger(conn, {
    operation: 'update',
    triggerName: 'NonExistent',
    body: 'trigger NonExistent on Account (before insert) { }',
  });
  assert.equal(result.isError, true);
});

test('writeApexTrigger — body trigger name mismatch returns error', async () => {
  const conn = createMockConnection();
  const result = await handleWriteApexTrigger(conn, {
    operation: 'create',
    triggerName: 'AccountTrigger',
    body: 'trigger WrongName on Account (before insert) { }',
  });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('must match'));
});
