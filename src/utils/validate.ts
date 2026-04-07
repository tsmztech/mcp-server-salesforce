/**
 * Runtime type assertion helpers for MCP tool argument validation.
 * Replaces unsafe TypeScript `as` casts with actual runtime checks.
 */

export function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${name} must be a string, got ${typeof value}`);
  }
  return value;
}

export function assertOptionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return assertString(value, name);
}

export function assertNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error(`${name} must be a number, got ${typeof value}`);
  }
  return value;
}

export function assertOptionalNumber(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return assertNumber(value, name);
}

export function assertBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${name} must be a boolean, got ${typeof value}`);
  }
  return value;
}

export function assertOptionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  return assertBoolean(value, name);
}

export function assertStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array, got ${typeof value}`);
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') {
      throw new Error(`${name}[${i}] must be a string, got ${typeof value[i]}`);
    }
  }
  return value as string[];
}

export function assertEnum<T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[]
): T {
  const str = assertString(value, name);
  if (!allowed.includes(str as T)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}. Got "${str}"`);
  }
  return str as T;
}

export function assertOptionalEnum<T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[]
): T | undefined {
  if (value === undefined || value === null) return undefined;
  return assertEnum(value, name, allowed);
}
