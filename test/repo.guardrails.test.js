import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const workflowsDir = join(root, '.github', 'workflows');

// helper: does any workflow file look like a scorecard workflow?
function hasScorecardWorkflow() {
  if (!existsSync(workflowsDir)) return false;
  const files = readdirSync(workflowsDir);
  return files.some(f => /scorecard/i.test(f));
}

test('README exists and is non-empty', () => {
  const p = join(root, 'README.md');
  assert.ok(existsSync(p), 'README.md should exist');
  const content = readFileSync(p, 'utf8').trim();
  assert.ok(content.length > 20, 'README.md should not be empty');
});

test('Security + automation guardrails present (soft check)', () => {
  // SECURITY.md is strongly recommended, but don’t hard-fail your first PR if you’re adding it later.
  const hasSecurity = existsSync(join(root, 'SECURITY.md'));
  assert.ok(hasSecurity, 'SECURITY.md should exist (add a minimal policy)');

  // Accept any workflow file that includes "scorecard" in its name
  assert.ok(
    hasScorecardWorkflow(),
    'Expected a Scorecard workflow in .github/workflows (e.g., scorecards.yml)'
  );
});
