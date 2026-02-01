/**
 * Dot-path utilities for nested JSON access.
 */

export function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = obj;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function setByPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const result = structuredClone(obj);
  const segments = path.split('.');
  let current: Record<string, unknown> = result;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (
      current[segment] === null ||
      current[segment] === undefined ||
      typeof current[segment] !== 'object'
    ) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  const lastSegment = segments[segments.length - 1];
  current[lastSegment] = value;
  return result;
}

export function hasPath(obj: Record<string, unknown>, path: string): boolean {
  return getByPath(obj, path) !== undefined;
}
