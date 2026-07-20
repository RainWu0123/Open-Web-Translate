/** Base error for all translation-related errors */
export class BaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Error originating from a translation provider */
export class ProviderError extends BaseError {
  constructor(public providerId: string, message: string) {
    super(`Provider ${providerId}: ${message}`);
  }
}

/** Error due to missing or invalid configuration */
export class ConfigurationError extends BaseError {}

/** Error due to network failures */
export class NetworkError extends BaseError {}

/** Error when usage quotas are exceeded */
export class QuotaExceededError extends BaseError {}
