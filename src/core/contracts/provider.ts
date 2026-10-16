import type { ProviderId } from './common';
import type { ProviderCapabilities } from './capabilities';
import type { TranslationRequest, TranslationResult } from './translation';

export interface StructuredAnalysisRequest {
  task: 'word-analysis' | 'grammar-analysis';
  prompt: string;
  signal?: AbortSignal;
}

/** Configuration validation result */
export interface ProviderConfigValidation {
  isValid: boolean;
  errors?: string[];
}

/** Core interface for a translation provider */
export interface TranslationProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly isLocal?: boolean;
  readonly capabilities: ProviderCapabilities;
  validateConfig(config: unknown): ProviderConfigValidation;
  translate(request: TranslationRequest): Promise<TranslationResult>;
  /** Optional LLM capability. This bypasses the translation prompt/parser contract. */
  generateStructured?(request: StructuredAnalysisRequest): Promise<unknown>;
}
