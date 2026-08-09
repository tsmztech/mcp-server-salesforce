# Technical Design: Unit Testing Across All Tool Handlers

## Test Infrastructure

### Test Runner and Assertions

No new dependencies. Use what the project already uses:
- **Runner:** `node --test` (Node.js built-in)
- **Assertions:** `node:assert/strict`
- **Mocking:** Plain objects with a lightweight spy helper — every handler takes `conn: any`

### Directory Structure

```
test/
  helpers/
    mockConnection.js       # Shared mock factory
    spy.js                  # Lightweight call-tracking spy
  tools/
    query.test.js
    aggregateQuery.test.js
    search.test.js
    describe.test.js
    dml.test.js
    manageObject.test.js
    manageField.test.js
    manageFieldPermissions.test.js
    searchAll.test.js
    readApex.test.js
    writeApex.test.js
    readApexTrigger.test.js
    writeApexTrigger.test.js
    executeAnonymous.test.js
    manageDebugLogs.test.js
  utils/
    pagination.test.js      # Pagination utility tests
  package.test.js            # existing
  repo.guardrails.test.js    # existing
```

### npm test Script Update

The current `"test": "node --test"` auto-discovers `**/*.test.*` recursively, so adding `test/tools/*.test.js` and `test/utils/*.test.js` will be picked up automatically. No script change needed.

### Build Before Test

Tests import from `dist/` (compiled JS). The test workflow is:
```bash
npm run build && npm test
```

This matches the existing convention in `test/package.test.js` which imports from `dist/`.

---

## Spy Helper

**File:** `test/helpers/spy.js`

A lightweight call-tracking wrapper (~15 lines, zero dependencies). Wraps any async function and records every call's arguments and return value. Solves the main limitation of plain-object mocks: verifying *what* was called, *how many times*, and *with what arguments*.

```javascript
/**
 * Wraps an async function and records all calls.
 * @param {Function} fn - The function to wrap (default: async no-op)
 * @returns {Function} A spy function with a `.calls` array
 */
export function createSpy(fn = async () => {}) {
  const spy = async (...args) => {
    const result = await fn(...args);
    spy.calls.push({ args, result });
    return result;
  };
  spy.calls = [];
  return spy;
}
```

**Usage:**

```javascript
import { createSpy } from '../helpers/spy.js';

test('enable creates a trace flag', async () => {
  const createSpy_ = createSpy(async (record) => ({ id: '07Lxx1', success: true }));

  const conn = createMockConnection({
    query: async (soql) => {
      if (soql.includes('FROM User'))
        return { totalSize: 1, records: [{ Id: '005xx' }] };
      return { totalSize: 0, records: [] };
    },
    tooling: {
      query: async () => ({ totalSize: 0, records: [] }),
      sobject: (name) => ({
        create: createSpy_,
      }),
    },
  });

  await handleManageDebugLogs(conn, { operation: 'enable', username: 'test@example.com' });

  // Verify create was called exactly once
  assert.equal(createSpy_.calls.length, 1);
  // Verify it was called with the right payload shape
  assert.ok(createSpy_.calls[0].args[0].TracedEntityId);
});
```

The spy is deliberately minimal — it records calls and that's it. No `calledWith` matchers, no `restore()`, no fake timers. If a test needs to assert on call args, it reads from `spy.calls[n].args` directly. This avoids the complexity of a full mocking library while giving us everything we need for the ~12 handlers that chain multiple API calls.

---

## Mock Connection Factory

**File:** `test/helpers/mockConnection.js`

Creates a mock `conn` object with every method any handler calls. Returns sensible defaults. Tests override specific methods.

