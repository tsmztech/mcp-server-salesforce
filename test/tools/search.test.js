import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleSearchObjects } from '../../dist/tools/search.js';
import { createMockConnection } from '../helpers/mockConnection.js';

const mockObjects = [
  { name: 'Account', label: 'Account', custom: false },
  { name: 'AccountHistory', label: 'Account History', custom: false },
  { name: 'Contact', label: 'Contact', custom: false },
  { name: 'CustomObj__c', label: 'Custom Object', custom: true },
  { name: 'AccountCoverage__c', label: 'Account Coverage', custom: true },
];

function connWith(sobjects) {
  return createMockConnection({
    describeGlobal: async () => ({ sobjects }),
  });
}

test('search — finds matching objects by API name', async () => {
  const result = await handleSearchObjects(connWith(mockObjects), { searchPattern: 'Account' });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('Account'));
  assert.ok(result.content[0].text.includes('AccountHistory'));
  assert.ok(result.content[0].text.includes('AccountCoverage__c'));
});

test('search — no matches', async () => {
  const result = await handleSearchObjects(connWith(mockObjects), { searchPattern: 'zzzznotfound' });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('No Salesforce objects found'));
});

test('search — case insensitive', async () => {
  const result = await handleSearchObjects(connWith(mockObjects), { searchPattern: 'account' });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('Account'));
});

test('search — multi-word search matches all terms', async () => {
  const result = await handleSearchObjects(connWith(mockObjects), { searchPattern: 'Account Coverage' });
  assert.equal(result.isError, false);
  // Only AccountCoverage__c has both terms
  assert.ok(result.content[0].text.includes('AccountCoverage__c'));
  assert.ok(!result.content[0].text.includes('AccountHistory'));
});

test('search — custom objects marked with (Custom)', async () => {
  const result = await handleSearchObjects(connWith(mockObjects), { searchPattern: 'CustomObj' });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('(Custom)'));
});

test('search — matches on label too', async () => {
  const result = await handleSearchObjects(connWith(mockObjects), { searchPattern: 'Custom Object' });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('CustomObj__c'));
});
