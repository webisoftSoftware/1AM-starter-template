export type DebugEntry = {
  at: string;
  scope: string;
  message: string;
  data?: unknown;
};

type DebugListener = (entry: DebugEntry) => void;

const listeners = new Set<DebugListener>();

function normalizeErrorLike(value: unknown, depth = 0): unknown {
  if (depth > 3) {
    return '[Max depth reached]';
  }

  if (value instanceof Error) {
    const withExtras: Record<string, unknown> = {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };

    if ('cause' in value) {
      withExtras.cause = normalizeErrorLike((value as Error & { cause?: unknown }).cause, depth + 1);
    }

    for (const [key, entryValue] of Object.entries(value)) {
      withExtras[key] = normalizeErrorLike(entryValue, depth + 1);
    }

    return withExtras;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeErrorLike(entry, depth + 1));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, normalizeErrorLike(entryValue, depth + 1)]),
    );
  }

  return value;
}

function timestamp(): string {
  return new Date().toISOString();
}

export function debugLog(scope: string, message: string, data?: unknown): void {
  const entry: DebugEntry = {
    at: timestamp(),
    scope,
    message,
    data,
  };

  console.log(`[debug:${scope}] ${message}`, data ?? '');
  for (const listener of listeners) {
    listener(entry);
  }
}

export function debugError(scope: string, message: string, error: unknown): void {
  const normalized = normalizeErrorLike(error);

  const entry: DebugEntry = {
    at: timestamp(),
    scope,
    message,
    data: normalized,
  };

  console.error(`[debug:${scope}] ${message}`, error);
  for (const listener of listeners) {
    listener(entry);
  }
}

export function subscribeDebugLogs(listener: DebugListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
