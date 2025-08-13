import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));

test('package.json has name and version', () => {
  assert.ok(pkg.name && typeof pkg.name === 'string');
  assert.ok(pkg.version && typeof pkg.version === 'string');
});
