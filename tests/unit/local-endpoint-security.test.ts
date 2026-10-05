import { describe, expect, it, vi } from 'vitest';
import { ConfigurationError } from '@/core/domain/errors/translation-errors';
import {
  assertLocalHttpEndpoint,
  inspectHttpEndpoint,
  isLoopbackHostname,
} from '@/infrastructure/providers/endpoint-security';
import { OllamaProvider } from '@/infrastructure/providers/ollama-provider';
import { LocalHttpProvider } from '@/infrastructure/providers/local-http-provider';

describe('local provider endpoint security', () => {
  it('recognizes localhost and loopback IP ranges', () => {
    expect(isLoopbackHostname('localhost')).toBe(true);
    expect(isLoopbackHostname('api.localhost')).toBe(true);
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('127.25.10.9')).toBe(true);
    expect(isLoopbackHostname('::1')).toBe(true);

    expect(isLoopbackHostname('192.168.1.10')).toBe(false);
    expect(isLoopbackHostname('10.0.0.5')).toBe(false);
    expect(isLoopbackHostname('example.com')).toBe(false);
  });

  it('rejects embedded credentials and non-http schemes', () => {
    expect(inspectHttpEndpoint('ftp://localhost:11434').isValid).toBe(false);
    expect(inspectHttpEndpoint('http://user:pass@localhost:11434').isValid).toBe(false);
  });

  it('rejects remote endpoints for local-only providers', () => {
    expect(() => assertLocalHttpEndpoint('https://api.example.com', 'Local AI'))
      .toThrow(ConfigurationError);
  });

  it('accepts local HTTP and HTTPS loopback endpoints', () => {
    expect(assertLocalHttpEndpoint('http://localhost:11434/', 'Ollama'))
      .toBe('http://localhost:11434');
    expect(assertLocalHttpEndpoint('https://127.0.0.1:8443/', 'Local HTTP'))
      .toBe('https://127.0.0.1:8443');
  });

  it('makes provider config validation reject remote endpoints', () => {
    expect(new OllamaProvider().validateConfig({ endpoint: 'https://ollama.example.com' }).isValid)
      .toBe(false);
    expect(new LocalHttpProvider().validateConfig({ endpoint: 'https://api.example.com' }).isValid)
      .toBe(false);
  });

  it('fails before fetch if a remote endpoint reaches translate at runtime', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const ollama = new OllamaProvider({
      endpoint: 'https://ollama.example.com',
      model: 'llama3',
    });

    await expect(ollama.translate({
      segments: [{ id: 's1' as any, text: 'Hello' }],
      sourceLanguage: 'en' as any,
      targetLanguage: 'zh-Hant' as any,
      mode: 'fast',
    })).rejects.toThrow(ConfigurationError);

    const localHttp = new LocalHttpProvider({
      endpoint: 'https://api.example.com',
      model: 'test-model',
    });

    await expect(localHttp.translate({
      segments: [{ id: 's1' as any, text: 'Hello' }],
      sourceLanguage: 'en' as any,
      targetLanguage: 'zh-Hant' as any,
      mode: 'fast',
    })).rejects.toThrow(ConfigurationError);

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
