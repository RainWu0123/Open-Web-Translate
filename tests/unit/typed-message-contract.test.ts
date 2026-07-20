import { describe, it, expect } from 'vitest';
import type {
  TranslateRequestMessage,
  TranslateResponsePayload,
  GetSettingsMessage,
  UpdateSettingsMessage,
  ExtensionSettings,
  BackgroundMessage,
} from '../../src/core/contracts/messages';
import { MockProvider } from '../../src/infrastructure/providers/mock-provider';
import { DEFAULT_SETTINGS } from '../../src/shared/constants/index';

import type { LanguageCode } from '../../src/core/contracts/common';

describe('Typed Message Request/Response Contract', () => {
  it('constructs valid TranslateRequestMessage and verifies structure', () => {
    const request: TranslateRequestMessage = {
      type: 'TRANSLATE_REQUEST',
      segments: [
        { id: 'seg-1', text: 'Hello world' },
        { id: 'seg-2', text: 'Open Web Translate' },
      ],
      sourceLanguage: 'auto',
      targetLanguage: 'zh-Hant' as LanguageCode,
    };

    expect(request.type).toBe('TRANSLATE_REQUEST');
    expect(request.segments).toHaveLength(2);
    expect(request.sourceLanguage).toBe('auto');
    expect(request.targetLanguage).toBe('zh-Hant');
  });

  it('validates MockProvider response contract matches TranslateResponsePayload', async () => {
    const provider = new MockProvider();
    const result = await provider.translate({
      segments: [
        { id: 'seg-1' as any, text: 'Hello world' },
        { id: 'seg-2' as any, text: 'DOM isolation' },
      ],
      sourceLanguage: 'auto' as any,
      targetLanguage: 'zh-Hant' as LanguageCode,
      mode: 'fast',
    });

    const responsePayload: TranslateResponsePayload = {
      segments: result.segments.map((s) => ({
        id: s.id as string,
        translatedText: s.text,
      })),
    };

    expect(responsePayload.segments).toHaveLength(2);
    expect(responsePayload.segments[0]).toEqual({
      id: 'seg-1',
      translatedText: 'Hello world',
    });
    expect(responsePayload.segments[1]).toEqual({
      id: 'seg-2',
      translatedText: 'DOM isolation',
    });
  });

  it('validates GetSettingsMessage and UpdateSettingsMessage types', () => {
    const getMsg: GetSettingsMessage = { type: 'GET_SETTINGS' };
    expect(getMsg.type).toBe('GET_SETTINGS');

    const settingsUpdate: Partial<ExtensionSettings> = { targetLanguage: 'ja' };
    const updateMsg: UpdateSettingsMessage = {
      type: 'UPDATE_SETTINGS',
      settings: settingsUpdate,
    };

    expect(updateMsg.type).toBe('UPDATE_SETTINGS');
    expect(updateMsg.settings.targetLanguage).toBe('ja');
  });

  it('conforms to default ExtensionSettings contract', () => {
    const settings: ExtensionSettings = DEFAULT_SETTINGS;

    expect(settings.enabled).toBe(true);
    expect(settings.targetLanguage).toBeDefined();
    expect(settings.defaultTranslationMode).toMatch(/fast|quality/);
    expect(settings.activeProviderId).toBe('mock-provider');
  });
});
