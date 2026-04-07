/**
 * SOQL/SOSL escaping and identifier validation utilities.
 *
 * Salesforce uses doubled single quotes for string escaping in SOQL ('' not \').
 * SOSL has its own reserved characters that need backslash-escaping inside FIND {}.
 */

/**
 * Escapes a string value for safe use inside a SOQL string literal.
 * SOQL escapes single quotes by doubling them: ' -> ''
 */
export function escapeSoqlValue(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Escapes a search term for safe use inside SOSL FIND { ... } clause.
 * SOSL reserved characters need backslash-escaping.
 */
export function escapeSoslSearchTerm(value: string): string {
  return value.replace(/[\\?&|!{}[\]()^~*:"'+\-]/g, '\\$&');
}

/**
 * Validates a single Salesforce identifier (object name, field name, class name, etc.).
 * Accepts: Account, My_Object__c, ns__Field__r, Custom__e
 */
export function validateIdentifier(name: string): { valid: boolean; error?: string } {
  // Allow standard Salesforce identifier pattern with optional namespace prefix and suffix
  const pattern = /^[a-zA-Z][a-zA-Z0-9_]{0,39}(__[a-z])?$/;
  if (!pattern.test(name)) {
    return {
      valid: false,
      error: `Invalid identifier "${name}". Salesforce identifiers must start with a letter, contain only letters/numbers/underscores, and be at most 40 characters.`
    };
  }
  return { valid: true };
}

/**
 * Validates a dotted field path like "Account.Name" or "Custom__r.Field__c".
 * Each segment must be a valid identifier.
 */
export function validateFieldPath(path: string): { valid: boolean; error?: string } {
  const segments = path.split('.');
  for (const segment of segments) {
    const result = validateIdentifier(segment);
    if (!result.valid) {
      return { valid: false, error: `Invalid field path "${path}": ${result.error}` };
    }
  }
  return { valid: true };
}

/**
 * Escapes regex metacharacters in a string for safe use in new RegExp().
 */
export function escapeRegExpInput(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Converts a user-facing wildcard pattern to a SOQL LIKE pattern.
 * Escapes existing LIKE metacharacters (% and _) before converting wildcards.
 *
 * @param pattern - User input with * (any chars) and ? (single char) wildcards
 * @returns SOQL LIKE-compatible pattern
 */
export function wildcardToLikePattern(pattern: string): string {
  // First escape existing LIKE metacharacters
  let escaped = pattern.replace(/%/g, '\\%').replace(/_/g, '\\_');

  if (!pattern.includes('*') && !pattern.includes('?')) {
    // No wildcards — wrap with % for substring match
    return `%${escaped}%`;
  }

  // Convert user wildcards to LIKE wildcards
  escaped = escaped.replace(/\*/g, '%').replace(/\?/g, '_');
  return escaped;
}
