/**
 * SOQL Sanitization Utility
 * Provides secure methods for constructing SOQL queries to prevent injection attacks
 */

/**
 * Escapes a string value for safe use in SOQL queries
 * @param value The string value to escape
 * @returns Escaped string safe for SOQL
 */
export function escapeSoqlString(value: string): string {
  if (typeof value !== 'string') {
    throw new Error('Value must be a string');
  }
  
  // Escape single quotes by doubling them
  // Remove any potential escape sequences that could break out of string literals
  return value
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/'/g, "\\'")     // Escape single quotes
    .replace(/\n/g, '\\n')    // Escape newlines
    .replace(/\r/g, '\\r')    // Escape carriage returns
    .replace(/\t/g, '\\t');   // Escape tabs
}

/**
 * Validates and sanitizes a field name to prevent injection
 * @param fieldName The field name to validate
 * @returns Validated field name
 * @throws Error if field name is invalid
 */
export function validateFieldName(fieldName: string): string {
  // Allow alphanumeric, underscore, dot (for relationships), and parentheses (for subqueries)
  // Also allow common aggregate functions
  const aggregateFunctions = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COUNT_DISTINCT'];
  const dateTimeFunctions = ['CALENDAR_YEAR', 'CALENDAR_MONTH', 'CALENDAR_QUARTER', 'FISCAL_YEAR', 'FISCAL_QUARTER'];
  
  // Check if it's an aggregate or date function
  const upperField = fieldName.toUpperCase();
  for (const func of [...aggregateFunctions, ...dateTimeFunctions]) {
    if (upperField.includes(`${func}(`)) {
      // Validate the function call structure
      const functionPattern = new RegExp(`^${func}\\([\\w\\.]+\\)(\\s+\\w+)?$`, 'i');
      if (!functionPattern.test(fieldName.trim())) {
        throw new Error(`Invalid ${func} function syntax: ${fieldName}`);
      }
      return fieldName;
    }
  }
  
  // Check for subqueries (SELECT ... FROM ...)
  if (fieldName.trim().startsWith('(') && fieldName.trim().endsWith(')')) {
    // Basic validation - more complex validation would be needed for full subquery support
    if (!fieldName.includes('SELECT') || !fieldName.includes('FROM')) {
      throw new Error(`Invalid subquery syntax: ${fieldName}`);
    }
    // For subqueries, we'll allow them but recommend using the relationship query pattern instead
    return fieldName;
  }
  
  // Regular field name validation
  const fieldNamePattern = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*(__c|__r)?$/;
  if (!fieldNamePattern.test(fieldName)) {
    throw new Error(`Invalid field name: ${fieldName}. Field names must contain only alphanumeric characters, underscores, and dots for relationships.`);
  }
  
  return fieldName;
}

/**
 * Validates and sanitizes an object name to prevent injection
 * @param objectName The object name to validate
 * @returns Validated object name
 * @throws Error if object name is invalid
 */
export function validateObjectName(objectName: string): string {
  // Object names can only contain alphanumeric characters and underscores
  // Custom objects end with __c
  const objectNamePattern = /^[a-zA-Z_][a-zA-Z0-9_]*(__c)?$/;
  
  if (!objectNamePattern.test(objectName)) {
    throw new Error(`Invalid object name: ${objectName}. Object names must contain only alphanumeric characters and underscores.`);
  }
  
  return objectName;
}

/**
 * Safely constructs a WHERE clause from parameters
 * @param conditions Array of condition objects
 * @returns Safe WHERE clause string
 */
export function buildSafeWhereClause(conditions: Array<{field: string, operator: string, value: any}>): string {
  const validOperators = ['=', '!=', '<>', '<', '>', '<=', '>=', 'LIKE', 'IN', 'NOT IN', 'INCLUDES', 'EXCLUDES'];
  
  const safeClauses = conditions.map(condition => {
    // Validate field name
    const safeField = validateFieldName(condition.field);
    
    // Validate operator
    if (!validOperators.includes(condition.operator.toUpperCase())) {
      throw new Error(`Invalid operator: ${condition.operator}`);
    }
    
    // Handle different value types
    let safeValue: string;
    if (condition.value === null) {
      safeValue = 'NULL';
    } else if (condition.value === undefined) {
      throw new Error('Undefined values are not allowed in WHERE clauses');
    } else if (typeof condition.value === 'string') {
      safeValue = `'${escapeSoqlString(condition.value)}'`;
    } else if (typeof condition.value === 'number') {
      safeValue = String(condition.value);
    } else if (typeof condition.value === 'boolean') {
      safeValue = condition.value ? 'TRUE' : 'FALSE';
    } else if (Array.isArray(condition.value)) {
      // For IN and NOT IN operators
      if (!['IN', 'NOT IN', 'INCLUDES', 'EXCLUDES'].includes(condition.operator.toUpperCase())) {
        throw new Error('Array values can only be used with IN, NOT IN, INCLUDES, or EXCLUDES operators');
      }
      safeValue = '(' + condition.value.map(v => {
        if (typeof v === 'string') {
          return `'${escapeSoqlString(v)}'`;
        } else if (typeof v === 'number') {
          return String(v);
        } else {
          throw new Error('Array values must be strings or numbers');
        }
      }).join(', ') + ')';
    } else if (condition.value instanceof Date) {
      // Format date for SOQL
      safeValue = condition.value.toISOString();
    } else {
      throw new Error(`Unsupported value type: ${typeof condition.value}`);
    }
    
    return `${safeField} ${condition.operator.toUpperCase()} ${safeValue}`;
  });
  
  return safeClauses.join(' AND ');
}

