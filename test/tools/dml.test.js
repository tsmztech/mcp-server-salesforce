import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleDMLRecords } from '../../dist/tools/dml.js';
import { createMockConnection } from '../helpers/mockConnection.js';
import { createSpy } from '../helpers/spy.js';

test('dml — insert single record success', async () => {
  const conn = createMockConnection();
  const result = await handleDMLRecords(conn, {
    operation: 'insert',
    objectName: 'Account',
    records: [{ Name: 'New Account' }],
  });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('Successful: 1'));
});

test('dml — insert multiple records success', async () => {
  const conn = createMockConnection();
  const result = await handleDMLRecords(conn, {
    operation: 'insert',
    objectName: 'Account',
    records: [{ Name: 'A' }, { Name: 'B' }, { Name: 'C' }],
  });
  assert.equal(result.isError, false);
});

test('dml — update success', async () => {
  const conn = createMockConnection();
  const result = await handleDMLRecords(conn, {
    operation: 'update',
    objectName: 'Account',
    records: [{ Id: '001xx1', Name: 'Updated' }],
  });
  assert.equal(result.isError, false);
});

test('dml — delete success', async () => {
  const conn = createMockConnection();
  const result = await handleDMLRecords(conn, {
    operation: 'delete',
    objectName: 'Account',
    records: [{ Id: '001xx1' }],
  });
  assert.equal(result.isError, false);
});

test('dml — upsert success', async () => {
  const conn = createMockConnection();
  const result = await handleDMLRecords(conn, {
    operation: 'upsert',
    objectName: 'Account',
    records: [{ External_Id__c: 'EXT-001', Name: 'Upserted' }],
    externalIdField: 'External_Id__c',
  });
  assert.equal(result.isError, false);
});

test('dml — insert with partial failure reports errors', async () => {
  const conn = createMockConnection({
    sobject: (name) => ({
      create: async (records) => [
        { id: '001xx1', success: true, errors: [] },
        { id: null, success: false, errors: [{ message: 'REQUIRED_FIELD_MISSING', statusCode: 'REQUIRED_FIELD_MISSING' }] },
      ],
      update: async () => [],
      destroy: async () => [],
      upsert: async () => [],
    }),
  });
  const result = await handleDMLRecords(conn, {
    operation: 'insert',
    objectName: 'Account',
    records: [{ Name: 'Good' }, {}],
  });
  const text = result.content[0].text;
  assert.ok(text.includes('Successful: 1'));
  assert.ok(text.includes('Failed: 1'));
  assert.ok(text.includes('REQUIRED_FIELD_MISSING'));
});

test('dml — API error returns isError', async () => {
  const conn = createMockConnection({
    sobject: (name) => ({
      create: async () => { throw new Error('UNABLE_TO_LOCK_ROW'); },
      update: async () => { throw new Error('UNABLE_TO_LOCK_ROW'); },
      destroy: async () => { throw new Error('UNABLE_TO_LOCK_ROW'); },
      upsert: async () => { throw new Error('UNABLE_TO_LOCK_ROW'); },
    }),
  });
  const result = await handleDMLRecords(conn, {
    operation: 'insert',
    objectName: 'Account',
    records: [{ Name: 'Will Fail' }],
  });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('UNABLE_TO_LOCK_ROW'));
});

test('dml — upsert without externalIdField returns isError', async () => {
  const conn = createMockConnection();
  const result = await handleDMLRecords(conn, {
    operation: 'upsert',
    objectName: 'Account',
    records: [{ Name: 'Test' }],
  });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('externalIdField'));
});

test('dml — partial failure sets isError true', async () => {
  const conn = createMockConnection({
    sobject: (name) => ({
      create: async (records) => [
        { id: '001xx1', success: true, errors: [] },
        { id: null, success: false, errors: [{ message: 'REQUIRED_FIELD_MISSING', statusCode: 'REQUIRED_FIELD_MISSING' }] },
      ],
      update: async () => [],
      destroy: async () => [],
      upsert: async () => [],
    }),
  });
  const result = await handleDMLRecords(conn, {
    operation: 'insert',
    objectName: 'Account',
    records: [{ Name: 'Good' }, {}],
  });
  assert.equal(result.isError, true);
});

test('dml — delete extracts Ids from records', async () => {
  const destroySpy = createSpy(async (ids) =>
    ids.map(() => ({ id: null, success: true, errors: [] }))
  );
  const conn = createMockConnection({
    sobject: (name) => ({
      create: async () => [],
      update: async () => [],
      destroy: destroySpy,
      upsert: async () => [],
    }),
  });
  await handleDMLRecords(conn, {
    operation: 'delete',
    objectName: 'Account',
    records: [{ Id: '001xx1' }, { Id: '001xx2' }],
  });
  assert.equal(destroySpy.calls.length, 1);
  assert.deepEqual(destroySpy.calls[0].args[0], ['001xx1', '001xx2']);
});
