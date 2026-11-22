/**
 * Resolves an image link written in a note to a path inside the vault.
 * Returns null for web addresses and for links that would leave the vault.
 */
export function resolveImagePath(notePath: string, link: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('/')) return null;

  let decoded: string;
  try {
    decoded = decodeURI(link);
  } catch {
    return null;
  }

  const parts = notePath.split('/').slice(0, -1);
  for (const part of decoded.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.length === 0 ? null : parts.join('/');
}
