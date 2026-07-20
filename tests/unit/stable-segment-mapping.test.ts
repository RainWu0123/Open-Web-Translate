// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DOMTranslatorEngine } from '../helpers/dom-translator';

describe('Stable Segment ID Mapping', () => {
  let engine: DOMTranslatorEngine;
  const fixturePath = path.resolve(__dirname, '../fixtures/article.html');
  const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');

  beforeEach(() => {
    document.documentElement.innerHTML = fixtureHtml;
    engine = new DOMTranslatorEngine();
  });

  it('assigns stable segment IDs to target elements and retains them across multiple scans', () => {
    const firstPass = engine.selectTargets(document);
    const firstMapping = firstPass.map((s) => ({ id: s.id, tag: s.element.tagName, elId: s.element.id }));

    // Re-run scan on the same document state
    const secondPass = engine.selectTargets(document);
    const secondMapping = secondPass.map((s) => ({ id: s.id, tag: s.element.tagName, elId: s.element.id }));

    expect(firstMapping).toEqual(secondMapping);
  });

  it('preserves existing data-owt-segment-id attributes on DOM elements', () => {
    const segments = engine.selectTargets(document);
    for (const seg of segments) {
      const attr = seg.element.getAttribute('data-owt-segment-id');
      expect(attr).toBe(seg.id);
      expect(attr).toBeTruthy();
    }
  });

  it('assigns unique, deterministic IDs to newly added dynamic DOM elements without affecting existing IDs', () => {
    const initialSegments = engine.selectTargets(document);
    const initialIds = initialSegments.map((s) => s.id);

    // Dynamically append a new eligible paragraph
    const dynamicContainer = document.getElementById('dynamic-container')!;
    const newPara = document.createElement('p');
    newPara.id = 'p-dynamic';
    newPara.textContent = 'Dynamically added paragraph content that arrives later in DOM lifecycle.';
    dynamicContainer.appendChild(newPara);

    const updatedSegments = engine.selectTargets(document);
    const updatedIds = updatedSegments.map((s) => s.id);

    // Initial IDs remain unchanged in sequence
    for (let i = 0; i < initialIds.length; i++) {
      expect(updatedIds[i]).toBe(initialIds[i]);
    }

    // New segment added with a valid unique ID
    expect(updatedIds.length).toBe(initialIds.length + 1);
    const dynamicSeg = updatedSegments.find((s) => s.element.id === 'p-dynamic');
    expect(dynamicSeg).toBeDefined();
    expect(dynamicSeg?.id).toBeTruthy();
  });
});
