import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, createLogger, LogLevel } from '../../src/shared/logger/index';

describe('Logger Variadic Signature Empirical Stress Tests', () => {
  let debugSpy: any;
  let infoSpy: any;
  let warnSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createLogger factory returns a Logger instance with specified moduleName', () => {
    const logger = createLogger('TestModule');
    expect(logger).toBeInstanceOf(Logger);
    expect(logger.moduleName).toBe('TestModule');
  });

  describe('Variadic Parameter Counts (0, 1, 2, 5, 10 arguments)', () => {
    const logger = createLogger('VariadicCountTest');

    it('handles 0 arguments without error', () => {
      expect(() => {
        logger.debug();
        logger.info();
        logger.warn();
        logger.error();
      }).not.toThrow();

      expect(debugSpy).toHaveBeenCalledWith('[VariadicCountTest]');
      expect(infoSpy).toHaveBeenCalledWith('[VariadicCountTest]');
      expect(warnSpy).toHaveBeenCalledWith('[VariadicCountTest]');
      expect(errorSpy).toHaveBeenCalledWith('[VariadicCountTest]');
    });

    it('handles 1 argument', () => {
      expect(() => {
        logger.info('single message');
      }).not.toThrow();

      expect(infoSpy).toHaveBeenCalledWith('[VariadicCountTest]', 'single message');
    });

    it('handles 2 arguments', () => {
      expect(() => {
        logger.warn('warning key', { code: 404 });
      }).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith('[VariadicCountTest]', 'warning key', { code: 404 });
    });

    it('handles 5 arguments', () => {
      const args = [1, 'two', { three: 3 }, [4], null];
      expect(() => {
        logger.debug(...args);
      }).not.toThrow();

      expect(debugSpy).toHaveBeenCalledWith('[VariadicCountTest]', 1, 'two', { three: 3 }, [4], null);
    });

    it('handles 10 arguments', () => {
      const args = [1, 'two', true, false, null, undefined, { a: 1 }, [1, 2], new Error('err'), Symbol('sym')];
      expect(() => {
        logger.error(...args);
      }).not.toThrow();

      expect(errorSpy).toHaveBeenCalledWith('[VariadicCountTest]', ...args);
    });

    it('handles large argument list (100 arguments)', () => {
      const args = Array.from({ length: 100 }, (_, i) => `arg_${i}`);
      expect(() => {
        logger.info(...args);
      }).not.toThrow();

      expect(infoSpy).toHaveBeenCalledWith('[VariadicCountTest]', ...args);
    });
  });

  describe('Mixed & Complex Types Support', () => {
    const logger = createLogger('MixedTypeTest');

    it('handles null and undefined arguments', () => {
      expect(() => {
        logger.info(null, undefined, 'text', undefined, null);
      }).not.toThrow();

      expect(infoSpy).toHaveBeenCalledWith('[MixedTypeTest]', null, undefined, 'text', undefined, null);
    });

    it('handles circular references inside objects', () => {
      const circularObj: any = { name: 'circular' };
      circularObj.self = circularObj;

      expect(() => {
        logger.warn('Circular object:', circularObj);
      }).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith('[MixedTypeTest]', 'Circular object:', circularObj);
    });

    it('handles Error instances and Error subclasses', () => {
      const err = new TypeError('Type mismatch error');
      expect(() => {
        logger.error('Failed with error:', err);
      }).not.toThrow();

      expect(errorSpy).toHaveBeenCalledWith('[MixedTypeTest]', 'Failed with error:', err);
    });

    it('handles Functions, Symbols, BigInts, NaN, and Infinity', () => {
      const fn = () => 'test';
      const sym = Symbol('logger_sym');
      const big = BigInt(9007199254740991);

      expect(() => {
        logger.debug('Special JS types:', fn, sym, big, NaN, Infinity, -0);
      }).not.toThrow();

      expect(debugSpy).toHaveBeenCalledWith('[MixedTypeTest]', 'Special JS types:', fn, sym, big, NaN, Infinity, -0);
    });

    it('handles deeply nested objects and arrays', () => {
      const deepStructure = {
        level1: {
          level2: {
            array: [{ key: 'value', numbers: [1, 2, 3] }]
          }
        }
      };

      expect(() => {
        logger.info('Deep structure:', deepStructure);
      }).not.toThrow();

      expect(infoSpy).toHaveBeenCalledWith('[MixedTypeTest]', 'Deep structure:', deepStructure);
    });

    it('handles objects with custom toString / valueOf or throwing getters during log calls', () => {
      const throwingGetterObj = {
        get badProp() {
          throw new Error('Getter error');
        }
      };

      expect(() => {
        logger.warn('Object with throwing getter:', throwingGetterObj);
      }).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith('[MixedTypeTest]', 'Object with throwing getter:', throwingGetterObj);
    });

    it('handles moduleName with special format specifiers or empty string', () => {
      const fmtLogger = createLogger('%s %d %j');
      expect(() => {
        fmtLogger.info('test formatted name');
      }).not.toThrow();

      expect(infoSpy).toHaveBeenCalledWith('[%s %d %j]', 'test formatted name');

      const emptyLogger = createLogger('');
      expect(() => {
        emptyLogger.debug('empty module name');
      }).not.toThrow();

      expect(debugSpy).toHaveBeenCalledWith('[]', 'empty module name');
    });
  });

  describe('Log Level Priority Filtering & Custom Level Override', () => {
    it('logs all levels when custom level is debug', () => {
      const logger = createLogger('LevelTest');
      logger.setLevel('debug');

      logger.debug('msg debug');
      logger.info('msg info');
      logger.warn('msg warn');
      logger.error('msg error');

      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('filters out debug logs when custom level is info', () => {
      const logger = createLogger('LevelTest');
      logger.setLevel('info');

      logger.debug('should be suppressed');
      logger.info('should be logged');

      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalledTimes(1);
    });

    it('filters out debug and info when custom level is warn', () => {
      const logger = createLogger('LevelTest');
      logger.setLevel('warn');

      logger.debug('suppressed');
      logger.info('suppressed');
      logger.warn('logged');
      logger.error('logged');

      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('only logs error when custom level is error', () => {
      const logger = createLogger('LevelTest');
      logger.setLevel('error');

      logger.debug('suppressed');
      logger.info('suppressed');
      logger.warn('suppressed');
      logger.error('logged');

      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('defaults to debug mode in test environment', () => {
      const logger = createLogger('DefaultLevelTest');
      logger.debug('default debug log');
      expect(debugSpy).toHaveBeenCalledTimes(1);
    });
  });
});
