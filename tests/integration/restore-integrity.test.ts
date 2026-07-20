// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DOMTranslatorEngine } from '../helpers/dom-translator';
import { MockProvider } from '../../src/infrastructure/providers/mock-provider';

import type { LanguageCode } from '../../src/core/contracts/common';

describe('Restore Integrity Test', () => {
  let engine: DOMTranslatorEngine;
  let provider: MockProvider;
  const fixturePath = path.resolve(__dirname, '../fixtures/article.html');
  const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');

  beforeEach(() => {
    document.documentElement.innerHTML = fixtureHtml;
    engine = new DOMTranslatorEngine();
    provider = new MockProvider();
  });

  it('completely removes all injected OWT Shadow DOM elements and restores clean DOM state', async () => {
    const originalTextContent = document.body.textContent;

    // 1. Perform translation flow
    const segments = engine.selectTargets(document);
    const result = await provider.translate({
      segments: segments.map((s) => ({ id: s.id as any, text: s.text })),
      sourceLanguage: 'auto' as any,
      targetLanguage: 'zh-Hant' as LanguageCode,
      mode: 'fast',
    });

    engine.applyTranslations(segments, {
      segments: result.segments.map((s) => ({
        id: s.id as string,
        translatedText: s.text,
      })),
    });

    // Confirm UI was injected
    expect(document.querySelectorAll('.owt-bilingual-host').length).toBeGreaterThan(0);

    // 2. Perform restore
    engine.restore(document);

    // 3. Verify clean state
    expect(document.querySelectorAll('.owt-bilingual-host').length).toBe(0);
    expect(document.querySelectorAll('#owt-badge-host').length).toBe(0);
    expect(document.querySelectorAll('[data-owt-translated]').length).toBe(0);
    expect(document.querySelectorAll('[data-owt-segment-id]').length).toBe(0);

    // 4. Verify DOM text content matches original
    expect(document.body.textContent).toBe(originalTextContent);
  });
});
