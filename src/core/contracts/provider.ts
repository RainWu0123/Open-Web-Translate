import type { ProviderId } from './common';
import type { ProviderCapabilities } from './capabilities';
import type { TranslationRequest, TranslationResult } from './translation';

/** Configuration validation result */
export interface ProviderConfigValidation {
  isValid: boolean;
  errors?: string[];
}

/** Core interface for a translation provider */
export interface TranslationProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  validateConfig(config: unknown): ProviderConfigValidation;
  translate(request: TranslationRequest): Promise<TranslationResult>;
}
