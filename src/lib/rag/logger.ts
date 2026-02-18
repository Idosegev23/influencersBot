/**
 * RAG Pipeline Logger
 * Structured JSON logging with PII redaction.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
  durationMs?: number;
  accountId?: string;
  traceId?: string;
}

const PII_FIELDS = new Set([
  'email', 'phone', 'password', 'token', 'api_key', 'apiKey',
  'customer_name', 'customer_phone', 'brand_contact_email',
  'brand_contact_phone', 'auth_user_id',
]);

function redactValue(key: string, value: unknown): unknown {
  if (PII_FIELDS.has(key) && typeof value === 'string') {
    return value.length > 4
      ? value.substring(0, 2) + '***' + value.substring(value.length - 2)
      : '***';
  }
  return value;
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactObject(value as Record<string, unknown>);
    } else {
      result[key] = redactValue(key, value);
    }
  }
  return result;
}

function formatLog(entry: LogEntry): string {
  const safeData = entry.data ? redactObject(entry.data) : undefined;
  const log = {
    ...entry,
    data: safeData,
  };
  return JSON.stringify(log);
}

export function createLogger(module: string, traceId?: string) {
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>, accountId?: string) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module: `rag:${module}`,
      message,
      data,
      accountId,
      traceId,
    };

    const formatted = formatLog(entry);

    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'debug':
        if (process.env.RAG_DEBUG === 'true') {
          console.log(formatted);
        }
        break;
      default:
        console.log(formatted);
    }
  };

  return {
    debug: (msg: string, data?: Record<string, unknown>, accountId?: string) =>
      log('debug', msg, data, accountId),
    info: (msg: string, data?: Record<string, unknown>, accountId?: string) =>
      log('info', msg, data, accountId),
    warn: (msg: string, data?: Record<string, unknown>, accountId?: string) =>
      log('warn', msg, data, accountId),
    error: (msg: string, data?: Record<string, unknown>, accountId?: string) =>
      log('error', msg, data, accountId),
    timed: async <T>(label: string, fn: () => Promise<T>, data?: Record<string, unknown>): Promise<{ result: T; durationMs: number }> => {
      const start = Date.now();
      try {
        const result = await fn();
        const durationMs = Date.now() - start;
        log('info', `${label} completed`, { ...data, durationMs });
        return { result, durationMs };
      } catch (err) {
        const durationMs = Date.now() - start;
        log('error', `${label} failed`, {
          ...data,
          durationMs,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
  };
}
