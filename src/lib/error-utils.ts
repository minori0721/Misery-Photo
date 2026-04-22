export type ErrorWithMeta = Error & {
  code?: string;
  name?: string;
  message?: string;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (isRecord(error) && typeof error.message === 'string' && error.message) {
    return error.message;
  }
  return fallback;
}

export function getErrorCode(error: unknown): string | undefined {
  if (isRecord(error) && typeof error.code === 'string') {
    return error.code;
  }
  return undefined;
}

export function getErrorName(error: unknown): string | undefined {
  if (error instanceof Error && error.name) return error.name;
  if (isRecord(error) && typeof error.name === 'string') {
    return error.name;
  }
  return undefined;
}
