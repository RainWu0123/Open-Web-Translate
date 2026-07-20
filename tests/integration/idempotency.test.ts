// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DOMTranslatorEngine } from '../helpers/dom-translator';
import { MockProvider } from '../../src/infrastructure/providers/mock-provider';

import type { LanguageCode } from '../../src/core/contracts/common';

describe('Idempotency on Repeated Translation Triggers', () => {
  let engine: DOMTranslatorEngine;
  let provider: MockProvider;
  const fixturePath = path.resolve(__dirname, '../fixtures/article.html');
  const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');

  beforeEach(() => {
    document.documentElement.innerHTML = fixtureHtml;
    engine = new DOMTranslatorEngine();
    provider = new MockProvider();
  });

  it('does not duplicate bilingual blocks or re-translate already processed elements', async () => {
    const existingHostCount = document.querySelectorAll('.owt-bilingual-host').length;

    // Pass 1: Select & Translate
    const segmentsPass1 = engine.selectTargets(document);
    expect(segmentsPass1.length).toBeGreaterThan(0);

    const translateRes1 = await provider.translate({
      segments: segmentsPass1.map((s) => ({ id: s.id as any, text: s.text })),
      sourceLanguage: 'auto' as any,
      targetLanguage: 'zh-Hant' as LanguageCode,
      mode: 'fast',
    });

    engine.applyTranslations(segmentsPass1, {
      segments: translateRes1.segments.map((s) => ({
        id: s.id as string,
        translatedText: s.text,
      })),
    });

    const hostCountAfterPass1 = document.querySelectorAll('.owt-bilingual-host').length;
    expect(hostCountAfterPass1).toBe(existingHostCount + segmentsPass1.length);

    // Pass 2: Repeat trigger on the same document
    const segmentsPass2 = engine.selectTargets(document);
    expect(segmentsPass2.length).toBe(0); // All eligible elements were already translated!

    // Ensure no new bilingual blocks are added on repeated trigger
    const hostCountAfterPass2 = document.querySelectorAll('.owt-bilingual-host').length;
    expect(hostCountAfterPass2).toBe(hostCountAfterPass1);
  });
});