```javascript
export function createMockConnection(overrides = {}) {
  const defaultConn = {
    // Standard API
    query: async (soql, options) => ({
      totalSize: 0,
      done: true,
      records: [],
    }),
    search: async (sosl) => ({
      searchRecords: [],
    }),
    describe: async (objectName) => ({
      name: objectName,
      label: objectName,
      fields: [],
      custom: false,
      childRelationships: [],
      recordTypeInfos: [],
    }),
    describeGlobal: async () => ({
      sobjects: [],
    }),
    sobject: (name) => ({
      create: async (records) => (
        Array.isArray(records)
          ? records.map((_, i) => ({ id: `001xx00000${i}`, success: true, errors: [] }))
          : { id: '001xx000001', success: true, errors: [] }
      ),
      update: async (records) => (
        Array.isArray(records)
          ? records.map(() => ({ id: null, success: true, errors: [] }))
          : { id: null, success: true, errors: [] }
      ),
      destroy: async (ids) => (
        Array.isArray(ids)
          ? ids.map(() => ({ id: null, success: true, errors: [] }))
          : { id: null, success: true, errors: [] }
      ),
      upsert: async (records, extIdField) => (
        Array.isArray(records)
          ? records.map((_, i) => ({ id: `001xx00000${i}`, success: true, errors: [], created: true }))
          : { id: '001xx000001', success: true, errors: [], created: true }
      ),
    }),

    // Metadata API
    metadata: {
      create: async (type, metadata) => ({ success: true, fullName: metadata.fullName }),
      read: async (type, fullNames) => ({}),
      update: async (type, metadata) => ({ success: true, fullName: metadata.fullName }),
    },

    // Tooling API
    tooling: {
      query: async (soql) => ({
        totalSize: 0,
        done: true,
        records: [],
      }),
      sobject: (name) => ({
        create: async (record) => ({ id: '07Lxx000001', success: true, errors: [] }),
        update: async (record) => ({ id: null, success: true, errors: [] }),
        delete: async (id) => ({ id: null, success: true, errors: [] }),
      }),
      executeAnonymous: async (code) => ({
        compiled: true,
        compileProblem: null,
        success: true,
        exceptionMessage: null,
        exceptionStackTrace: null,
        line: -1,
        column: -1,
      }),
      request: async (opts) => '',
    },

    // Analytics API
    analytics: {
      reports: async () => [],
      dashboards: async () => [],
      report: (id) => ({
        describe: async () => ({}),
        execute: async (opts) => ({}),
      }),
      dashboard: (id) => ({
        describe: async () => ({}),
        components: async () => ({}),
        refresh: async () => ({}),
        status: async () => ({}),
      }),
    },

    instanceUrl: 'https://test.salesforce.com',
  };

  return deepMerge(defaultConn, overrides);
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && typeof source[key] !== 'function') {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
```

**Usage pattern:**
```javascript
import { createMockConnection } from '../helpers/mockConnection.js';

test('query returns records', async () => {
  const conn = createMockConnection({
    query: async (soql) => ({
      totalSize: 2,
      records: [
        { Name: 'Acme' },
        { Name: 'Globex' },
      ],
    }),
  });
  const result = await handleQueryRecords(conn, { objectName: 'Account', fields: ['Name'] });
  assert.equal(result.isError, false);
  assert.ok(result.content[0].text.includes('Acme'));
});
```

**SOQL capture pattern** for verifying query construction:
```javascript
test('query includes WHERE clause', async () => {
  let capturedSoql = '';
  const conn = createMockConnection({
    query: async (soql) => {
      capturedSoql = soql;
      return { totalSize: 0, records: [] };
    },
  });
  await handleQueryRecords(conn, {
    objectName: 'Account',
    fields: ['Name'],
    whereClause: "Industry = 'Tech'",
  });
  assert.ok(capturedSoql.includes("WHERE Industry = 'Tech'"));
});
```

---

## Test Specifications Per Handler

### 1. `test/utils/pagination.test.js`

| # | Test | Assertion |
|---|------|-----------|
| 1 | `applyDefaults` with no params | Returns `{ limit: defaultLimit, offset: 0 }` |
| 2 | `applyDefaults` with explicit values | Returns the explicit values |
| 3 | `formatPaginationFooter` with hasMore=true | Includes "Use offset:" hint |
| 4 | `formatPaginationFooter` with hasMore=false | No "Use offset:" hint |
| 5 | `formatPaginationFooter` with zero results | Returns empty string |

### 2. `test/tools/query.test.js`

