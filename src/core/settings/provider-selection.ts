import type { ExtensionSettings } from '@/core/contracts/messages';

export type TranslationUsage = 'page' | 'video';

/** Resolve the provider in one place so every caller follows the same shared/split rule. */
export function resolveProviderId(
  settings: Pick<ExtensionSettings, 'activeProviderId' | 'providerSelectionMode' | 'videoProviderId'>,
  usage: TranslationUsage = 'page',
  forceProvider?: string,
): string {
  if (forceProvider?.trim()) return forceProvider.trim();
  if (usage === 'video' && settings.providerSelectionMode === 'split') {
    return settings.videoProviderId?.trim() || settings.activeProviderId || 'google-provider';
  }
  return settings.activeProviderId || 'google-provider';
}
