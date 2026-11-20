import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// These tests exercise the built output, which `npm install` produces via the
// `prepare` script. Skip rather than fail when the build has not run yet.
const distConnection = join(process.cwd(), 'dist', 'utils', 'connection.js');
const skip = !existsSync(distConnection)
  ? 'dist not built; run `npm run build` first'
  : process.platform === 'win32'
    ? 'stub CLI on PATH is POSIX-only'
    : false;

// Writes a fake `sf` onto PATH that records its own arguments and returns a
// minimal valid `sf org display --json` payload.
function withStubCli() {
  const dir = mkdtempSync(join(tmpdir(), 'sf-stub-'));
  const argsLog = join(dir, 'args.txt');
  writeFileSync(
    join(dir, 'sf'),
    '#!/bin/sh\n' +
    `printf '%s\\n' "$*" > ${argsLog}\n` +
    'cat <<\'JSON\'\n' +
    '{"status":0,"result":{"accessToken":"stub-token","instanceUrl":"https://example.my.salesforce.com","username":"stub@example.com","alias":"stub"}}\n' +
    'JSON\n',
    { mode: 0o755 }
  );
  const originalPath = process.env.PATH;
  process.env.PATH = `${dir}:${originalPath}`;
  return {
    readArgs: () => (existsSync(argsLog) ? readFileSync(argsLog, 'utf8').trim() : ''),
    restore: () => { process.env.PATH = originalPath; }
  };
}

async function connectWithTargetOrg(targetOrg) {
  const { createSalesforceConnection } = await import('../dist/utils/connection.js');
  const stub = withStubCli();
  const previous = {
    type: process.env.SALESFORCE_CONNECTION_TYPE,
    target: process.env.SALESFORCE_TARGET_ORG
  };
  process.env.SALESFORCE_CONNECTION_TYPE = 'Salesforce_CLI';
  if (targetOrg === undefined) {
    delete process.env.SALESFORCE_TARGET_ORG;
  } else {
    process.env.SALESFORCE_TARGET_ORG = targetOrg;
  }
  try {
    const error = await createSalesforceConnection().then(() => null, (err) => err);
    return { args: stub.readArgs(), error };
  } finally {
    stub.restore();
    if (previous.type === undefined) delete process.env.SALESFORCE_CONNECTION_TYPE;
    else process.env.SALESFORCE_CONNECTION_TYPE = previous.type;
    if (previous.target === undefined) delete process.env.SALESFORCE_TARGET_ORG;
    else process.env.SALESFORCE_TARGET_ORG = previous.target;
  }
}

test('CLI auth omits --target-org when SALESFORCE_TARGET_ORG is unset', { skip }, async () => {
  const { args, error } = await connectWithTargetOrg(undefined);
  assert.equal(error, null, `expected a connection, got: ${error && error.message}`);
  assert.equal(args, 'org display --json');
});

test('CLI auth passes --target-org when SALESFORCE_TARGET_ORG is set', { skip }, async () => {
  const { args, error } = await connectWithTargetOrg('my-sandbox');
  assert.equal(error, null, `expected a connection, got: ${error && error.message}`);
  assert.equal(args, 'org display --json --target-org my-sandbox');
});

test('CLI auth accepts a username as SALESFORCE_TARGET_ORG', { skip }, async () => {
  const { args, error } = await connectWithTargetOrg('user@example.com');
  assert.equal(error, null, `expected a connection, got: ${error && error.message}`);
  assert.equal(args, 'org display --json --target-org user@example.com');
});

test('CLI auth rejects a SALESFORCE_TARGET_ORG that could inject a flag', { skip }, async () => {
  const { args, error } = await connectWithTargetOrg('--json');
  assert.ok(error, 'expected an error');
  assert.match(error.message, /Invalid SALESFORCE_TARGET_ORG/);
  assert.equal(args, '', 'the CLI should not run at all');
});

test('CLI auth rejects a SALESFORCE_TARGET_ORG containing shell metacharacters', { skip }, async () => {
  const { args, error } = await connectWithTargetOrg('alias; touch /tmp/pwned');
  assert.ok(error, 'expected an error');
  assert.match(error.message, /Invalid SALESFORCE_TARGET_ORG/);
  assert.equal(args, '', 'the CLI should not run at all');
});