| # | Test | Mock Setup | Assertion |
|---|------|-----------|-----------|
| 1 | Basic query success | Return 2 records | `isError: false`, text includes record data |
| 2 | Empty result | Return 0 records, totalSize 0 | `isError: false`, text says "0 of 0" |
| 3 | Default limit applied | Capture SOQL | SOQL includes `LIMIT 200` |
| 4 | Explicit limit + offset | Capture SOQL | SOQL includes `LIMIT 50 OFFSET 10` |
| 5 | Offset > 2000 rejected | — | `isError: true`, mentions 2000 limit |
| 6 | Pagination footer shows next page | totalSize > limit | Text includes "Use offset:" |
| 7 | No pagination footer when all fit | totalSize ≤ limit | No "Use offset:" in text |
| 8 | Relationship field validation — too deep | — | `isError: true`, mentions depth |
| 9 | Subquery format validation | Bad subquery | `isError: true`, mentions parentheses |
| 10 | INVALID_FIELD enhanced error | Mock throws INVALID_FIELD | Enhanced message with suggestions |

### 3. `test/tools/aggregateQuery.test.js`

| # | Test | Assertion |
|---|------|-----------|
| 1 | Basic GROUP BY success | `isError: false`, formatted groups |
| 2 | Missing GROUP BY fields | `isError: true`, lists missing fields |
| 3 | Aggregate in WHERE clause | `isError: true`, suggests HAVING |
| 4 | Invalid ORDER BY field | `isError: true`, must be in GROUP BY |
| 5 | Default limit applied | SOQL includes `LIMIT 200` |
| 6 | Explicit limit honored | SOQL includes `LIMIT 50` |
| 7 | Truncation note when results < total | Text includes truncation note |
| 8 | No truncation note when all returned | No truncation note |
| 9 | HAVING clause included | SOQL includes `HAVING` |
| 10 | Date function in GROUP BY | No validation error |

### 4. `test/tools/search.test.js`

| # | Test | Assertion |
|---|------|-----------|
| 1 | Finds matching objects | `isError: false`, lists matches |
| 2 | No matches | Text says "No Salesforce objects found" |
| 3 | Case-insensitive matching | Matches regardless of case |
| 4 | Multi-word search | All terms must match |
| 5 | Pagination — first page | Footer shows correct range |
| 6 | Pagination — offset beyond total | Returns empty page |

### 5. `test/tools/dml.test.js`

| # | Test | Assertion |
|---|------|-----------|
| 1 | Insert success (single record) | `isError: false`, success count |
| 2 | Insert success (multiple records) | `isError: false`, counts match |
| 3 | Update success | `isError: false` |
| 4 | Delete success | `isError: false` |
| 5 | Upsert success | `isError: false` |
| 6 | Upsert without externalIdField | `isError: true` |
| 7 | Insert with partial failure | Reports success and failure counts |
| 8 | Delete formats record IDs | Extracts IDs from records correctly |
| 9 | API error on insert | `isError: true`, error message |
| 10 | Invalid operation | Falls through to error |
| 11 | Empty records array | Handles gracefully |
| 12 | Bulk results formatting | Errors listed per record |

### 6. `test/tools/readApex.test.js`

| # | Test | Assertion |
|---|------|-----------|
| 1 | Read specific class by name | Returns body in code block |
| 2 | Class not found | `isError: true` |
| 3 | List classes (no pattern) | Pagination footer, class names |
| 4 | List with pattern | SOQL includes LIKE |
| 5 | Wildcard `*` conversion | LIKE uses `%` |
| 6 | Wildcard `?` conversion | LIKE uses `_` |
| 7 | Include metadata | Response includes table headers |
| 8 | Pagination on listing | LIMIT and OFFSET in SOQL |

### 7. `test/tools/readApexTrigger.test.js`

Same structure as readApex — 8 tests.

### 8. `test/tools/writeApex.test.js`

| # | Test | Assertion |
|---|------|-----------|
| 1 | Create new class | tooling.sobject('ApexClass').create called |
| 2 | Update existing class | tooling.sobject('ApexClass').update called |
| 3 | Update — class not found | `isError: true` |
| 4 | Create — class already exists | `isError: true` or updates |
| 5 | API error | `isError: true`, error message |
| 6 | Body name mismatch warning | Response includes warning |

