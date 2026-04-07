/**
 * Secure audit logging utilities.
 */

/**
 * Logs an Apex code execution for audit purposes.
 * Logs to stderr (stdout is reserved for MCP JSON-RPC).
 */
export function logApexExecution(code: string): void {
  const preview = code.length > 200 ? code.substring(0, 200) + '...' : code;
  console.error(`[AUDIT] Execute Anonymous Apex — ${code.length} chars — Preview: ${preview.replace(/\n/g, ' ')}`);
}

/**
 * Returns a shallow copy of an object with specified fields replaced by "[REDACTED]".
 */
export function redactSensitiveFields(
  obj: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const result = { ...obj };
  for (const field of fields) {
    if (field in result) {
      result[field] = '[REDACTED]';
    }
  }
  return result;
}
