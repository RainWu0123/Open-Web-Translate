/**
 * Platform Capabilities Detection
 */
import { browser } from 'wxt/browser';

export interface Capabilities {
  isChrome: boolean;
  isFirefox: boolean;
  isMV3: boolean;
  hasScripting: boolean;
  hasSidePanel: boolean;
}

export function detectCapabilities(): Capabilities {
  const userAgent = navigator.userAgent.toLowerCase();
  const isFirefox = userAgent.includes('firefox');
  const isChrome = userAgent.includes('chrome') && !isFirefox;
  
  const manifest = browser.runtime.getManifest();
  const isMV3 = manifest.manifest_version === 3;
  
  return {
    isChrome,
    isFirefox,
    isMV3,
    hasScripting: !!browser.scripting,
    hasSidePanel: !!(browser as any).sidePanel,
  };
}

export const capabilities = detectCapabilities();
