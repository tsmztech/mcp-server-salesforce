import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleQueryRecords } from '../../dist/tools/query.js';
import { createMockConnection } from '../helpers/mockConnection.js';

test('query — basic success returns formatted records', async () => {
  const conn = createMockConnection({
    query: async () => ({
      totalSize: 2,
      records: [
        { Name: 'Acme Corp' },
        { Name: 'Globex Inc' },
      ],
    }),
  });
  const result = await handleQueryRecords(conn, {
    objectName: 'Account',
    fields: ['Name'],
  });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('Acme Corp'));
  assert.ok(result.content[0].text.includes('Globex Inc'));
  assert.ok(result.content[0].text.includes('2 records'));
});

test('query — empty result', async () => {
  const conn = createMockConnection({
    query: async () => ({ totalSize: 0, records: [] }),
  });
  const result = await handleQueryRecords(conn, {
    objectName: 'Account',
    fields: ['Name'],
  });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('0 records'));
});

test('query — SOQL includes WHERE, ORDER BY, LIMIT', async () => {
  let capturedSoql = '';
  const conn = createMockConnection({
    query: async (soql) => {
      capturedSoql = soql;
      return { totalSize: 0, records: [] };
    },
  });
  await handleQueryRecords(conn, {
    objectName: 'Contact',
    fields: ['FirstName', 'LastName'],
    whereClause: "Account.Industry = 'Tech'",
    orderBy: 'LastName ASC',
    limit: 50,
  });
  assert.ok(capturedSoql.includes('SELECT FirstName, LastName FROM Contact'));
  assert.ok(capturedSoql.includes("WHERE Account.Industry = 'Tech'"));
  assert.ok(capturedSoql.includes('ORDER BY LastName ASC'));
  assert.ok(capturedSoql.includes('LIMIT 50'));
});

test('query — relationship field too deep returns error', async () => {
  const conn = createMockConnection();
  const result = await handleQueryRecords(conn, {
    objectName: 'Contact',
    fields: ['A.B.C.D.E.F'],
  });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('exceeds maximum depth'));
});

test('query — invalid subquery format returns error', async () => {
  const conn = createMockConnection();
  const result = await handleQueryRecords(conn, {
    objectName: 'Account',
    fields: ['SELECT Id FROM Contacts'],
  });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('parentheses'));
});

test('query — dot notation with empty part returns error', async () => {
  const conn = createMockConnection();
  const result = await handleQueryRecords(conn, {
    objectName: 'Contact',
    fields: ['Account..Name'],
  });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('dot notation'));
});

test('query — INVALID_FIELD error gets enhanced message', async () => {
  const conn = createMockConnection({
    query: async () => {
      throw new Error("INVALID_FIELD: No such column 'Account.Foo' on entity 'Contact'");
    },
  });
  const result = await handleQueryRecords(conn, {
    objectName: 'Contact',
    fields: ['Account.Foo'],
  });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('relationship'));
});

test('query — parent-to-child subquery formats correctly', async () => {
  const conn = createMockConnection({
    query: async () => ({
      totalSize: 1,
      records: [{
        Name: 'Acme',
        Contacts: [{ Id: '003xx1' }, { Id: '003xx2' }],
      }],
    }),
  });
  const result = await handleQueryRecords(conn, {
    objectName: 'Account',
    fields: ['Name', '(SELECT Id FROM Contacts)'],
  });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('Contacts: [2 records]'));
});

test('query — child-to-parent dot notation formats correctly', async () => {
  const conn = createMockConnection({
    query: async () => ({
      totalSize: 1,
      records: [{
        FirstName: 'John',
        Account: { Name: 'Acme Corp' },
      }],
    }),
  });
  const result = await handleQueryRecords(conn, {
    objectName: 'Contact',
    fields: ['FirstName', 'Account.Name'],
  });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('Account.Name: Acme Corp'));
});

test('query — null relationship handled gracefully', async () => {
  const conn = createMockConnection({
    query: async () => ({
      totalSize: 1,
      records: [{ FirstName: 'Orphan', Account: null }],
    }),
  });
  const result = await handleQueryRecords(conn, {
    objectName: 'Contact',
    fields: ['FirstName', 'Account.Name'],
  });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('Account.Name: null'));
});
