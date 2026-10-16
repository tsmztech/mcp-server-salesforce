import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleDescribeObject } from '../../dist/tools/describe.js';
import { createMockConnection } from '../helpers/mockConnection.js';

test('describe — returns formatted object metadata', async () => {
  const conn = createMockConnection({
    describe: async () => ({
      name: 'Account',
      label: 'Account',
      custom: false,
      fields: [
        { name: 'Id', label: 'Account ID', type: 'id', length: 18, updateable: false, nillable: false },
        { name: 'Name', label: 'Account Name', type: 'string', length: 255, updateable: true, nillable: false },
        { name: 'Industry', label: 'Industry', type: 'picklist', length: 0, updateable: true, nillable: true },
      ],
      childRelationships: [
        { childSObject: 'Contact', field: 'AccountId', relationshipName: 'Contacts' },
      ],
      recordTypeInfos: [],
    }),
  });
  const result = await handleDescribeObject(conn, 'Account');
  assert.equal(result.isError, false);
  const text = result.content[0].text;
  assert.ok(text.includes('Account'));
  assert.ok(text.includes('Name'));
  assert.ok(text.includes('Industry'));
});

test('describe — object not found returns isError', async () => {
  const conn = createMockConnection({
    describe: async () => {
      throw new Error("The requested resource does not exist: FakeObject__c");
    },
  });
  const result = await handleDescribeObject(conn, 'FakeObject__c');
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('FakeObject__c'));
});

test('describe — formats fields with type and required info', async () => {
  const conn = createMockConnection({
    describe: async () => ({
      name: 'Account',
      label: 'Account',
      custom: false,
      fields: [
        { name: 'Id', label: 'ID', type: 'id', length: 18, nillable: false },
        { name: 'Name', label: 'Account Name', type: 'string', length: 255, nillable: false },
      ],
      childRelationships: [],
      recordTypeInfos: [],
    }),
  });
  const result = await handleDescribeObject(conn, 'Account');
  assert.equal(result.isError, false);
  const text = result.content[0].text;
  assert.ok(text.includes('Type: id'));
  assert.ok(text.includes('Type: string'));
  assert.ok(text.includes('Required: true'));
});
