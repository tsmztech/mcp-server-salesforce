import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAggregateQuery } from '../../dist/tools/aggregateQuery.js';
import { createMockConnection } from '../helpers/mockConnection.js';

test('aggregate — basic GROUP BY success', async () => {
  const conn = createMockConnection({
    query: async () => ({
      totalSize: 2,
      records: [
        { StageName: 'Closed Won', expr0: 5 },
        { StageName: 'Prospecting', expr0: 3 },
      ],
    }),
  });
  const result = await handleAggregateQuery(conn, {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'COUNT(Id) cnt'],
    groupByFields: ['StageName'],
  });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('2'));
  assert.ok(result.content[0].text.includes('Closed Won'));
});

test('aggregate — missing GROUP BY field returns error', async () => {
  const conn = createMockConnection();
  const result = await handleAggregateQuery(conn, {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'Type', 'COUNT(Id) cnt'],
    groupByFields: ['StageName'],
    // Type is missing from groupByFields
  });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('Type'));
  assert.ok(result.content[0].text.includes('GROUP BY'));
});

test('aggregate — aggregate in WHERE clause returns error', async () => {
  const conn = createMockConnection();
  const result = await handleAggregateQuery(conn, {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'COUNT(Id) cnt'],
    groupByFields: ['StageName'],
    whereClause: 'COUNT(Id) > 5',
  });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('HAVING'));
});

test('aggregate — invalid ORDER BY field returns error', async () => {
  const conn = createMockConnection();
  const result = await handleAggregateQuery(conn, {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'COUNT(Id) cnt'],
    groupByFields: ['StageName'],
    orderBy: 'Amount',
  });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('ORDER BY'));
});

test('aggregate — SOQL includes HAVING clause', async () => {
  let capturedSoql = '';
  const conn = createMockConnection({
    query: async (soql) => {
      capturedSoql = soql;
      return { totalSize: 0, records: [] };
    },
  });
  await handleAggregateQuery(conn, {
    objectName: 'Opportunity',
    selectFields: ['Account.Name', 'COUNT(Id) cnt'],
    groupByFields: ['Account.Name'],
    havingClause: 'COUNT(Id) > 10',
  });
  assert.ok(capturedSoql.includes('HAVING COUNT(Id) > 10'));
});

test('aggregate — SOQL includes GROUP BY and ORDER BY', async () => {
  let capturedSoql = '';
  const conn = createMockConnection({
    query: async (soql) => {
      capturedSoql = soql;
      return { totalSize: 0, records: [] };
    },
  });
  await handleAggregateQuery(conn, {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'COUNT(Id) cnt'],
    groupByFields: ['StageName'],
    orderBy: 'COUNT(Id) DESC',
    limit: 10,
  });
  assert.ok(capturedSoql.includes('GROUP BY StageName'));
  assert.ok(capturedSoql.includes('ORDER BY COUNT(Id) DESC'));
  assert.ok(capturedSoql.includes('LIMIT 10'));
});

test('aggregate — date function in GROUP BY is valid', async () => {
  const conn = createMockConnection({
    query: async () => ({
      totalSize: 1,
      records: [{ expr0: 2025, expr1: 100000 }],
    }),
  });
  const result = await handleAggregateQuery(conn, {
    objectName: 'Opportunity',
    selectFields: ['CALENDAR_YEAR(CloseDate) Year', 'SUM(Amount) Total'],
    groupByFields: ['CALENDAR_YEAR(CloseDate)'],
  });
  assert.equal(result.isError, false);
});

test('aggregate — MALFORMED_QUERY error gets enhanced message', async () => {
  const conn = createMockConnection({
    query: async () => {
      throw new Error('MALFORMED_QUERY: GROUP BY missing field');
    },
  });
  const result = await handleAggregateQuery(conn, {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'COUNT(Id) cnt'],
    groupByFields: ['StageName'],
  });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('GROUP BY'));
});

test('aggregate — empty result', async () => {
  const conn = createMockConnection({
    query: async () => ({ totalSize: 0, records: [] }),
  });
  const result = await handleAggregateQuery(conn, {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'COUNT(Id) cnt'],
    groupByFields: ['StageName'],
  });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('0'));
});

test('aggregate — ORDER BY with aggregate function is valid', async () => {
  const conn = createMockConnection({
    query: async () => ({ totalSize: 0, records: [] }),
  });
  const result = await handleAggregateQuery(conn, {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'SUM(Amount) Total'],
    groupByFields: ['StageName'],
    orderBy: 'SUM(Amount) DESC',
  });
  // Should not be a validation error — aggregate functions are valid in ORDER BY
  assert.equal(result.isError, false);
});