### 9. `test/tools/writeApexTrigger.test.js`

Same structure as writeApex — 6 tests.

### 10. `test/tools/searchAll.test.js`

| # | Test | Assertion |
|---|------|-----------|
| 1 | Basic SOSL construction | FIND, RETURNING in query |
| 2 | Per-object WHERE and LIMIT | Included in RETURNING clause |
| 3 | WITH clauses | Appended to SOSL |
| 4 | Empty results | `isError: false`, no records message |
| 5 | searchIn parameter | IN clause in SOSL |
| 6 | API error | `isError: true` |

### 11. `test/tools/describe.test.js`

| # | Test | Assertion |
|---|------|-----------|
| 1 | Describe standard object | `isError: false`, fields listed |
| 2 | Object not found | `isError: true` |
| 3 | Fields include type and label | Formatted correctly |

### 12. `test/tools/manageObject.test.js`

| # | Test | Assertion |
|---|------|-----------|
| 1 | Create custom object | metadata.create called with correct shape |
| 2 | Update custom object | metadata.update called |
| 3 | Create — missing label | `isError: true` |
| 4 | AutoNumber name field | Format included in metadata |
| 5 | API error | `isError: true` |
| 6 | Sharing model passed through | Metadata includes sharingModel |

### 13. `test/tools/manageField.test.js`

| # | Test | Assertion |
|---|------|-----------|
| 1 | Create text field | metadata.create with correct type |
| 2 | Create picklist field | Values included in metadata |
| 3 | Create lookup field | referenceTo and relationship in metadata |
| 4 | Update field | metadata.update called |
| 5 | Field permissions grant | sobject('FieldPermissions') called |
| 6 | Missing field type on create | `isError: true` |
| 7 | API error | `isError: true` |
| 8 | Custom field name formatting | `__c` suffix handling |

### 14. `test/tools/manageFieldPermissions.test.js`

| # | Test | Assertion |
|---|------|-----------|
| 1 | Grant permissions | FieldPermissions created/updated |
| 2 | Revoke permissions | FieldPermissions deleted |
| 3 | View permissions | Returns current permission state |
| 4 | Profile not found | `isError: true` |
| 5 | Field not found | `isError: true` |
| 6 | Multiple profiles | All profiles processed |
| 7 | API error | `isError: true` |
| 8 | Already granted | Handles idempotently |

### 15. `test/tools/executeAnonymous.test.js`

| # | Test | Assertion |
|---|------|-----------|
| 1 | Compilation + execution success | `isError: false`, success message |
| 2 | Compilation failure | `isError: true`, line/column/error |
| 3 | Execution failure (exception) | `isError: true`, exception message + stack |
| 4 | Log retrieval after execution | Log body included if available |
| 5 | Log retrieval failure | Graceful fallback |
| 6 | API error | `isError: true` |

### 16. `test/tools/manageDebugLogs.test.js`

| # | Test | Assertion |
|---|------|-----------|
| 1 | Enable — creates trace flag | tooling.sobject('TraceFlag').create called |
| 2 | Enable — user not found | `isError: true` |
| 3 | Enable — existing trace flag updated | Updates instead of creates |
| 4 | Disable — deletes trace flags | delete called |
| 5 | Disable — no trace flags exist | Graceful message |
| 6 | Retrieve — lists logs | Logs formatted with metadata |
| 7 | Retrieve — no logs | Message says "No debug logs found" |
| 8 | Retrieve — specific log by ID | Single log returned |
| 9 | Retrieve — with includeBody | Log body in response |
| 10 | Retrieve — pagination offset | SOQL includes OFFSET |
| 11 | Retrieve — pagination footer | Shows total and next offset |
| 12 | API error | `isError: true` |

---

## Implementation Notes

### No External Dependencies

The mock factory and all tests use only:
- `node:test` for test structure (`test`, `describe`, `before`, `after`)
- `node:assert/strict` for assertions
- Plain JavaScript objects for mocks

This keeps the dev dependency footprint at zero for testing.

### SOQL Capture Pattern

Many tests need to verify the SOQL string that was constructed. The pattern:

