type LogLevel = "debug" | "info" | "warn" | "error";
type LogWriter = (message: string, data?: unknown) => void;

const REDACTED = "[REDACTED]";
const SENSITIVE_KEYS = /(?:authorization|api[-_]?token|credentials?|cloudflareApiToken)/i;

export function sanitizeForLog(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item, seen));

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEYS.test(key) ? REDACTED : sanitizeForLog(item, seen)
    ])
  );
}

export type Logger = Record<LogLevel, LogWriter>;

export function createLogger(scope: string, sink: Partial<Logger> = console): Logger {
  const write = (level: LogLevel): LogWriter => (message, data) => {
    const output = `[${scope}] ${message}`;
    const writer = sink[level] ?? sink.info ?? (() => undefined);
    if (data === undefined) writer(output);
    else writer(output, sanitizeForLog(data));
  };

  return {
    debug: write("debug"),
    info: write("info"),
    warn: write("warn"),
    error: write("error")
  };
}
