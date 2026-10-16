import { describe, expect, it } from 'vitest';
import { resolveProviderId } from '@/core/settings/provider-selection';

const settings = {
  enabled: true,
  sourceLanguage: 'auto',
  targetLanguage: 'zh-Hant',
  defaultTranslationMode: 'fast' as const,
  activeProviderId: 'google-provider',
  videoProviderId: 'gemini-provider',
};

describe('provider selection', () => {
  it('shares the page provider by default', () => {
    expect(resolveProviderId(settings, 'video')).toBe('google-provider');
  });

  it('uses the separate video provider only in split mode', () => {
    expect(resolveProviderId({ ...settings, providerSelectionMode: 'split' }, 'page')).toBe('google-provider');
    expect(resolveProviderId({ ...settings, providerSelectionMode: 'split' }, 'video')).toBe('gemini-provider');
  });

  it('honours an explicit provider used by the connection test', () => {
    expect(resolveProviderId(settings, 'video', 'ollama-provider')).toBe('ollama-provider');
  });
});
