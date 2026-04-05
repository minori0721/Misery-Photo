type PathValidationOptions = {
  allowEmpty?: boolean;
  maxLength?: number;
  mustEndWithSlash?: boolean;
};

export function isValidStoragePath(value: unknown, options?: PathValidationOptions): value is string {
  const allowEmpty = options?.allowEmpty ?? false;
  const maxLength = options?.maxLength ?? 1024;
  const mustEndWithSlash = options?.mustEndWithSlash ?? false;

  if (typeof value !== 'string') return false;
  if (!allowEmpty && value.length === 0) return false;
  if (value.length > maxLength) return false;
  if (mustEndWithSlash && value.length > 0 && !value.endsWith('/')) return false;
  if (value.startsWith('/')) return false;
  if (value.includes('\\')) return false;
  if (value.includes('..')) return false;
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  return true;
}

export function toFolderPath(path: string): string {
  if (!path) return '';
  return path.endsWith('/') ? path : `${path}/`;
}

export function getPathBaseName(path: string): string {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
  const parts = trimmed.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

export function uniqStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
