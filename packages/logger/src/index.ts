export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface LoggerOptions {
  service: string;
  minLevel?: LogLevel;
}

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export function createLogger(options: LoggerOptions): Logger {
  const minLevel = options.minLevel ?? "info";

  function write(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
    if (levelPriority[level] < levelPriority[minLevel]) {
      return;
    }

    const payload = {
      level,
      service: options.service,
      message,
      timestamp: new Date().toISOString(),
      ...meta
    };

    const serialized = JSON.stringify(payload, (_key, value: unknown) => {
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack
        };
      }

      return value;
    });

    if (level === "error") {
      console.error(serialized);
      return;
    }

    console.log(serialized);
  }

  return {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta)
  };
}