```javascript
let captured = [];
const conn = createMockConnection({
  query: async (soql, opts) => {
    captured.push(soql);
    return { totalSize: 0, records: [] };
  },
});
```

Then assert on `captured[0]`, `captured[1]`, etc. This verifies both the query construction and the number of queries made.

### Error Simulation Pattern

```javascript
const conn = createMockConnection({
  query: async () => { throw new Error('INVALID_FIELD: No such column foo'); },
});
const result = await handleQueryRecords(conn, args);
assert.equal(result.isError, true);
assert.ok(result.content[0].text.includes('INVALID_FIELD'));
```

### Multi-Method Mock Pattern

For handlers that call multiple conn methods (e.g., `manageDebugLogs` calls `conn.query` for user lookup, then `conn.tooling.query` for trace flags):

```javascript
const conn = createMockConnection({
  query: async (soql) => {
    if (soql.includes('FROM User')) {
      return { totalSize: 1, records: [{ Id: '005xx', Username: 'test@example.com' }] };
    }
    return { totalSize: 0, records: [] };
  },
  tooling: {
    query: async (soql) => {
      if (soql.includes('FROM TraceFlag')) {
        return { totalSize: 0, records: [] };
      }
      return { totalSize: 0, records: [] };
    },
    sobject: (name) => ({
      create: async (record) => ({ id: '07Lxx1', success: true, errors: [] }),
    }),
  },
});
```

---

## File Summary

| File | Type | Description |
|------|------|-------------|
| `test/helpers/mockConnection.js` | New | Shared mock factory for jsforce Connection |
| `test/helpers/spy.js` | New | Lightweight call-tracking spy for verifying method calls |
| `test/tools/query.test.js` | New | 10 tests for query handler |
| `test/tools/aggregateQuery.test.js` | New | 10 tests for aggregate query handler |
| `test/tools/search.test.js` | New | 6 tests for search objects handler |
| `test/tools/describe.test.js` | New | 3 tests for describe handler |
| `test/tools/dml.test.js` | New | 12 tests for DML handler |
| `test/tools/manageObject.test.js` | New | 6 tests for manage object handler |
| `test/tools/manageField.test.js` | New | 8 tests for manage field handler |
| `test/tools/manageFieldPermissions.test.js` | New | 8 tests for field permissions handler |
| `test/tools/searchAll.test.js` | New | 6 tests for SOSL search handler |
| `test/tools/readApex.test.js` | New | 8 tests for read Apex handler |
| `test/tools/writeApex.test.js` | New | 6 tests for write Apex handler |
| `test/tools/readApexTrigger.test.js` | New | 8 tests for read Apex trigger handler |
| `test/tools/writeApexTrigger.test.js` | New | 6 tests for write Apex trigger handler |
| `test/tools/executeAnonymous.test.js` | New | 6 tests for execute anonymous handler |
| `test/tools/manageDebugLogs.test.js` | New | 12 tests for debug logs handler |
| `test/utils/pagination.test.js` | New | 5 tests for pagination utility |
| **Total** | **19 files** | **~117 tests** |

---

## Implementation Order

1. `test/helpers/mockConnection.js` — must exist before any handler test
2. `test/utils/pagination.test.js` — quick win, validates shared utility
3. `test/tools/query.test.js` — highest-value, most complex
4. `test/tools/aggregateQuery.test.js` — complex validation
5. `test/tools/search.test.js` — simple, validates mock pattern
6. `test/tools/dml.test.js` — 4 operations, good coverage
7. `test/tools/readApex.test.js` + `readApexTrigger.test.js` — nearly identical
8. `test/tools/searchAll.test.js` — SOSL construction
9. `test/tools/writeApex.test.js` + `writeApexTrigger.test.js` — nearly identical
10. `test/tools/manageObject.test.js` + `manageField.test.js` — metadata API
11. `test/tools/manageFieldPermissions.test.js` — multi-query flows
12. `test/tools/executeAnonymous.test.js` — tooling API
13. `test/tools/manageDebugLogs.test.js` — most complex, save for last
14. `test/tools/describe.test.js` — simplest, finish clean
