// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DOMTranslatorEngine } from '../helpers/dom-translator';
import { MockProvider } from '../../src/infrastructure/providers/mock-provider';
import type { LanguageCode } from '../../src/core/contracts/common';

describe('OWTV3-010 Regression Integration Test Suite', () => {
  let engine: DOMTranslatorEngine;
  let provider: MockProvider;
  const fixturePath = path.resolve(__dirname, '../../fixtures/article.html');
  const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');

  beforeEach(() => {
    document.documentElement.innerHTML = fixtureHtml;
    engine = new DOMTranslatorEngine();
    provider = new MockProvider();
  });

  it('executes complete Translate -> Render -> Restore flow without loss or side-effects', async () => {
    const originalTextContent = document.body.textContent;

    // 1. Extraction / Selection
    const segments = engine.selectTargets(document);
    expect(segments.length).toBeGreaterThan(0);

    // 2. Translation
    const request = engine.buildTranslationRequest(segments, 'zh-Hant');
    const result = await provider.translate({
      segments: request.segments.map((s) => ({ id: s.id as any, text: s.text })),
      sourceLanguage: 'auto' as any,
      targetLanguage: request.targetLanguage as LanguageCode,
      mode: 'fast',
    });

    expect(result.segments).toHaveLength(segments.length);

    // 3. Rendering / Injection
    engine.applyTranslations(segments, {
      segments: result.segments.map((s) => ({
        id: s.id as string,
        translatedText: s.text,
      })),
    });

    const hostElements = document.querySelectorAll('.owt-bilingual-host');
    expect(hostElements.length).toBe(7);

    // 4. Restoration
    engine.restore(document);

    // 5. Verification of clean DOM state
    expect(document.querySelectorAll('.owt-bilingual-host').length).toBe(0);
    expect(document.querySelectorAll('#owt-badge-host').length).toBe(0);
    expect(document.querySelectorAll('[data-owt-translated]').length).toBe(0);
    expect(document.querySelectorAll('[data-owt-segment-id]').length).toBe(0);
    expect(document.body.textContent).toBe(originalTextContent);
  });

  it('preserves idempotency across repeated translation calls on identical DOM', async () => {
    // First translation pass
    const pass1 = engine.selectTargets(document);
    expect(pass1.length).toBeGreaterThan(0);

    const res1 = await provider.translate({
      segments: pass1.map((s) => ({ id: s.id as any, text: s.text })),
      sourceLanguage: 'auto' as any,
      targetLanguage: 'zh-Hant' as LanguageCode,
      mode: 'fast',
    });

    engine.applyTranslations(pass1, {
      segments: res1.segments.map((s) => ({ id: s.id as string, translatedText: s.text })),
    });

    const hostCount1 = document.querySelectorAll('.owt-bilingual-host').length;

    // Second translation pass - target selection should skip translated nodes
    const pass2 = engine.selectTargets(document);
    expect(pass2.length).toBe(0);

    const hostCount2 = document.querySelectorAll('.owt-bilingual-host').length;
    expect(hostCount2).toBe(hostCount1);
  });

  it('filters excluded and hidden nodes cleanly during target selection', () => {
    const segments = engine.selectTargets(document);
    const elements = segments.map((s) => s.element);

    for (const el of elements) {
      expect(engine.isExcluded(el)).toBe(false);
      expect(el.closest('nav, footer, code, pre, script, style, form')).toBeNull();
      expect(el.hasAttribute('hidden')).toBe(false);
    }
  });
});
