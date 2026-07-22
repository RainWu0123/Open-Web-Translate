import { browser } from 'wxt/browser';
import { createLogger } from '@/shared/logger';

const logger = createLogger('SubtitleSessionStore');

export interface SubtitleCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  lang: string;
  source: 'netflix-native' | 'ai' | 'dom' | 'external';
  trackId?: string;
}

export interface SubtitlePair {
  id: string;
  episodeId: string;
  primary: SubtitleCue;
  secondary?: SubtitleCue;
  alignment: 'official-timed' | 'overlap' | 'ai-derived';
}

export interface SubtitleToken {
  id: string; // e.g. "cue-88:4-7"
  surface: string; // e.g. "白鼠"
  normalized: string; // e.g. "白鼠"
  start: number;
  end: number;
  reading?: string; // e.g. "しろねずみ"
  lemma?: string;
  pos?: string;
}

export interface VocabularyCard {
  id: string;
  language: string;
  lemma: string;
  surface: string;
  reading?: string;
  meaning?: string;
  example: {
    text: string;
    translation?: string;
    episodeId: string;
    cueStartMs: number;
  };
  createdAt: number;
  reviewState: 'new' | 'learning' | 'known';
}

export interface CapturedTrack {
  id: string;
  lang: string;
  source: 'manifest' | 'network' | 'cadmium' | 'dom';
  profile?: string;
  url?: string;
  httpStatus?: number;
  isBitmap?: boolean;
  cues: SubtitleCue[];
}

export type SubtitleEngineMode = 'dual-native' | 'primary-native-ai-secondary' | 'native-player-only';

export function isUsableTextTrack(track?: CapturedTrack): boolean {
  if (!track) return false;
  if (track.isBitmap) return false;
  if (track.cues.length < 2) return false;
  return track.cues.some((cue) => cue.text && cue.text.trim().length > 0);
}

export function decideSubtitleMode(primary?: CapturedTrack, secondary?: CapturedTrack): SubtitleEngineMode {
  if (isUsableTextTrack(primary) && isUsableTextTrack(secondary)) {
    return 'dual-native';
  }
  if (isUsableTextTrack(primary)) {
    return 'primary-native-ai-secondary';
  }
  return 'native-player-only';
}

/**
 * Tokenize subtitle text into interactive tokens for CJK and Western languages.
 */
export function tokenizeText(cueId: string, text: string, lang: string): SubtitleToken[] {
  const tokens: SubtitleToken[] = [];
  if (!text) return tokens;

  // Simple tokenization algorithm supporting CJK word boundaries and space-separated languages
  const isCJK = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf\uac00-\ud7af]/.test(text);

  if (isCJK) {
    // Regex matching CJK words, kanji clusters, katakana words, or individual characters
    const regex = /([\u4e00-\u9faf\u3040-\u309f]+|[\u30a0-\u30ff]+|[a-zA-Z0-9]+|[^\s])/g;
    let match: RegExpExecArray | null;
    let tokenIndex = 0;

    while ((match = regex.exec(text)) !== null) {
      const surface = match[0];
      const start = match.index;
      const end = start + surface.length;
      const id = `${cueId}:${start}-${end}`;

      tokens.push({
        id,
        surface,
        normalized: surface,
        start,
        end,
      });
      tokenIndex++;
    }
  } else {
    // Western languages: split by whitespace & punctuation
    const regex = /(\b[a-zA-Z0-9]+['’]?[a-zA-Z0-9]*\b|[^\s\w])/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const surface = match[0];
      const start = match.index;
      const end = start + surface.length;
      const id = `${cueId}:${start}-${end}`;

      tokens.push({
        id,
        surface,
        normalized: surface.toLowerCase(),
        start,
        end,
      });
    }
  }

  return tokens;
}

export class SubtitleSessionStore {
  private episodeId = '';
  private primaryTrack?: CapturedTrack;
  private secondaryTrack?: CapturedTrack;
  private vocabulary: Map<string, VocabularyCard> = new Map();
  private tokenCache: Map<string, SubtitleToken[]> = new Map();

