import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAggregateQuery } from '../../src/tools/aggregateQuery.ts';
import { MockSalesforceConnection } from '../mockSalesforceConnection.js';

test('handleAggregateQuery - basic COUNT query', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const mockResult = {
    records: [
      { StageName: 'Prospecting', expr0: 5 },
      { StageName: 'Closed Won', expr0: 3 }
    ]
  };
  
  mockConn.setQueryResult('SELECT StageName, COUNT(Id) FROM Opportunity GROUP BY StageName', mockResult);
  
  const args = {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'COUNT(Id)'],
    groupByFields: ['StageName']
  };
  
  const result = await handleAggregateQuery(mockConn, args);
  
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('Aggregate query returned 2 grouped results'));
  assert.ok(result.content[0].text.includes('Prospecting'));
  assert.ok(result.content[0].text.includes('Closed Won'));
});

test('handleAggregateQuery - query with aliases', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const mockResult = {
    records: [
      { StageName: 'Prospecting', OpportunityCount: 5 },
      { StageName: 'Closed Won', OpportunityCount: 3 }
    ]
  };
  
  mockConn.setQueryResult('SELECT StageName, COUNT(Id) OpportunityCount FROM Opportunity GROUP BY StageName', mockResult);
  
  const args = {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'COUNT(Id) OpportunityCount'],
    groupByFields: ['StageName']
  };
  
  const result = await handleAggregateQuery(mockConn, args);
  
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('OpportunityCount'));
});

test('handleAggregateQuery - multiple aggregate functions', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const mockResult = {
    records: [
      { 
        StageName: 'Prospecting', 
        OpportunityCount: 5, 
        TotalAmount: 250000,
        AvgAmount: 50000
      }
    ]
  };
  
  const query = 'SELECT StageName, COUNT(Id) OpportunityCount, SUM(Amount) TotalAmount, AVG(Amount) AvgAmount FROM Opportunity GROUP BY StageName';
  mockConn.setQueryResult(query, mockResult);
  
  const args = {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'COUNT(Id) OpportunityCount', 'SUM(Amount) TotalAmount', 'AVG(Amount) AvgAmount'],
    groupByFields: ['StageName']
  };
  
  const result = await handleAggregateQuery(mockConn, args);
  
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('OpportunityCount: 5'));
  assert.ok(result.content[0].text.includes('TotalAmount: 250000'));
  assert.ok(result.content[0].text.includes('AvgAmount: 50000'));
});

test('handleAggregateQuery - with WHERE clause', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const mockResult = {
    records: [
      { StageName: 'Prospecting', expr0: 3 }
    ]
  };
  
  const query = "SELECT StageName, COUNT(Id) FROM Opportunity WHERE Amount > 10000 GROUP BY StageName";
  mockConn.setQueryResult(query, mockResult);
  
  const args = {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'COUNT(Id)'],
    groupByFields: ['StageName'],
    whereClause: 'Amount > 10000'
  };
  
  const result = await handleAggregateQuery(mockConn, args);
  
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('Aggregate query returned 1 grouped results'));
});

test('handleAggregateQuery - with HAVING clause', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const mockResult = {
    records: [
      { StageName: 'Prospecting', OpportunityCount: 15 }
    ]
  };
  
  const query = 'SELECT StageName, COUNT(Id) OpportunityCount FROM Opportunity GROUP BY StageName HAVING COUNT(Id) > 10';
  mockConn.setQueryResult(query, mockResult);
  
  const args = {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'COUNT(Id) OpportunityCount'],
    groupByFields: ['StageName'],
    havingClause: 'COUNT(Id) > 10'
  };
  
  const result = await handleAggregateQuery(mockConn, args);
  
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('OpportunityCount: 15'));
});

test('handleAggregateQuery - with ORDER BY', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const mockResult = {
    records: [
      { StageName: 'Closed Won', OpportunityCount: 10 },
      { StageName: 'Prospecting', OpportunityCount: 5 }
    ]
  };
  
  const query = 'SELECT StageName, COUNT(Id) OpportunityCount FROM Opportunity GROUP BY StageName ORDER BY COUNT(Id) DESC';
  mockConn.setQueryResult(query, mockResult);
  
  const args = {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'COUNT(Id) OpportunityCount'],
    groupByFields: ['StageName'],
    orderBy: 'COUNT(Id) DESC'
  };
  
  const result = await handleAggregateQuery(mockConn, args);
  
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('Closed Won'));
  assert.ok(result.content[0].text.includes('Prospecting'));
});

test('handleAggregateQuery - with LIMIT', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const mockResult = {
    records: [
      { StageName: 'Prospecting', OpportunityCount: 5 }
    ]
  };
  
  const query = 'SELECT StageName, COUNT(Id) OpportunityCount FROM Opportunity GROUP BY StageName LIMIT 1';
  mockConn.setQueryResult(query, mockResult);
  
  const args = {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'COUNT(Id) OpportunityCount'],
    groupByFields: ['StageName'],
    limit: 1
  };
  
  const result = await handleAggregateQuery(mockConn, args);
  
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('Aggregate query returned 1 grouped results'));
});

