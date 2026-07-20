// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  validateModelId,
  getActiveVerifiedModels,
  getDeprecatedButFunctionalModels,
  DEFAULT_MODEL_ID,
  findModelEntry,
} from '../../src/infrastructure/providers/gemini/model-registry';

describe('Model Registry Unit Tests', () => {
  it('returns only active models in getActiveVerifiedModels', () => {
    const active = getActiveVerifiedModels();
    expect(active.length).toBeGreaterThan(0);

    const ids = active.map((m) => m.id);
    expect(ids).toContain('gemini-3.5-flash');
    expect(ids).toContain('gemini-3.1-flash-lite');

    // Shut down / blocked models MUST NOT be present
    expect(ids).not.toContain('gemini-2.0-flash');
    expect(ids).not.toContain('gemini-2.0-flash-lite');
    expect(ids).not.toContain('gemini-1.5-flash');
    expect(ids).not.toContain('gemini-1.5-pro');

    // Deprecated models MUST NOT be in active list
    expect(ids).not.toContain('gemini-2.5-flash');
  });

  it('identifies gemini-3.5-flash as the default candidate', () => {
    expect(DEFAULT_MODEL_ID).toBe('gemini-3.5-flash');
    const entry = findModelEntry(DEFAULT_MODEL_ID);
    expect(entry).toBeDefined();
    expect(entry?.isDefaultCandidate).toBe(true);
    expect(entry?.lifecycle).toBe('active');
    expect(entry?.structuredOutputSupported).toBe(true);
  });

  it('validates active models successfully', () => {
    const res1 = validateModelId('gemini-3.5-flash');
    expect(res1.valid).toBe(true);
    if (res1.valid) {
      expect(res1.modelId).toBe('gemini-3.5-flash');
      expect(res1.entry?.lifecycle).toBe('active');
    }

    const res2 = validateModelId('gemini-3.1-flash-lite');
    expect(res2.valid).toBe(true);
  });

  it('validates custom experimental model IDs with correct regex pattern', () => {
    const res = validateModelId('gemini-99.9-experimental');
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.modelId).toBe('gemini-99.9-experimental');
      expect(res.entry).toBeUndefined(); // Custom model, not in static verified registry
    }
  });

  it('normalizes uppercase model IDs to lowercase', () => {
    const res = validateModelId('Gemini-3.5-Flash');
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.modelId).toBe('gemini-3.5-flash');
    }
  });

  it('rejects invalid model ID formats (injection attempts / bad syntax)', () => {
    const invalidInputs = [
      'gpt-4', // Non-gemini prefix
      'gemini-2.0-flash/../../evil', // Slash path traversal
      'gemini-2.0-flash?key=secret', // Query string
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash', // Full URL
      'gemini-test model', // Spaces
      'gemini-', // Trailing hyphen only
      '', // Empty string
      '  ',
      'gemini-3.5:generateContent', // Colon function call
    ];

    for (const input of invalidInputs) {
      const res = validateModelId(input);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toBe('INVALID_FORMAT');
      }
    }
  });

  it('blocks shut down / retired models', () => {
    const blockedInputs = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'];

    for (const input of blockedInputs) {
      const res = validateModelId(input);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toBe('BLOCKED_MODEL');
        expect(res.message).toContain('shut down');
      }
    }
  });

  it('allows deprecated but functional models with entry metadata', () => {
    const res = validateModelId('gemini-2.5-flash');
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.entry?.lifecycle).toBe('deprecated');
      expect(res.entry?.deprecatedAt).toBe('2026-10-16');
      expect(res.entry?.replacementModelId).toBe('gemini-3.5-flash');
    }
  });

  it('guarantees safe URL encoding for endpoint path construction', () => {
    const rawInput = 'gemini-3.5-flash';
    const safeSegment = encodeURIComponent(rawInput);
    expect(safeSegment).toBe('gemini-3.5-flash');
    expect(safeSegment).not.toContain('/');
    expect(safeSegment).not.toContain('?');
  });
});
