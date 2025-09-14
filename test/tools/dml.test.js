import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleDMLRecords } from '../../src/tools/dml.ts';
import { MockSalesforceConnection } from '../mockSalesforceConnection.js';

test('handleDMLRecords - insert single record', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const mockResult = {
    success: true,
    id: '001000000000001'
  };
  
  mockConn.sobject('Account').setCreateResult(mockResult);
  
  const args = {
    operation: 'insert',
    objectName: 'Account',
    records: [{ Name: 'Test Account' }]
  };
  
  const result = await handleDMLRecords(mockConn, args);
  
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('INSERT operation completed'));
  assert.ok(result.content[0].text.includes('Processed 1 records'));
  assert.ok(result.content[0].text.includes('Successful: 1'));
  assert.ok(result.content[0].text.includes('Failed: 0'));
});

test('handleDMLRecords - insert multiple records', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const mockResult = [
    { success: true, id: '001000000000001' },
    { success: true, id: '001000000000002' },
    { success: false, errors: [{ message: 'Required field missing', statusCode: 'REQUIRED_FIELD_MISSING', fields: ['Name'] }] }
  ];
  
  mockConn.sobject('Account').setCreateResult(mockResult);
  
  const args = {
    operation: 'insert',
    objectName: 'Account',
    records: [
      { Name: 'Test Account 1' },
      { Name: 'Test Account 2' },
      { Name: '' } // This should fail
    ]
  };
  
  const result = await handleDMLRecords(mockConn, args);
  
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('INSERT operation completed'));
  assert.ok(result.content[0].text.includes('Processed 3 records'));
  assert.ok(result.content[0].text.includes('Successful: 2'));
  assert.ok(result.content[0].text.includes('Failed: 1'));
  assert.ok(result.content[0].text.includes('Required field missing'));
  assert.ok(result.content[0].text.includes('Fields: Name'));
});

test('handleDMLRecords - update records', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const mockResult = [
    { success: true, id: '001000000000001' },
    { success: true, id: '001000000000002' }
  ];
  
  mockConn.sobject('Account').setUpdateResult(mockResult);
  
  const args = {
    operation: 'update',
    objectName: 'Account',
    records: [
      { Id: '001000000000001', Name: 'Updated Account 1' },
      { Id: '001000000000002', Name: 'Updated Account 2' }
    ]
  };
  
  const result = await handleDMLRecords(mockConn, args);
  
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('UPDATE operation completed'));
  assert.ok(result.content[0].text.includes('Successful: 2'));
  assert.ok(result.content[0].text.includes('Failed: 0'));
});

test('handleDMLRecords - delete records', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const mockResult = [
    { success: true, id: '001000000000001' },
    { success: true, id: '001000000000002' }
  ];
  
  mockConn.sobject('Account').setDeleteResult(mockResult);
  
  const args = {
    operation: 'delete',
    objectName: 'Account',
    records: [
      { Id: '001000000000001' },
      { Id: '001000000000002' }
    ]
  };
  
  const result = await handleDMLRecords(mockConn, args);
  
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('DELETE operation completed'));
  assert.ok(result.content[0].text.includes('Successful: 2'));
});

test('handleDMLRecords - upsert with external ID', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const mockResult = [
    { success: true, id: '001000000000001', created: true },
    { success: true, id: '001000000000002', created: false }
  ];
  
  mockConn.sobject('Account').setUpsertResult(mockResult);
  
  const args = {
    operation: 'upsert',
    objectName: 'Account',
    records: [
      { External_Id__c: 'EXT001', Name: 'New Account' },
      { External_Id__c: 'EXT002', Name: 'Updated Account' }
    ],
    externalIdField: 'External_Id__c'
  };
  
  const result = await handleDMLRecords(mockConn, args);
  
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('UPSERT operation completed'));
  assert.ok(result.content[0].text.includes('Successful: 2'));
});

test('handleDMLRecords - upsert missing external ID field', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const args = {
    operation: 'upsert',
    objectName: 'Account',
    records: [{ Name: 'Test Account' }]
    // Missing externalIdField
  };
  
  try {
    await handleDMLRecords(mockConn, args);
    assert.fail('Expected error for missing external ID field');
  } catch (error) {
    assert.ok(error.message.includes('externalIdField is required for upsert operations'));
  }
});

