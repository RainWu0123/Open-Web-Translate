import { ConfigurationError } from '@/core/domain/errors/translation-errors';

export interface EndpointPrivacyCheck {
  isValid: boolean;
  isLocal: boolean;
  normalizedUrl?: string;
  error?: string;
}

function isLoopbackIpv4(hostname: string): boolean {
  const match = hostname.match(/^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  return match.slice(1).every((octet) => Number(octet) >= 0 && Number(octet) <= 255);
}

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '::1' ||
    isLoopbackIpv4(normalized)
  );
}

export function inspectHttpEndpoint(endpoint: string): EndpointPrivacyCheck {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    return {
      isValid: false,
      isLocal: false,
      error: 'Endpoint URL cannot be empty',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      isLocal: false,
      error: 'Invalid endpoint URL format',
    };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return {
      isValid: false,
      isLocal: false,
      error: 'Endpoint must use HTTP or HTTPS',
    };
  }

  if (parsed.username || parsed.password) {
    return {
      isValid: false,
      isLocal: false,
      error: 'Endpoint URL must not contain embedded credentials',
    };
  }

  return {
    isValid: true,
    isLocal: isLoopbackHostname(parsed.hostname),
    normalizedUrl: parsed.toString().replace(/\/$/, ''),
  };
}

export function assertLocalHttpEndpoint(endpoint: string, providerLabel: string): string {
  const inspection = inspectHttpEndpoint(endpoint);

  if (!inspection.isValid) {
    throw new ConfigurationError(
      `${providerLabel} endpoint is invalid: ${inspection.error ?? 'unknown endpoint error'}`,
    );
  }

  if (!inspection.isLocal) {
    throw new ConfigurationError(
      `${providerLabel} is local-only. Use localhost, 127.0.0.0/8, or ::1. Remote endpoints are not allowed for this provider.`,
    );
  }

  return inspection.normalizedUrl!;
}
