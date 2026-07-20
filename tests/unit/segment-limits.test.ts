// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DOMTranslatorEngine } from '../helpers/dom-translator';
import { QuotaExceededError } from '../../src/core/domain/errors/translation-errors';

describe('Segment Length & Total Character Limit Validation', () => {
  const fixturePath = path.resolve(__dirname, '../fixtures/article.html');
  const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');

  beforeEach(() => {
    document.documentElement.innerHTML = fixtureHtml;
  });

  it('filters out paragraphs shorter than minParagraphLength', () => {
    const engine = new DOMTranslatorEngine({ minParagraphLength: 15 });
    const segments = engine.selectTargets(document);

    const segmentIds = segments.map((s) => s.element.id);
    expect(segmentIds).not.toContain('p-short'); // "Short." length is 6 chars
  });

  it('filters out paragraphs exceeding maxParagraphLength', () => {
    const engine = new DOMTranslatorEngine({
      minParagraphLength: 5,
      maxParagraphLength: 150, // p-long exceeds 150 chars
    });
    const segments = engine.selectTargets(document);

    const segmentIds = segments.map((s) => s.element.id);
    expect(segmentIds).not.toContain('p-long');
    expect(segmentIds).toContain('p-intro'); // ~100 chars
  });

  it('throws QuotaExceededError when total character count exceeds limit', () => {
    const engine = new DOMTranslatorEngine({
      minParagraphLength: 10,
      maxTotalCharacters: 100, // Very low total character limit
    });

    expect(() => engine.selectTargets(document)).toThrow(QuotaExceededError);
  });

  it('accepts batches within total character count limit', () => {
    const engine = new DOMTranslatorEngine({
      minParagraphLength: 10,
      maxTotalCharacters: 50000,
    });

    expect(() => engine.selectTargets(document)).not.toThrow();
    const segments = engine.selectTargets(document);
    expect(segments.length).toBeGreaterThan(0);
  });
});
