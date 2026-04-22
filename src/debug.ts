export type DebugEntry = {
  at: string;
  scope: string;
  message: string;
  data?: unknown;
};

type DebugListener = (entry: DebugEntry) => void;

const listeners = new Set<DebugListener>();

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
  const normalized =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : error;

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