test('handleDMLRecords - unsupported operation', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const args = {
    operation: 'merge', // Unsupported operation
    objectName: 'Account',
    records: [{ Id: '001000000000001' }]
  };
  
  try {
    await handleDMLRecords(mockConn, args);
    assert.fail('Expected error for unsupported operation');
  } catch (error) {
    assert.ok(error.message.includes('Unsupported operation: merge'));
  }
});

test('handleDMLRecords - single error format', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const mockResult = {
    success: false,
    errors: {
      message: 'Duplicate value found',
      statusCode: 'DUPLICATE_VALUE',
      fields: 'Email'
    }
  };
  
  mockConn.sobject('Contact').setCreateResult(mockResult);
  
  const args = {
    operation: 'insert',
    objectName: 'Contact',
    records: [{ Email: 'test@example.com', LastName: 'Test' }]
  };
  
  const result = await handleDMLRecords(mockConn, args);
  
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('Failed: 1'));
  assert.ok(result.content[0].text.includes('Duplicate value found'));
  assert.ok(result.content[0].text.includes('DUPLICATE_VALUE'));
  assert.ok(result.content[0].text.includes('Fields: Email'));
});

test('handleDMLRecords - array error format', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const mockResult = {
    success: false,
    errors: [
      {
        message: 'Required field missing',
        statusCode: 'REQUIRED_FIELD_MISSING',
        fields: ['LastName', 'Company']
      },
      {
        message: 'Invalid email format',
        statusCode: 'INVALID_EMAIL_ADDRESS',
        fields: ['Email']
      }
    ]
  };
  
  mockConn.sobject('Contact').setCreateResult(mockResult);
  
  const args = {
    operation: 'insert',
    objectName: 'Contact',
    records: [{ Email: 'invalid-email' }]
  };
  
  const result = await handleDMLRecords(mockConn, args);
  
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('Failed: 1'));
  assert.ok(result.content[0].text.includes('Required field missing'));
  assert.ok(result.content[0].text.includes('Invalid email format'));
  assert.ok(result.content[0].text.includes('Fields: LastName, Company'));
  assert.ok(result.content[0].text.includes('Fields: Email'));
});

test('handleDMLRecords - mixed success and failure', async () => {
  const mockConn = new MockSalesforceConnection();
  
  const mockResult = [
    { success: true, id: '001000000000001' },
    { 
      success: false, 
      errors: [{ 
        message: 'String too long',
        statusCode: 'STRING_TOO_LONG',
        fields: ['Name']
      }]
    },
    { success: true, id: '001000000000003' }
  ];
  
  mockConn.sobject('Account').setCreateResult(mockResult);
  
  const args = {
    operation: 'insert',
    objectName: 'Account',
    records: [
      { Name: 'Valid Account' },
      { Name: 'A'.repeat(300) }, // Too long
      { Name: 'Another Valid Account' }
    ]
  };
  
  const result = await handleDMLRecords(mockConn, args);
  
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('INSERT operation completed'));
  assert.ok(result.content[0].text.includes('Processed 3 records'));
  assert.ok(result.content[0].text.includes('Successful: 2'));
  assert.ok(result.content[0].text.includes('Failed: 1'));
  assert.ok(result.content[0].text.includes('String too long'));
  assert.ok(result.content[0].text.includes('Record 2:'));
});

test('handleDMLRecords - delete with ID extraction', async () => {
  const mockConn = new MockSalesforceConnection();
  
  // Mock the destroy method to verify correct ID extraction
  let capturedIds = [];
  mockConn.sobject('Account').destroy = async (ids) => {
    capturedIds = ids;
    return [{ success: true, id: ids[0] }];
  };
  
  const args = {
    operation: 'delete',
    objectName: 'Account',
    records: [
      { Id: '001000000000001', Name: 'Account to Delete' }
    ]
  };
  
  await handleDMLRecords(mockConn, args);
  
  // Verify that only the ID was passed to the destroy method
  assert.deepEqual(capturedIds, ['001000000000001']);
});