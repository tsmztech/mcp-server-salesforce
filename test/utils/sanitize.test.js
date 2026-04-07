import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeSoqlValue,
  escapeSoslSearchTerm,
  validateIdentifier,
  validateFieldPath,
  escapeRegExpInput,
  wildcardToLikePattern,
} from '../../dist/utils/sanitize.js';

// escapeSoqlValue
test('escapeSoqlValue — doubles single quotes', () => {
  assert.equal(escapeSoqlValue("O'Brien"), "O''Brien");
});

test('escapeSoqlValue — no change for clean strings', () => {
  assert.equal(escapeSoqlValue('hello'), 'hello');
});

test('escapeSoqlValue — multiple quotes', () => {
  assert.equal(escapeSoqlValue("it's a test's case"), "it''s a test''s case");
});

test('escapeSoqlValue — injection attempt has quotes doubled', () => {
  const malicious = "x' OR Id != null OR Name = 'x";
  const escaped = escapeSoqlValue(malicious);
  // All single quotes are doubled — SOQL parser treats '' as a literal quote, not a string terminator
  assert.equal(escaped, "x'' OR Id != null OR Name = ''x");
});

// escapeSoslSearchTerm
test('escapeSoslSearchTerm — escapes reserved characters', () => {
  const result = escapeSoslSearchTerm('test & value');
  assert.ok(result.includes('\\&'));
});

test('escapeSoslSearchTerm — escapes injection attempt', () => {
  const malicious = 'test} IN ALL FIELDS RETURNING Account(Name)';
  const result = escapeSoslSearchTerm(malicious);
  assert.ok(result.includes('\\}'));
});

// validateIdentifier
test('validateIdentifier — valid standard object', () => {
  assert.ok(validateIdentifier('Account').valid);
});

test('validateIdentifier — valid custom object', () => {
  assert.ok(validateIdentifier('My_Object__c').valid);
});

test('validateIdentifier — valid custom relationship', () => {
  assert.ok(validateIdentifier('Custom__r').valid);
});

test('validateIdentifier — valid namespace prefix', () => {
  assert.ok(validateIdentifier('ns__Field__c').valid);
});

test('validateIdentifier — rejects SOQL injection', () => {
  const result = validateIdentifier("Account; DELETE FROM Account");
  assert.equal(result.valid, false);
});

test('validateIdentifier — rejects empty string', () => {
  assert.equal(validateIdentifier('').valid, false);
});

test('validateIdentifier — rejects starting with number', () => {
  assert.equal(validateIdentifier('123Account').valid, false);
});

test('validateIdentifier — rejects special characters', () => {
  assert.equal(validateIdentifier("Account'--").valid, false);
});

// validateFieldPath
test('validateFieldPath — valid dotted path', () => {
  assert.ok(validateFieldPath('Account.Name').valid);
});

test('validateFieldPath — valid multi-level path', () => {
  assert.ok(validateFieldPath('Account.Owner.Name').valid);
});

test('validateFieldPath — rejects injection in path', () => {
  assert.equal(validateFieldPath("Account.Name' OR '1'='1").valid, false);
});

// escapeRegExpInput
test('escapeRegExpInput — escapes regex metacharacters', () => {
  const result = escapeRegExpInput('Test.*Class');
  assert.equal(result, 'Test\\.\\*Class');
});

test('escapeRegExpInput — prevents ReDoS', () => {
  const result = escapeRegExpInput('(((((');
  assert.equal(result, '\\(\\(\\(\\(\\(');
});

// wildcardToLikePattern
test('wildcardToLikePattern — no wildcards wraps with %', () => {
  assert.equal(wildcardToLikePattern('Controller'), '%Controller%');
});

test('wildcardToLikePattern — * converts to %', () => {
  assert.equal(wildcardToLikePattern('Account*'), 'Account%');
});

test('wildcardToLikePattern — ? converts to _', () => {
  assert.equal(wildcardToLikePattern('Test?'), 'Test_');
});

test('wildcardToLikePattern — escapes existing % in input', () => {
  const result = wildcardToLikePattern('100%');
  assert.ok(result.includes('\\%'));
});

test('wildcardToLikePattern — escapes existing _ in input', () => {
  const result = wildcardToLikePattern('my_class');
  assert.ok(result.includes('\\_'));
});