test('handleAggregateQuery - date functions', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const mockResult = {
    records: [
      { expr0: 2024, expr1: 1, Revenue: 500000 }
    ]
  };
  
  const query = 'SELECT CALENDAR_YEAR(CloseDate), CALENDAR_QUARTER(CloseDate), SUM(Amount) Revenue FROM Opportunity GROUP BY CALENDAR_YEAR(CloseDate), CALENDAR_QUARTER(CloseDate)';
  mockConn.setQueryResult(query, mockResult);
  
  const args = {
    objectName: 'Opportunity',
    selectFields: ['CALENDAR_YEAR(CloseDate)', 'CALENDAR_QUARTER(CloseDate)', 'SUM(Amount) Revenue'],
    groupByFields: ['CALENDAR_YEAR(CloseDate)', 'CALENDAR_QUARTER(CloseDate)']
  };
  
  const result = await handleAggregateQuery(mockConn, args);
  
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('Revenue: 500000'));
});

test('handleAggregateQuery - relationship fields', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const mockResult = {
    records: [
      { expr0: 'Technology', ContactCount: 25 }
    ]
  };
  
  const query = 'SELECT Account.Industry, COUNT(Id) ContactCount FROM Contact GROUP BY Account.Industry';
  mockConn.setQueryResult(query, mockResult);
  
  const args = {
    objectName: 'Contact',
    selectFields: ['Account.Industry', 'COUNT(Id) ContactCount'],
    groupByFields: ['Account.Industry']
  };
  
  const result = await handleAggregateQuery(mockConn, args);
  
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('ContactCount: 25'));
});

test('handleAggregateQuery - missing fields in GROUP BY error', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const args = {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'Type', 'COUNT(Id)'], // Type not in GROUP BY
    groupByFields: ['StageName']
  };
  
  const result = await handleAggregateQuery(mockConn, args);
  
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('must be included in GROUP BY clause'));
  assert.ok(result.content[0].text.includes('Type'));
});

test('handleAggregateQuery - aggregate in WHERE clause error', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const args = {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'COUNT(Id) OpportunityCount'],
    groupByFields: ['StageName'],
    whereClause: 'COUNT(Id) > 5' // Should be in HAVING
  };
  
  const result = await handleAggregateQuery(mockConn, args);
  
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('WHERE clause cannot contain aggregate functions'));
  assert.ok(result.content[0].text.includes('Use HAVING clause instead'));
});

test('handleAggregateQuery - invalid ORDER BY field error', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const args = {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'COUNT(Id) OpportunityCount'],
    groupByFields: ['StageName'],
    orderBy: 'Amount DESC' // Amount not in GROUP BY or aggregates
  };
  
  const result = await handleAggregateQuery(mockConn, args);
  
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('ORDER BY field \'Amount\' must be in GROUP BY clause'));
});

test('handleAggregateQuery - query execution error', async () => {
  const mockConn = new MockSalesforceConnection();
  
  // Mock connection that throws an error
  mockConn.query = async () => {
    throw new Error('MALFORMED_QUERY: GROUP BY expression must have an explicit alias');
  };
  
  const args = {
    objectName: 'Opportunity',
    selectFields: ['StageName', 'COUNT(Id)'],
    groupByFields: ['StageName']
  };
  
  const result = await handleAggregateQuery(mockConn, args);
  
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('Error executing aggregate query'));
  assert.ok(result.content[0].text.includes('MALFORMED_QUERY'));
});

test('handleAggregateQuery - all aggregate functions', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const mockResult = {
    records: [
      { 
        StageName: 'Closed Won',
        RecordCount: 10,
        TotalAmount: 1000000,
        AvgAmount: 100000,
        MinAmount: 50000,
        MaxAmount: 200000,
        DistinctOwners: 3
      }
    ]
  };
  
  const query = 'SELECT StageName, COUNT(Id) RecordCount, SUM(Amount) TotalAmount, AVG(Amount) AvgAmount, MIN(Amount) MinAmount, MAX(Amount) MaxAmount, COUNT_DISTINCT(OwnerId) DistinctOwners FROM Opportunity GROUP BY StageName';
  mockConn.setQueryResult(query, mockResult);
  
  const args = {
    objectName: 'Opportunity',
    selectFields: [
      'StageName', 
      'COUNT(Id) RecordCount', 
      'SUM(Amount) TotalAmount', 
      'AVG(Amount) AvgAmount',
      'MIN(Amount) MinAmount',
      'MAX(Amount) MaxAmount',
      'COUNT_DISTINCT(OwnerId) DistinctOwners'
    ],
    groupByFields: ['StageName']
  };
  
  const result = await handleAggregateQuery(mockConn, args);
  
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('RecordCount: 10'));
  assert.ok(result.content[0].text.includes('TotalAmount: 1000000'));
  assert.ok(result.content[0].text.includes('AvgAmount: 100000'));
  assert.ok(result.content[0].text.includes('MinAmount: 50000'));
  assert.ok(result.content[0].text.includes('MaxAmount: 200000'));
  assert.ok(result.content[0].text.includes('DistinctOwners: 3'));
});