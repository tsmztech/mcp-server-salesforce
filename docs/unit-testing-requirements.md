# Requirements: Unit Testing Across All Tool Handlers

## Overview

Add unit tests for all 15 tool handlers in the MCP server. Currently the only tests are repo guardrails (package.json validation, file existence checks). Zero handler logic is tested.

## Motivation

1. **No regression safety net** — Changes to handler logic (like the pagination PR) have no automated way to verify they don't break existing behavior.
2. **Validation logic is untested** — Several handlers have complex validation (relationship field depth in `query.ts`, GROUP BY field matching in `aggregateQuery.ts`, wildcard-to-LIKE conversion in `readApex.ts`) that could silently break.
3. **Error paths are untested** — Every handler has enhanced error messages for Salesforce-specific errors (INVALID_FIELD, MALFORMED_QUERY, etc.) that are only verified manually.
4. **Confidence for contributors** — The repo accepts dependabot PRs and external contributions. Tests let maintainers merge with confidence.

## Scope

### In Scope
- Unit tests for all 15 tool handler functions (the `handle*` exports)
- Validation helper functions (e.g., `validateRelationshipFields`, `validateGroupByFields`, `wildcardToLikePattern`)
- Shared pagination utility (`src/utils/pagination.ts`)
- A shared mock connection factory for use across all test files

### Out of Scope
- Integration tests against a live Salesforce org (covered by manual testing)
- Tests for `createSalesforceConnection()` (requires real credentials/CLI)
- Tests for the MCP server framework itself (`Server`, `StdioServerTransport`)
- End-to-end tests for `index.ts` request routing (the switch statement is straightforward arg-casting)

## Functional Requirements

### FR-1: Mock connection factory

A shared helper that creates a mock `conn` object with all methods any handler might call. Each method returns a sensible default (empty results, success responses). Individual tests override specific methods to control behavior.

### FR-2: Test categories per handler

Each handler's test file covers:

1. **Happy path** — Valid input produces correct output with `isError: false`. Verify the response text contains expected data.
2. **Empty results** — Query/search returns zero records. Verify graceful message, `isError: false`.
3. **Validation errors** — Invalid arguments caught before the API call. Verify `isError: true` with a helpful message.
4. **API errors** — Simulated Salesforce errors (mock throws). Verify `isError: true` with enhanced error message.
5. **Edge cases** — Null field values, single vs. multiple records, boundary conditions.

### FR-3: Pagination tests

For each paginated tool, verify:
- Default limit is applied when none specified
- Explicit limit/offset are honored
- Pagination footer appears with correct numbers
- "next page" hint appears when `hasMore` is true
- No footer when result set fits in one page

### FR-4: Validation logic tests

Dedicated tests for validation helpers:
- `query.ts`: `validateRelationshipFields` — dot notation, depth > 5, subquery format
- `aggregateQuery.ts`: `validateGroupByFields`, `validateWhereClause`, `validateOrderBy`
- `readApex.ts` / `readApexTrigger.ts`: `wildcardToLikePattern` — no wildcards, `*`, `?`
- `pagination.ts`: `formatPaginationFooter`, `applyDefaults`

### FR-5: SOQL/SOSL construction tests

For handlers that build queries, verify the generated SOQL/SOSL string includes the expected clauses:
- `query.ts`: SELECT, FROM, WHERE, ORDER BY, LIMIT, OFFSET
- `aggregateQuery.ts`: GROUP BY, HAVING
- `searchAll.ts`: FIND, RETURNING, WITH clauses
- `readApex.ts`: LIKE pattern from wildcard conversion

Capture the SOQL by having the mock `conn.query()` record the argument it receives.

## Non-Functional Requirements

- **NFR-1**: Use Node.js built-in test runner (`node:test`) and assertion library (`node:assert/strict`) — no external test framework.
- **NFR-2**: No external mocking library — mock `conn` with plain objects. All handlers accept `conn: any`, making this trivial.
- **NFR-3**: Tests import from `dist/` (compiled JS), matching the existing test convention.
- **NFR-4**: Tests must pass without a Salesforce connection — all API calls are mocked.
- **NFR-5**: Update `npm test` script if needed to discover tests in subdirectories.
- **NFR-6**: Each test file is independent — no shared state between test files, no required execution order.

## Handler Test Matrix

| Handler | File | Happy Path | Empty | Validation | API Error | Pagination | Est. Tests |
|---------|------|:---:|:---:|:---:|:---:|:---:|:---:|
| `handleSearchObjects` | search.ts | ✓ | ✓ | — | — | ✓ | 5 |
| `handleDescribeObject` | describe.ts | ✓ | — | — | ✓ | — | 3 |
| `handleQueryRecords` | query.ts | ✓ | ✓ | ✓ | ✓ | ✓ | 10 |
| `handleAggregateQuery` | aggregateQuery.ts | ✓ | ✓ | ✓ | ✓ | — | 10 |
| `handleDMLRecords` | dml.ts | ✓ | — | ✓ | ✓ | — | 12 |
| `handleManageObject` | manageObject.ts | ✓ | — | ✓ | ✓ | — | 6 |
| `handleManageField` | manageField.ts | ✓ | — | ✓ | ✓ | — | 8 |
| `handleManageFieldPermissions` | manageFieldPermissions.ts | ✓ | — | ✓ | ✓ | — | 8 |
| `handleSearchAll` | searchAll.ts | ✓ | ✓ | — | ✓ | — | 6 |
| `handleReadApex` | readApex.ts | ✓ | ✓ | — | ✓ | ✓ | 7 |
| `handleWriteApex` | writeApex.ts | ✓ | — | ✓ | ✓ | — | 6 |
| `handleReadApexTrigger` | readApexTrigger.ts | ✓ | ✓ | — | ✓ | ✓ | 7 |
| `handleWriteApexTrigger` | writeApexTrigger.ts | ✓ | — | ✓ | ✓ | — | 6 |
| `handleExecuteAnonymous` | executeAnonymous.ts | ✓ | — | — | ✓ | — | 6 |
| `handleManageDebugLogs` | manageDebugLogs.ts | ✓ | ✓ | ✓ | ✓ | ✓ | 12 |
| Pagination utility | pagination.ts | ✓ | ✓ | — | — | — | 5 |
| **Total** | | | | | | | **~117** |

## Implementation Order

Prioritize by impact and complexity:

1. **Mock factory + pagination utility tests** — Foundation for everything else
2. **query.ts** — Most-used tool, most complex (relationships, pagination, COUNT fallback)
3. **aggregateQuery.ts** — Complex validation logic
4. **search.ts** — Simple, good warmup for the pattern
5. **dml.ts** — 4 operations × success/failure
6. **readApex.ts + readApexTrigger.ts** — Nearly identical, do together
7. **searchAll.ts** — SOSL construction
8. **writeApex.ts + writeApexTrigger.ts** — Nearly identical, do together
9. **manageObject.ts + manageField.ts** — Metadata API mocking
10. **manageFieldPermissions.ts** — Complex multi-query flows
11. **executeAnonymous.ts** — Tooling API mocking
12. **manageDebugLogs.ts** — Most complex handler, 3 operations, tooling API
13. **describe.ts** — Simple, save for last
