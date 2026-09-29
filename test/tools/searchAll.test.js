import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleSearchAll } from '../../dist/tools/searchAll.js';
import { createMockConnection } from '../helpers/mockConnection.js';

test('searchAll — basic SOSL returns results', async () => {
  const conn = createMockConnection({
    search: async () => ({
      searchRecords: [
        { attributes: { type: 'Account' }, Id: '001xx1', Name: 'Acme' },
        { attributes: { type: 'Contact' }, Id: '003xx1', Name: 'John Doe' },
      ],
    }),
  });
  const result = await handleSearchAll(conn, {
    searchTerm: 'Acme',
    objects: [
      { name: 'Account', fields: ['Id', 'Name'] },
      { name: 'Contact', fields: ['Id', 'Name'] },
    ],
  });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('Acme'));
});

test('searchAll — SOSL includes FIND and RETURNING', async () => {
  let capturedSosl = '';
  const conn = createMockConnection({
    search: async (sosl) => {
      capturedSosl = sosl;
      return { searchRecords: [] };
    },
  });
  await handleSearchAll(conn, {
    searchTerm: 'Test',
    objects: [{ name: 'Account', fields: ['Id', 'Name'], limit: 10 }],
  });
  assert.ok(capturedSosl.includes('FIND'));
  assert.ok(capturedSosl.includes('Test'));
  assert.ok(capturedSosl.includes('RETURNING'));
  assert.ok(capturedSosl.includes('Account'));
});

test('searchAll — per-object WHERE clause included', async () => {
  let capturedSosl = '';
  const conn = createMockConnection({
    search: async (sosl) => {
      capturedSosl = sosl;
      return { searchRecords: [] };
    },
  });
  await handleSearchAll(conn, {
    searchTerm: 'Test',
    objects: [{
      name: 'Account',
      fields: ['Id', 'Name'],
      where: "Industry = 'Tech'",
    }],
  });
  assert.ok(capturedSosl.includes("Industry = 'Tech'"));
});

test('searchAll — empty results', async () => {
  const conn = createMockConnection({
    search: async () => ({ searchRecords: [] }),
  });
  const result = await handleSearchAll(conn, {
    searchTerm: 'xyznotfound',
    objects: [{ name: 'Account', fields: ['Id', 'Name'] }],
  });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('0') || result.content[0].text.toLowerCase().includes('no'));
});

test('searchAll — searchIn parameter included in SOSL', async () => {
  let capturedSosl = '';
  const conn = createMockConnection({
    search: async (sosl) => {
      capturedSosl = sosl;
      return { searchRecords: [] };
    },
  });
  await handleSearchAll(conn, {
    searchTerm: 'Test',
    searchIn: 'NAME FIELDS',
    objects: [{ name: 'Account', fields: ['Id', 'Name'] }],
  });
  assert.ok(capturedSosl.includes('IN NAME FIELDS'));
});

test('searchAll — API error returns isError', async () => {
  const conn = createMockConnection({
    search: async () => { throw new Error('INVALID_SEARCH'); },
  });
  const result = await handleSearchAll(conn, {
    searchTerm: 'Test',
    objects: [{ name: 'Account', fields: ['Id'] }],
  });
  assert.equal(result.isError, true);
});
