/**
 * Gemini API Model Registry & Validation
 *
 * Tracks model lifecycle status, supported API modes, and structured output capabilities.
 * Enforces strict model ID validation against injection and unsupported model types.
 */

export type ApiMode = 'generateContent' | 'live';
export type ModelLifecycle = 'active' | 'deprecated' | 'blocked';

export interface ModelEntry {
  id: string;
  displayName: string;
  apiModes: ApiMode[];
  structuredOutputSupported: boolean;
  lifecycle: ModelLifecycle;
  deprecatedAt?: string; // ISO date string (YYYY-MM-DD)
  replacementModelId?: string;
  lastVerifiedAt: string; // ISO date string (YYYY-MM-DD)
  sourceUrl: string;
  isDefaultCandidate: boolean;
  isPreview?: boolean;
}

export const VERIFIED_MODEL_REGISTRY: readonly ModelEntry[] = [
  {
    id: 'gemini-3.5-flash',
    displayName: 'Gemini 3.5 Flash',
    apiModes: ['generateContent', 'live'],
    structuredOutputSupported: true,
    lifecycle: 'active',
    lastVerifiedAt: '2026-07-19',
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/models',
    isDefaultCandidate: true,
  },
  {
    id: 'gemini-3.1-flash-lite',
    displayName: 'Gemini 3.1 Flash-Lite',
    apiModes: ['generateContent', 'live'],
    structuredOutputSupported: true,
    lifecycle: 'active',
    lastVerifiedAt: '2026-07-19',
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/models',
    isDefaultCandidate: false,
  },
  {
    id: 'gemini-3.1-pro',
    displayName: 'Gemini 3.1 Pro (Preview)',
    apiModes: ['generateContent', 'live'],
    structuredOutputSupported: true,
    lifecycle: 'active',
    isPreview: true,
    lastVerifiedAt: '2026-07-19',
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/models',
    isDefaultCandidate: false,
  },
  {
    id: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    apiModes: ['generateContent', 'live'],
    structuredOutputSupported: true,
    lifecycle: 'deprecated',
    deprecatedAt: '2026-10-16',
    replacementModelId: 'gemini-3.5-flash',
    lastVerifiedAt: '2026-07-19',
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/deprecations',
    isDefaultCandidate: false,
  },
  {
    id: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    apiModes: ['generateContent', 'live'],
    structuredOutputSupported: true,
    lifecycle: 'deprecated',
    deprecatedAt: '2026-10-16',
    replacementModelId: 'gemini-3.5-flash',
    lastVerifiedAt: '2026-07-19',
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/deprecations',
    isDefaultCandidate: false,
  },
  // SHUT DOWN / BLOCKED models
  {
    id: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    apiModes: ['generateContent'],
    structuredOutputSupported: true,
    lifecycle: 'blocked',
    deprecatedAt: '2026-06-01',
    replacementModelId: 'gemini-3.5-flash',
    lastVerifiedAt: '2026-07-19',
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/deprecations',
    isDefaultCandidate: false,
  },
  {
    id: 'gemini-2.0-flash-lite',
    displayName: 'Gemini 2.0 Flash-Lite',
    apiModes: ['generateContent'],
    structuredOutputSupported: true,
    lifecycle: 'blocked',
    deprecatedAt: '2026-06-01',
    replacementModelId: 'gemini-3.1-flash-lite',
    lastVerifiedAt: '2026-07-19',
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/deprecations',
    isDefaultCandidate: false,
  },
  {
    id: 'gemini-1.5-flash',
    displayName: 'Gemini 1.5 Flash',
    apiModes: ['generateContent'],
    structuredOutputSupported: true,
    lifecycle: 'blocked',
    deprecatedAt: '2025-09-24',
    lastVerifiedAt: '2026-07-19',
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/deprecations',
    isDefaultCandidate: false,
  },
  {
    id: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    apiModes: ['generateContent'],
    structuredOutputSupported: true,
    lifecycle: 'blocked',
    deprecatedAt: '2025-09-24',
    lastVerifiedAt: '2026-07-19',
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/deprecations',
    isDefaultCandidate: false,
  },
];

export const MODEL_ID_PATTERN = /^gemini-[a-z0-9]+(?:[.-][a-z0-9]+)*$/i;

export const DEFAULT_MODEL_ID = 'gemini-3.5-flash';

export type ModelValidationResult =
  | { valid: true; modelId: string; entry?: ModelEntry }
  | {
      valid: false;
      reason: 'INVALID_FORMAT' | 'DEPRECATED_MODEL' | 'BLOCKED_MODEL' | 'LIVE_ONLY_MODEL';
      message: string;
      replacementModelId?: string;
    };

export function findModelEntry(modelId: string): ModelEntry | undefined {
  return VERIFIED_MODEL_REGISTRY.find((m) => m.id === modelId.toLowerCase().trim());
}

export function getActiveVerifiedModels(): ModelEntry[] {
  return VERIFIED_MODEL_REGISTRY.filter(
    (m) => m.lifecycle === 'active' && m.apiModes.includes('generateContent'),
  );
}

export function getDeprecatedButFunctionalModels(): ModelEntry[] {
  return VERIFIED_MODEL_REGISTRY.filter(
    (m) => m.lifecycle === 'deprecated' && m.apiModes.includes('generateContent'),
  );
}

export function validateModelId(value: string): ModelValidationResult {
  const modelId = value.trim().toLowerCase();

  if (!MODEL_ID_PATTERN.test(modelId)) {
    return {
      valid: false,
      reason: 'INVALID_FORMAT',
      message: 'Model ID must start with "gemini-" and contain only lowercase letters, digits, dots, and hyphens.',
    };
  }

  const entry = findModelEntry(modelId);

  if (entry) {
    if (entry.lifecycle === 'blocked') {
      return {
        valid: false,
        reason: 'BLOCKED_MODEL',
        message: `${entry.displayName} has been shut down${entry.deprecatedAt ? ` on ${entry.deprecatedAt}` : ''} and is no longer available.`,
        replacementModelId: entry.replacementModelId,
      };
    }

    if (!entry.apiModes.includes('generateContent')) {
      return {
        valid: false,
        reason: 'LIVE_ONLY_MODEL',
        message: 'This extension currently supports REST batch translation only and does not support Live API models.',
      };
    }

    return { valid: true, modelId, entry };
  }

  // Custom model passing pattern check
  return { valid: true, modelId };
}