  constructor() {
    this.loadSavedVocabulary();
  }

  public setEpisodeId(id: string): void {
    this.episodeId = id;
  }

  public setPrimaryTrack(track: CapturedTrack): void {
    this.primaryTrack = track;
    this.tokenCache.clear();
    logger.info(`Primary track set: ${track.lang} (${track.cues.length} cues)`);
  }

  public setSecondaryTrack(track: CapturedTrack): void {
    this.secondaryTrack = track;
    logger.info(`Secondary track set: ${track.lang} (${track.cues.length} cues)`);
  }

  public getPrimaryTrack(): CapturedTrack | undefined {
    return this.primaryTrack;
  }

  public getSecondaryTrack(): CapturedTrack | undefined {
    return this.secondaryTrack;
  }

  public getEngineMode(): SubtitleEngineMode {
    return decideSubtitleMode(this.primaryTrack, this.secondaryTrack);
  }

  public getActivePair(nowMs: number): SubtitlePair | null {
    if (!this.primaryTrack || this.primaryTrack.cues.length === 0) return null;

    const primaryCue = this.primaryTrack.cues.find((c) => c.startMs <= nowMs && nowMs < c.endMs);
    if (!primaryCue) return null;

    let secondaryCue: SubtitleCue | undefined;
    if (this.secondaryTrack && this.secondaryTrack.cues.length > 0) {
      secondaryCue = this.secondaryTrack.cues.find((c) => c.startMs <= nowMs && nowMs < c.endMs);
    }

    return {
      id: `pair_${primaryCue.id}`,
      episodeId: this.episodeId,
      primary: primaryCue,
      secondary: secondaryCue,
      alignment: secondaryCue ? 'official-timed' : 'ai-derived',
    };
  }

  public getTokensForCue(cue: SubtitleCue): SubtitleToken[] {
    if (this.tokenCache.has(cue.id)) {
      return this.tokenCache.get(cue.id)!;
    }
    const tokens = tokenizeText(cue.id, cue.text, cue.lang);
    this.tokenCache.set(cue.id, tokens);
    return tokens;
  }

  public getTokenById(tokenId: string): SubtitleToken | null {
    for (const tokens of this.tokenCache.values()) {
      const match = tokens.find((t) => t.id === tokenId);
      if (match) return match;
    }
    return null;
  }

  // --- Vocabulary Storage ---
  public async saveVocabularyCard(card: Omit<VocabularyCard, 'id' | 'createdAt' | 'reviewState'>): Promise<VocabularyCard> {
    const id = `vocab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const fullCard: VocabularyCard = {
      ...card,
      id,
      createdAt: Date.now(),
      reviewState: 'new',
    };

    this.vocabulary.set(id, fullCard);
    await this.persistVocabulary();
    logger.info('Saved vocabulary card:', fullCard.surface);
    return fullCard;
  }

  public getVocabularyCards(): VocabularyCard[] {
    return Array.from(this.vocabulary.values());
  }

  public async deleteVocabularyCard(id: string): Promise<void> {
    this.vocabulary.delete(id);
    await this.persistVocabulary();
  }

  private async loadSavedVocabulary(): Promise<void> {
    try {
      if (typeof browser !== 'undefined' && browser.storage?.sync) {
        const res = await browser.storage.sync.get('owt_saved_vocabulary');
        if (res?.owt_saved_vocabulary && Array.isArray(res.owt_saved_vocabulary)) {
          for (const card of res.owt_saved_vocabulary) {
            this.vocabulary.set(card.id, card);
          }
        }
      }
    } catch {
      // fallback
    }
  }

  private async persistVocabulary(): Promise<void> {
    try {
      if (typeof browser !== 'undefined' && browser.storage?.sync) {
        const list = Array.from(this.vocabulary.values());
        await browser.storage.sync.set({ owt_saved_vocabulary: list });
      }
    } catch {
      // fallback
    }
  }
}

export const globalSubtitleSessionStore = new SubtitleSessionStore();
