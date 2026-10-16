/**
 * Chrome on-device language-model provider (Gemini Nano / Prompt API).
 * The API is document-only, so production calls run in an extension page or
 * content-script document context instead of the background worker.
 */
import type { ProviderId } from '@/core/contracts/common';
import type { ProviderCapabilities } from '@/core/contracts/capabilities';
import type {
  TranslationProvider,
  ProviderConfigValidation,
  StructuredAnalysisRequest,
} from '@/core/contracts/provider';
import type { TranslationRequest, TranslationResult } from '@/core/contracts/translation';
import { ConfigurationError, NetworkError, ProviderError } from '@/core/domain/errors/translation-errors';
import { languageOutputInstruction } from './language-output-instructions';
import { dialogueContextPrompt } from './dialogue-context';
import { parseStructuredJson } from './structured-output';

interface LanguageModelSessionLike {
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy?(): void;
}

interface LanguageModelConstructorLike {
  availability(options?: Record<string, unknown>): Promise<string>;
  create(options?: {
    initialPrompts?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    signal?: AbortSignal;
  }): Promise<LanguageModelSessionLike>;
}

function getLanguageModel(): LanguageModelConstructorLike | null {
  const scope = globalThis as any;
  return scope.LanguageModel ?? scope.ai?.languageModel ?? null;
}

export class ChromeBuiltInAIProvider implements TranslationProvider {
  readonly id = 'chrome-builtin-ai-provider' as ProviderId;
  readonly displayName = 'Chrome on-device Gemini Nano';
  readonly isLocal = true;
  readonly capabilities: ProviderCapabilities = {
    structuredAnalysis: true,
    streaming: false,
    glossary: false,
    context: true,
    maxSegments: 20,
  };

  static async availability(): Promise<string> {
    const model = getLanguageModel();
    if (!model?.availability || !model?.create) return 'unavailable';
    try {
      return await model.availability();
    } catch {
      return 'unavailable';
    }
  }

  validateConfig(_config?: unknown): ProviderConfigValidation {
    if (!getLanguageModel()?.create) {
      return {
        isValid: false,
        errors: ['Chrome Prompt API (Gemini Nano) is unavailable in this document context'],
      };
    }
    return { isValid: true };
  }

  private async createSession(systemPrompt: string, signal?: AbortSignal): Promise<LanguageModelSessionLike> {
    const model = getLanguageModel();
    if (!model?.create) {
      throw new ConfigurationError('此瀏覽器或執行環境不支援 Chrome 內建本機 AI（Prompt API）。');
    }
    const availability = await ChromeBuiltInAIProvider.availability();
    if (availability === 'unavailable') {
      throw new ConfigurationError('此裝置不符合 Chrome 內建本機 AI 的需求，或 Prompt API 尚未啟用。');
    }
    try {
      return await model.create({
        signal,
        initialPrompts: [{ role: 'system', content: systemPrompt }],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (availability === 'downloadable' || availability === 'downloading') {
        throw new ConfigurationError(`Chrome 本機模型尚未準備完成。請在設定頁按「測試服務」下載並啟用模型。${message ? ` (${message})` : ''}`);
      }
      throw new NetworkError(`Chrome 本機 AI 建立工作階段失敗：${message}`);
    }
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (!request.segments?.length) {
      return { providerId: this.id, segments: [], warnings: [], cacheable: true };
    }

    const systemPrompt = `You are a precise professional translator running fully on-device.
Translate every input segment to language code "${request.targetLanguage}".
Source language: "${request.sourceLanguage}" (detect it when set to auto).
${languageOutputInstruction(request.targetLanguage)}
Use surrounding dialogue to resolve names, pronouns, terminology, and tone consistently.
Return ONLY a valid JSON array with exact keys "id" and "translatedText". Preserve every id.
Do not explain, annotate, or offer slash-separated alternatives.${dialogueContextPrompt(request.context)}`;

    const session = await this.createSession(systemPrompt, request.signal);
    try {
      const raw = await session.prompt(JSON.stringify(request.segments), { signal: request.signal });
      const parsed = parseStructuredJson(this.id, raw);
      if (!Array.isArray(parsed)) throw new ProviderError(this.id, 'Chrome local AI did not return a translation array');
      const byId = new Map<string, string>();
      const requestedIds = new Set(request.segments.map((segment) => String(segment.id)));
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const id = (item as any).id;
        const translatedText = (item as any).translatedText;
        if (typeof id !== 'string' || !requestedIds.has(id)) {
          throw new ProviderError(this.id, 'Chrome local AI returned an unknown translation id');
        }
        if (byId.has(id)) throw new ProviderError(this.id, 'Chrome local AI returned a duplicate translation id');
        if (typeof translatedText !== 'string' || !translatedText.trim()) {
          throw new ProviderError(this.id, 'Chrome local AI returned an empty translation');
        }
        byId.set(id, translatedText.trim());
      }
      if (byId.size !== requestedIds.size || request.segments.some((segment) => !byId.has(String(segment.id)))) {
        throw new ProviderError(this.id, 'Chrome local AI returned an incomplete translation');
      }
      return {
        providerId: this.id,
        segments: request.segments.map((segment) => ({ id: segment.id, text: byId.get(segment.id)! })),
        warnings: [],
        cacheable: true,
      };
    } finally {
      session.destroy?.();
    }
  }

  async generateStructured(request: StructuredAnalysisRequest): Promise<unknown> {
    const session = await this.createSession(
      'You are a careful language teacher. Follow the requested schema exactly and return only valid JSON without markdown.',
      request.signal,
    );
    try {
      return parseStructuredJson(this.id, await session.prompt(request.prompt, { signal: request.signal }));
    } finally {
      session.destroy?.();
    }
  }
}

export { ChromeBuiltInAIProvider as ChromeAiProvider, ChromeBuiltInAIProvider as ChromeAIProvider };
