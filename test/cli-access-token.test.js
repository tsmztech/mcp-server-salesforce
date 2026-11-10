import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isSalesforceAccessToken } from '../dist/utils/connection.js';

test('accepts an org-scoped access token', () => {
  assert.equal(isSalesforceAccessToken('00D5e000000AbCdEFG!AQ8AQExampleSessionValue.1234'), true);
});

test('rejects the redacted placeholder from sf org display', () => {
  assert.equal(isSalesforceAccessToken("[REDACTED] Use 'sf org auth show-access-token' to view"), false);
});

test('rejects a missing token', () => {
  assert.equal(isSalesforceAccessToken(undefined), false);
});