/**
 * Validates ORDER BY clause components
 * @param orderByFields Array of field names to order by
 * @param allowedFields Optional array of allowed field names
 * @returns Safe ORDER BY clause
 */
export function buildSafeOrderBy(orderByFields: Array<{field: string, direction?: 'ASC' | 'DESC'}>, allowedFields?: string[]): string {
  return orderByFields.map(orderBy => {
    const safeField = validateFieldName(orderBy.field);
    
    // If allowedFields is provided, check against it
    if (allowedFields && !allowedFields.some(f => f === safeField || f.startsWith(safeField + ' '))) {
      throw new Error(`Field ${orderBy.field} is not allowed in ORDER BY clause`);
    }
    
    const direction = orderBy.direction || 'ASC';
    if (!['ASC', 'DESC'].includes(direction)) {
      throw new Error('ORDER BY direction must be ASC or DESC');
    }
    
    return `${safeField} ${direction}`;
  }).join(', ');
}

/**
 * Validates and sanitizes a LIMIT value
 * @param limit The limit value
 * @returns Safe limit value
 */
export function validateLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('LIMIT must be a positive integer');
  }
  
  // Salesforce has a maximum limit of 50000 for most queries
  if (limit > 50000) {
    throw new Error('LIMIT cannot exceed 50000');
  }
  
  return limit;
}

/**
 * Builds a safe SOQL query using parameterized approach
 */
export function buildSafeQuery(params: {
  object: string;
  fields: string[];
  where?: Array<{field: string, operator: string, value: any}>;
  orderBy?: Array<{field: string, direction?: 'ASC' | 'DESC'}>;
  limit?: number;
}): string {
  // Validate object name
  const safeObject = validateObjectName(params.object);
  
  // Validate field names
  const safeFields = params.fields.map(f => validateFieldName(f));
  
  // Build query parts
  let query = `SELECT ${safeFields.join(', ')} FROM ${safeObject}`;
  
  // Add WHERE clause if conditions exist
  if (params.where && params.where.length > 0) {
    query += ` WHERE ${buildSafeWhereClause(params.where)}`;
  }
  
  // Add ORDER BY clause if specified
  if (params.orderBy && params.orderBy.length > 0) {
    query += ` ORDER BY ${buildSafeOrderBy(params.orderBy)}`;
  }
  
  // Add LIMIT if specified
  if (params.limit !== undefined) {
    query += ` LIMIT ${validateLimit(params.limit)}`;
  }
  
  return query;
}

/**
 * Sanitizes user-provided WHERE clause string (less secure, use with caution)
 * This should only be used when buildSafeWhereClause cannot meet requirements
 */
export function sanitizeWhereClause(whereClause: string): string {
  if (!whereClause || whereClause.trim() === '') {
    return '';
  }
  
  // Check for common SQL injection patterns
  const dangerousPatterns = [
    /(\b(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(;|--|\*|\/\*|\*\/|xp_|sp_)/gi,
    /(\bOR\b\s+\d+\s*=\s*\d+)/gi,  // OR 1=1 pattern
    /(\bAND\b\s+\d+\s*=\s*\d+)/gi  // AND 1=1 pattern
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(whereClause)) {
      throw new Error('Potentially dangerous SQL pattern detected in WHERE clause');
    }
  }
  
  // Additional validation could be added here
  return whereClause;
}

/**
 * Maximum input length constraints
 */
export const MAX_FIELD_LENGTH = 255;
export const MAX_QUERY_LENGTH = 10000;
export const MAX_WHERE_LENGTH = 5000;

/**
 * Validates input length to prevent DoS
 */
export function validateInputLength(input: string, maxLength: number, fieldName: string): void {
  if (input.length > maxLength) {
    throw new Error(`${fieldName} exceeds maximum length of ${maxLength} characters`);
  }
}