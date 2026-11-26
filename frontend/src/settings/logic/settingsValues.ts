/** The same rule Rust checks: letters, digits, spaces and hyphens, at most 64 characters. */
export function isFontName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 64 && /^[\p{L}\p{N} -]+$/u.test(trimmed);
}

/** True when two settings groups hold the same values, so "Reset to Default" has nothing to do. */
export function sameValues<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[];
  return keys.every((key) => a[key] === b[key]);
}
