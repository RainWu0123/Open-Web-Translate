/**
 * Shared Logger Module
 *
 * In production builds, only warn and error are logged to minimize console overhead.
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// In production, only log warn+ to avoid unnecessary console output and regex sanitization
const MIN_LEVEL: LogLevel = import.meta.env.DEV ? 'debug' : 'warn';

class Logger {
  constructor(private moduleName: string) {}

  private log(level: LogLevel, message: string, data?: any) {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[MIN_LEVEL]) {
      return;
    }

    const prefix = `[${this.moduleName}]`;

    switch (level) {
      case 'debug':
        console.debug(prefix, message, data ?? '');
        break;
      case 'info':
        console.info(prefix, message, data ?? '');
        break;
      case 'warn':
        console.warn(prefix, message, data ?? '');
        break;
      case 'error':
        console.error(prefix, message, data ?? '');
        break;
    }
  }

  debug(message: string, data?: any) { this.log('debug', message, data); }
  info(message: string, data?: any) { this.log('info', message, data); }
  warn(message: string, data?: any) { this.log('warn', message, data); }
  error(message: string, data?: any) { this.log('error', message, data); }
}

export const createLogger = (moduleName: string) => new Logger(moduleName);
