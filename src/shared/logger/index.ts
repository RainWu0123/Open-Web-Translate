/**
 * Shared Logger Module
 *
 * Supports variadic arguments: ...args: any[]
 * In production builds, only warn and error are logged to minimize console overhead.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * F12 escape hatch: setting localStorage['owt-debug'] = '1' forces debug
 * logging even in production builds, for on-site incident diagnosis.
 * Read once; guarded because some contexts (sandboxed iframes) throw.
 */
function resolveForcedDebug(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('owt-debug') === '1';
  } catch {
    return false;
  }
}
const FORCED_DEBUG = resolveForcedDebug();

export class Logger {
  private customLevel?: LogLevel;

  constructor(public readonly moduleName: string) {}

  setLevel(level: LogLevel) {
    this.customLevel = level;
  }

  private log(level: LogLevel, ...args: any[]) {
    const minLevel: LogLevel = this.customLevel ?? (
      FORCED_DEBUG ||
      (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') ||
      import.meta.env?.DEV !== false
        ? 'debug'
        : 'warn'
    );

    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[minLevel]) {
      return;
    }

    const prefix = `[${this.moduleName}]`;

    switch (level) {
      case 'debug':
        console.debug(prefix, ...args);
        break;
      case 'info':
        console.info(prefix, ...args);
        break;
      case 'warn':
        console.warn(prefix, ...args);
        break;
      case 'error':
        console.error(prefix, ...args);
        break;
    }
  }

  debug(...args: any[]): void { this.log('debug', ...args); }
  info(...args: any[]): void { this.log('info', ...args); }
  warn(...args: any[]): void { this.log('warn', ...args); }
  error(...args: any[]): void { this.log('error', ...args); }
}

export const createLogger = (moduleName: string) => new Logger(moduleName);
