/**
 * Lightweight guard for the one place SQL identifiers (not values) come from
 * request input: dynamic ORDER BY columns. Every bound value must still go
 * through prepared statement parameters; this only protects identifiers that
 * can't be parameterised by SQLite.
 */
export function assertSafeIdentifier(value: string, allowed: readonly string[]): string {
  if (!allowed.includes(value)) {
    throw new Error(`Unsafe or unknown identifier: "${value}"`);
  }
  return value;
}
