import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRestApi } from '../../dist/tools/restApi.js';
import { createMockConnection } from '../helpers/mockConnection.js';
import { createSpy } from '../helpers/spy.js';

test('restApi — GET success returns formatted response', async () => {
  const requestSpy = createSpy(async () => ({ DailyApiRequests: { Max: 15000, Remaining: 14500 } }));
  const conn = createMockConnection({ request: requestSpy, version: '59.0' });
  const result = await handleRestApi(conn, { method: 'GET', endpoint: '/limits' });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('DailyApiRequests'));
  assert.ok(result.content[0].text.includes('Success'));
  assert.ok(requestSpy.calls[0].args[0].url.includes('/services/data/v59.0/limits'));
});

test('restApi — POST with body', async () => {
  const requestSpy = createSpy(async () => ({ id: '001xx1', success: true }));
  const conn = createMockConnection({ request: requestSpy, version: '59.0' });
  const result = await handleRestApi(conn, {
    method: 'POST',
    endpoint: '/composite',
    body: { allOrNone: true, compositeRequest: [] },
  });
  assert.equal(result.isError, false);
  assert.equal(requestSpy.calls[0].args[0].method, 'POST');
  assert.ok(requestSpy.calls[0].args[0].body.includes('allOrNone'));
});

test('restApi — rawPath skips version prefix', async () => {
  const requestSpy = createSpy(async () => ({ result: 'ok' }));
  const conn = createMockConnection({ request: requestSpy, version: '59.0' });
  await handleRestApi(conn, {
    method: 'GET',
    endpoint: '/services/apexrest/MyEndpoint',
    rawPath: true,
  });
  assert.ok(requestSpy.calls[0].args[0].url.startsWith('/services/apexrest/'));
  assert.ok(!requestSpy.calls[0].args[0].url.includes('/data/v'));
});

test('restApi — query parameters appended to URL', async () => {
  const requestSpy = createSpy(async () => ({}));
  const conn = createMockConnection({ request: requestSpy, version: '59.0' });
  await handleRestApi(conn, {
    method: 'GET',
    endpoint: '/analytics/reports/00Oxx1',
    queryParameters: { includeDetails: 'true' },
  });
  assert.ok(requestSpy.calls[0].args[0].url.includes('includeDetails=true'));
});

test('restApi — custom apiVersion override', async () => {
  const requestSpy = createSpy(async () => ({}));
  const conn = createMockConnection({ request: requestSpy, version: '59.0' });
  await handleRestApi(conn, {
    method: 'GET',
    endpoint: '/limits',
    apiVersion: '62.0',
  });
  assert.ok(requestSpy.calls[0].args[0].url.includes('/v62.0/'));
});

test('restApi — API error returns isError with details', async () => {
  const conn = createMockConnection({
    request: async () => { throw Object.assign(new Error('Not Found'), { errorCode: 'NOT_FOUND' }); },
    version: '59.0',
  });
  const result = await handleRestApi(conn, { method: 'GET', endpoint: '/sobjects/FakeObject' });
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('NOT_FOUND'));
});

test('restApi — large response is truncated', async () => {
  const largeData = 'x'.repeat(60000);
  const conn = createMockConnection({ request: async () => largeData, version: '59.0' });
  const result = await handleRestApi(conn, { method: 'GET', endpoint: '/limits' });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('truncated'));
  assert.ok(result.content[0].text.length < 55000);
});
