import { createHash } from 'node:crypto';

/**
 * Returns a shallow copy of `obj` with each named field replaced by '[REDACTED]'.
 * The input object is never mutated.
 * @param obj Object to redact
 * @param fields Field names whose values must not be logged
 */
export function redactSensitiveFields(
  obj: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const copy = { ...obj };
  for (const field of fields) {
    if (field in copy) {
      copy[field] = '[REDACTED]';
    }
  }
  return copy;
}

/**
 * Returns a short, non-reversible fingerprint of `value` so two different
 * secrets are distinguishable in a log without either being recoverable.
 * The digest is deliberately truncated to 12 hex characters: a full digest of
 * a token with bounded entropy and known structure is worth brute forcing,
 * and 12 characters are ample to tell two tokens apart. Not configurable.
 * @param value Secret to fingerprint
 */
export function fingerprint(value: string): string {
  return 'sha256:' + createHash('sha256').update(value).digest('hex').slice(0, 12);
}
