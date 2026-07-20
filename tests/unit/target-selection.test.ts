// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DOMTranslatorEngine } from '../helpers/dom-translator';

describe('Target Selection & Exclusion Rules', () => {
  let engine: DOMTranslatorEngine;
  const fixturePath = path.resolve(__dirname, '../fixtures/article.html');
  const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');

  beforeEach(() => {
    document.documentElement.innerHTML = fixtureHtml;
    engine = new DOMTranslatorEngine();
  });

  it('includes eligible target elements (p, h1, h2, h3)', () => {
    const segments = engine.selectTargets(document);
    const elementIds = segments.map((s) => s.element.id);

    expect(elementIds).toContain('title-1'); // h1
    expect(elementIds).toContain('title-2'); // h2
    expect(elementIds).toContain('title-3'); // h3
    expect(elementIds).toContain('p-intro'); // p
    expect(elementIds).toContain('p-isolation'); // p
    expect(elementIds).toContain('p-long'); // p
  });

  it('excludes elements inside nav, footer, code, pre, script, style, and form', () => {
    const segments = engine.selectTargets(document);
    const elementTexts = segments.map((s) => s.text);
    const elementIds = segments.map((s) => s.element.id);

    // Nav paragraph
    expect(elementTexts).not.toContain('Nav paragraph should be excluded');
    // Footer paragraph
    expect(elementIds).not.toContain('p-footer');
    // Form paragraph
    expect(elementTexts).not.toContain('Form paragraph inside form should be excluded');
    // Code and pre content
    expect(elementTexts).not.toContain('const translate = (text) => text.toUpperCase();');
    expect(elementTexts).not.toContain('function runPipeline(input) {');
    // Script and style
    expect(elementTexts).not.toContain('Embedded script block');
    expect(elementTexts).not.toContain('Embedded style block');
  });

  it('excludes hidden elements (hidden attribute, display:none, visibility:hidden)', () => {
    const segments = engine.selectTargets(document);
    const elementIds = segments.map((s) => s.element.id);

    expect(elementIds).not.toContain('p-hidden-css');
    expect(elementIds).not.toContain('p-hidden-vis');
    expect(elementIds).not.toContain('p-hidden-attr');
  });

  it('excludes OWT Shadow DOM host nodes and ignored containers', () => {
    const badgeHost = document.getElementById('owt-badge-host')!;
    const bilingualHost = document.querySelector('.owt-bilingual-host')!;

    expect(engine.isExcluded(badgeHost)).toBe(true);
    expect(engine.isExcluded(bilingualHost)).toBe(true);

    const segments = engine.selectTargets(document);
    const hostsInSegments = segments.filter(
      (s) => s.element === badgeHost || s.element === bilingualHost
    );
    expect(hostsInSegments).toHaveLength(0);
  });

  it('excludes inputs and form fields', () => {
    const searchInput = document.getElementById('search-input')!;
    expect(engine.isValidTarget(searchInput)).toBe(false);
    expect(engine.isExcluded(searchInput)).toBe(true);
  });
});
