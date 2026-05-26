export type DebugEntry = {
  at: string;
  scope: string;
  message: string;
  data?: unknown;
};

type DebugListener = (entry: DebugEntry) => void;

const listeners = new Set<DebugListener>();

function formatError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...Object.fromEntries(Object.entries(error)),
    };
  }

  return error;
}

function emit(entry: DebugEntry): void {
  for (const listener of listeners) {
    listener(entry);
  }
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

  emit(entry);
}

export function debugError(scope: string, message: string, error: unknown): void {
  const entry: DebugEntry = {
    at: timestamp(),
    scope,
    message,
    data: formatError(error),
  };

  emit(entry);
}

export function subscribeDebugLogs(listener: DebugListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
