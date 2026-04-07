import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleManageObject } from '../../dist/tools/manageObject.js';
import { createMockConnection } from '../helpers/mockConnection.js';
import { createSpy } from '../helpers/spy.js';

test('manageObject — create custom object', async () => {
  const createSpy_ = createSpy(async (type, meta) => ({ success: true, fullName: meta.fullName }));
  const conn = createMockConnection({
    metadata: { create: createSpy_, read: async () => ({}), update: async () => ({}) },
  });
  const result = await handleManageObject(conn, {
    operation: 'create',
    objectName: 'Feedback',
    label: 'Feedback',
    pluralLabel: 'Feedbacks',
  });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('Successfully created'));
  assert.equal(createSpy_.calls.length, 1);
  assert.equal(createSpy_.calls[0].args[0], 'CustomObject');
  assert.ok(createSpy_.calls[0].args[1].fullName.includes('Feedback__c'));
});

test('manageObject — create without label returns error', async () => {
  const conn = createMockConnection();
  const result = await handleManageObject(conn, {
    operation: 'create',
    objectName: 'Feedback',
  });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('Label'));
});

test('manageObject — update custom object', async () => {
  const updateSpy_ = createSpy(async (type, meta) => ({ success: true, fullName: meta.fullName }));
  const conn = createMockConnection({
    metadata: {
      create: async () => ({}),
      read: async () => ({ fullName: 'Feedback__c', label: 'Feedback', pluralLabel: 'Feedbacks', sharingModel: 'ReadWrite' }),
      update: updateSpy_,
    },
  });
  const result = await handleManageObject(conn, {
    operation: 'update',
    objectName: 'Feedback',
    label: 'Customer Feedback',
  });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('Successfully updated'));
  assert.equal(updateSpy_.calls.length, 1);
});

test('manageObject — update nonexistent object returns error', async () => {
  const conn = createMockConnection({
    metadata: {
      create: async () => ({}),
      read: async () => null,
      update: async () => ({}),
    },
  });
  const result = await handleManageObject(conn, {
    operation: 'update',
    objectName: 'NonExistent',
  });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('not found'));
});

test('manageObject — create with AutoNumber name field', async () => {
  const createSpy_ = createSpy(async (type, meta) => ({ success: true, fullName: meta.fullName }));
  const conn = createMockConnection({
    metadata: { create: createSpy_, read: async () => ({}), update: async () => ({}) },
  });
  await handleManageObject(conn, {
    operation: 'create',
    objectName: 'Invoice',
    label: 'Invoice',
    pluralLabel: 'Invoices',
    nameFieldType: 'AutoNumber',
    nameFieldFormat: 'INV-{0000}',
  });
  const metadata = createSpy_.calls[0].args[1];
  assert.equal(metadata.nameField.type, 'AutoNumber');
  assert.equal(metadata.nameField.displayFormat, 'INV-{0000}');
});

test('manageObject — API error returns isError', async () => {
  const conn = createMockConnection({
    metadata: {
      create: async () => { throw new Error('INSUFFICIENT_ACCESS'); },
      read: async () => ({}),
      update: async () => ({}),
    },
  });
  const result = await handleManageObject(conn, {
    operation: 'create',
    objectName: 'Test',
    label: 'Test',
    pluralLabel: 'Tests',
  });
  assert.equal(result.isError, true);
});
