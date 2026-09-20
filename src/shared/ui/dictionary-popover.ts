/**
 * AI Dictionary Popover — Interactive click-a-word surface for language learning.
 *
 * Shows:
 * - Word, phonetic reading / Furigana, native TTS pronunciation button
 * - Lemma (base form), Part of Speech
 * - Contextual definition (in-sentence meaning vs general meanings)
 * - Sentence context & translation
 * - Expandable AI Grammar breakdown (segments, syntactic roles, key points, nuance)
 * - Save to SRS vocabulary card action
 * - Accessible keyboard shortcuts (V: voice, S: save, Esc: close)
 */
import { ttsPlayer } from '@/shared/audio/tts-player';
import type { WordAnalysisResult, GrammarExplanation } from '@/core/domain/learning-types';

export interface DictionaryPopoverEntry {
  surface: string;
  sentence: string;
  sentenceTranslation?: string;
  clientX: number;
  clientY: number;
  sourceLang?: string;
  targetLang?: string;
}

export interface DictionaryPopoverCallbacks {
  /** Fetch a one-word gloss or full analysis */
  onLookup(surface: string, sentence?: string): Promise<string | WordAnalysisResult>;
  /** Optional AI grammar explanation query */
  onExplainGrammar?(sentence: string, focusWord?: string): Promise<GrammarExplanation>;
  /** Persist a vocabulary card */
  onSave(entry: {
    surface: string;
    lemma?: string;
    pos?: string;
    phonetic?: string;
    meaning?: string;
    sentence: string;
    sentenceTranslation?: string;
  }): Promise<void>;
}

const POPOVER_ID = 'owt-dictionary-popover';

export class DictionaryPopover {
  private el: HTMLElement | null = null;
  private outsideClickListener: ((e: MouseEvent) => void) | null = null;
  private escapeListener: ((e: KeyboardEvent) => void) | null = null;
  private current: DictionaryPopoverEntry | null = null;
  private currentAnalysis: WordAnalysisResult | null = null;

  constructor(private callbacks: DictionaryPopoverCallbacks) {}

  public show(entry: DictionaryPopoverEntry): void {
    this.current = entry;
    this.currentAnalysis = null;
    this.ensureElement();
    const el = this.el!;
    el.innerHTML = '';

    // ── 1. Header: Word + Phonetic + Audio + Close ──
    const head = document.createElement('div');
    head.className = 'owt-dp-head';

    const wordGroup = document.createElement('div');
    wordGroup.className = 'owt-dp-word-group';

    const word = document.createElement('span');
    word.className = 'owt-dp-word';
    word.textContent = entry.surface;
    wordGroup.appendChild(word);

    const phoneticSpan = document.createElement('span');
    phoneticSpan.className = 'owt-dp-phonetic';
    phoneticSpan.style.display = 'none';
    wordGroup.appendChild(phoneticSpan);

    const ttsBtn = document.createElement('button');
    ttsBtn.className = 'owt-dp-icon-btn owt-dp-tts';
    ttsBtn.title = '朗讀發音 (快速鍵: V)';
    ttsBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
      </svg>
    `;
    ttsBtn.addEventListener('click', () => {
      void ttsPlayer.speak(entry.surface, entry.sourceLang || 'auto');
    });
    wordGroup.appendChild(ttsBtn);

    head.appendChild(wordGroup);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'owt-dp-close';
    closeBtn.textContent = '✕';
    closeBtn.title = '關閉 (Esc)';
    closeBtn.addEventListener('click', () => this.hide());
    head.appendChild(closeBtn);
    el.appendChild(head);

    // ── 2. Morphology bar (Lemma & POS) ──
    const morphBar = document.createElement('div');
    morphBar.className = 'owt-dp-morph';
    morphBar.style.display = 'none';
    el.appendChild(morphBar);

    // ── 3. Meaning / Gloss in Context ──
    const gloss = document.createElement('div');
    gloss.className = 'owt-dp-gloss';
    gloss.textContent = '語境分析中…';
    el.appendChild(gloss);

    // Trigger async lookup
    void this.callbacks
      .onLookup(entry.surface, entry.sentence)
      .then((res) => {
        if (this.current !== entry) return;

        if (typeof res === 'string') {
          gloss.textContent = res || '（無查詞結果）';
        } else if (res && typeof res === 'object') {
          this.currentAnalysis = res;
          gloss.textContent = res.meaningInContext || '（無查詞結果）';

          if (res.phonetic) {
            phoneticSpan.textContent = `[${res.phonetic}]`;
            phoneticSpan.style.display = 'inline-block';
          }

          if (res.pos || (res.lemma && res.lemma.toLowerCase() !== res.word.toLowerCase())) {
            morphBar.style.display = 'flex';
            morphBar.innerHTML = '';
            if (res.pos) {
              const posBadge = document.createElement('span');
              posBadge.className = 'owt-dp-badge';
              posBadge.textContent = res.pos;
              morphBar.appendChild(posBadge);
            }
            if (res.lemma && res.lemma.toLowerCase() !== res.word.toLowerCase()) {
              const lemmaText = document.createElement('span');
              lemmaText.className = 'owt-dp-lemma';
              lemmaText.textContent = `原形: ${res.lemma}`;
              morphBar.appendChild(lemmaText);
            }
          }
        }
      })
      .catch(() => {
        if (this.current === entry) gloss.textContent = '（查詞失敗）';
      });

    // ── 4. Sentence context ──
    if (entry.sentence) {
      const sentence = document.createElement('div');
      sentence.className = 'owt-dp-sentence';
      sentence.textContent = entry.sentence;
      el.appendChild(sentence);
    }
    if (entry.sentenceTranslation) {
      const translation = document.createElement('div');
      translation.className = 'owt-dp-translation';
      translation.textContent = entry.sentenceTranslation;
      el.appendChild(translation);
    }

    // ── 5. AI Grammar Breakdown Expandable Section ──
    if (this.callbacks.onExplainGrammar && entry.sentence) {
      const grammarContainer = document.createElement('div');
      grammarContainer.className = 'owt-dp-grammar-container';

      const grammarToggle = document.createElement('button');
      grammarToggle.className = 'owt-dp-grammar-toggle';
      grammarToggle.innerHTML = `<span>🔍 AI 文法解析</span> <span class="arrow">▼</span>`;

      const grammarBody = document.createElement('div');
      grammarBody.className = 'owt-dp-grammar-body';
      grammarBody.style.display = 'none';

      let loaded = false;
      grammarToggle.addEventListener('click', () => {
        const isHidden = grammarBody.style.display === 'none';
        grammarBody.style.display = isHidden ? 'block' : 'none';
        grammarToggle.querySelector('.arrow')!.textContent = isHidden ? '▲' : '▼';

        if (isHidden && !loaded && this.callbacks.onExplainGrammar) {
          grammarBody.innerHTML = '<div class="owt-dp-grammar-loading">正在拆解文法句構…</div>';
          void this.callbacks
            .onExplainGrammar(entry.sentence, entry.surface)
            .then((explanation) => {
              if (this.current !== entry) return;
              loaded = true;
              this.renderGrammarBody(grammarBody, explanation);
            })
            .catch(() => {
              grammarBody.innerHTML = '<div class="owt-dp-grammar-err">文法解析失敗</div>';
            });
        }
      });

      grammarContainer.appendChild(grammarToggle);
      grammarContainer.appendChild(grammarBody);
      el.appendChild(grammarContainer);
    }

    // ── 6. Actions ──
    const actions = document.createElement('div');
    actions.className = 'owt-dp-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'owt-dp-save';
    saveBtn.textContent = '⭐ 存入生字庫';
    saveBtn.title = '快速鍵: S';

    const performSave = () => {
      void this.callbacks
        .onSave({
          surface: entry.surface,
          lemma: this.currentAnalysis?.lemma,
          pos: this.currentAnalysis?.pos,
          phonetic: this.currentAnalysis?.phonetic,
          meaning: this.currentAnalysis?.meaningInContext || gloss.textContent || undefined,
          sentence: entry.sentence,
          sentenceTranslation: entry.sentenceTranslation,
        })
        .then(() => {
          saveBtn.textContent = '✅ 已存入生字庫';
          saveBtn.disabled = true;
        })
        .catch(() => {
          saveBtn.textContent = '⚠ 儲存失敗';
        });
    };

    saveBtn.addEventListener('click', performSave);
    actions.appendChild(saveBtn);
    el.appendChild(actions);

    // ── Position near the click, clamped to the viewport ──
    el.style.display = 'block';
    const rect = el.getBoundingClientRect();
    const pad = 12;
    let left = entry.clientX + pad;
    let top = entry.clientY + pad;
    if (left + rect.width > window.innerWidth - pad) left = Math.max(pad, entry.clientX - rect.width - pad);
    if (top + rect.height > window.innerHeight - pad) top = Math.max(pad, entry.clientY - rect.height - pad);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;

    this.armDismissal(performSave);
  }

  private renderGrammarBody(container: HTMLElement, exp: GrammarExplanation): void {
    container.innerHTML = '';

    if (exp.difficultyLevel || exp.nuanceOrTone) {
      const metaRow = document.createElement('div');
      metaRow.className = 'owt-dp-grammar-meta';
      if (exp.difficultyLevel) {
        metaRow.innerHTML += `<span class="owt-dp-badge-level">${exp.difficultyLevel}</span>`;
      }
      if (exp.nuanceOrTone) {
        metaRow.innerHTML += `<span class="owt-dp-badge-tone">${exp.nuanceOrTone}</span>`;
      }
      container.appendChild(metaRow);
    }

    if (exp.breakdown && exp.breakdown.length > 0) {
      const list = document.createElement('div');
      list.className = 'owt-dp-breakdown-list';
      for (const item of exp.breakdown) {
        const row = document.createElement('div');
        row.className = 'owt-dp-breakdown-row';
        row.innerHTML = `
          <div class="seg-name"><b>${item.segment}</b> <span class="seg-role">${item.role}</span></div>
          <div class="seg-desc">${item.explanation}</div>
        `;
        list.appendChild(row);
      }
      container.appendChild(list);
    }

    if (exp.keyPoints && exp.keyPoints.length > 0) {
      const kp = document.createElement('div');
      kp.className = 'owt-dp-keypoints';
      kp.innerHTML = '<b>重點總結：</b>' + exp.keyPoints.map((k) => `<span>• ${k}</span>`).join('');
      container.appendChild(kp);
    }
  }

  public hide(): void {
    this.disarmDismissal();
    this.current = null;
    this.currentAnalysis = null;
    if (this.el) this.el.style.display = 'none';
  }

  public dispose(): void {
    this.hide();
    this.el?.remove();
    this.el = null;
  }

  // ── Internals ──────────────────────────────────────────────────────

  private ensureElement(): void {
    if (this.el) return;
    const el = document.createElement('div');
    el.id = POPOVER_ID;
    el.style.position = 'fixed';
    el.style.display = 'none';
    el.style.zIndex = '2147483600';
    el.style.minWidth = '260px';
    el.style.maxWidth = '380px';
    el.style.padding = '12px 14px';
    el.style.borderRadius = '12px';
    el.style.background = 'rgba(17, 17, 22, 0.97)';
    el.style.border = '1px solid rgba(139, 92, 246, 0.4)';
    el.style.boxShadow = '0 10px 32px rgba(0, 0, 0, 0.65)';
    el.style.backdropFilter = 'blur(12px)';
    el.style.color = '#f1f5f9';
    el.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    el.style.fontSize = '13px';
    el.style.lineHeight = '1.5';
    document.body.appendChild(el);
    this.el = el;
    this.injectStyles();
  }

  private injectStyles(): void {
    const styleId = 'owt-dictionary-popover-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
#${POPOVER_ID} .owt-dp-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
#${POPOVER_ID} .owt-dp-word-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
#${POPOVER_ID} .owt-dp-word { font-size: 18px; font-weight: 700; color: #c4b5fd; }
#${POPOVER_ID} .owt-dp-phonetic { font-size: 12px; color: #94a3b8; font-family: monospace; }
#${POPOVER_ID} .owt-dp-icon-btn { background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 6px; color: #a78bfa; padding: 3px 6px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
#${POPOVER_ID} .owt-dp-icon-btn:hover { background: rgba(139, 92, 246, 0.35); color: #f1f5f9; }
#${POPOVER_ID} .owt-dp-close { background: none; border: none; color: #94a3b8; font-size: 13px; cursor: pointer; padding: 2px 4px; }
#${POPOVER_ID} .owt-dp-close:hover { color: #f1f5f9; }
#${POPOVER_ID} .owt-dp-morph { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 11px; }
#${POPOVER_ID} .owt-dp-badge { background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); color: #93c5fd; padding: 1px 6px; border-radius: 4px; font-weight: 600; }
#${POPOVER_ID} .owt-dp-lemma { color: #94a3b8; font-style: italic; }
#${POPOVER_ID} .owt-dp-gloss { font-size: 13.5px; font-weight: 600; color: #e2e8f0; margin-bottom: 8px; white-space: pre-wrap; }
#${POPOVER_ID} .owt-dp-sentence { font-size: 12px; color: #cbd5e1; border-left: 2px solid rgba(139, 92, 246, 0.5); padding-left: 8px; margin-bottom: 4px; }
#${POPOVER_ID} .owt-dp-translation { font-size: 12px; color: #94a3b8; border-left: 2px solid rgba(148, 163, 184, 0.4); padding-left: 8px; margin-bottom: 8px; }
#${POPOVER_ID} .owt-dp-grammar-container { border-top: 1px solid rgba(139, 92, 246, 0.2); margin-top: 6px; padding-top: 6px; margin-bottom: 8px; }
#${POPOVER_ID} .owt-dp-grammar-toggle { width: 100%; background: rgba(139, 92, 246, 0.12); border: 1px dashed rgba(139, 92, 246, 0.35); border-radius: 6px; color: #c4b5fd; font-size: 11.5px; font-weight: 600; padding: 4px 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
#${POPOVER_ID} .owt-dp-grammar-toggle:hover { background: rgba(139, 92, 246, 0.22); }
#${POPOVER_ID} .owt-dp-grammar-body { margin-top: 6px; font-size: 11.5px; color: #e2e8f0; background: rgba(0, 0, 0, 0.3); padding: 8px; border-radius: 6px; max-height: 180px; overflow-y: auto; }
#${POPOVER_ID} .owt-dp-grammar-meta { display: flex; gap: 6px; margin-bottom: 6px; }
#${POPOVER_ID} .owt-dp-badge-level { background: #059669; color: #ecfdf5; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; }
#${POPOVER_ID} .owt-dp-badge-tone { background: #475569; color: #f8fafc; font-size: 10px; padding: 1px 5px; border-radius: 4px; }
#${POPOVER_ID} .owt-dp-breakdown-row { margin-bottom: 5px; line-height: 1.4; border-bottom: 1px solid rgba(255, 255, 255, 0.06); padding-bottom: 4px; }
#${POPOVER_ID} .seg-name { color: #a5b4fc; }
#${POPOVER_ID} .seg-role { color: #94a3b8; font-size: 10.5px; margin-left: 4px; }
#${POPOVER_ID} .seg-desc { color: #cbd5e1; font-size: 11px; margin-top: 1px; }
#${POPOVER_ID} .owt-dp-keypoints { margin-top: 6px; color: #cbd5e1; font-size: 11px; }
#${POPOVER_ID} .owt-dp-actions { display: flex; justify-content: flex-end; }
#${POPOVER_ID} .owt-dp-save { background: rgba(139, 92, 246, 0.25); border: 1px solid rgba(139, 92, 246, 0.5); color: #ddd6fe; font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 8px; cursor: pointer; }
#${POPOVER_ID} .owt-dp-save:hover { background: rgba(139, 92, 246, 0.4); }
#${POPOVER_ID} .owt-dp-save:disabled { opacity: 0.6; cursor: default; }
`;
    (document.head || document.documentElement).appendChild(style);
  }

  private armDismissal(onSaveTrigger?: () => void): void {
    this.disarmDismissal();
    this.outsideClickListener = (e: MouseEvent) => {
      if (this.el?.contains(e.target as Node)) return;
      this.hide();
    };
    this.escapeListener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hide();
      } else if ((e.key === 'v' || e.key === 'V') && this.current) {
        void ttsPlayer.speak(this.current.surface, this.current.sourceLang || 'auto');
      } else if ((e.key === 's' || e.key === 'S') && onSaveTrigger) {
        onSaveTrigger();
      }
    };
    // Defer so the click that OPENED the popover doesn't immediately close it.
    setTimeout(() => {
      if (!this.outsideClickListener) return;
      document.addEventListener('click', this.outsideClickListener, true);
      document.addEventListener('keydown', this.escapeListener!, true);
    }, 0);
  }

  private disarmDismissal(): void {
    if (this.outsideClickListener) {
      document.removeEventListener('click', this.outsideClickListener, true);
      this.outsideClickListener = null;
    }
    if (this.escapeListener) {
      document.removeEventListener('keydown', this.escapeListener, true);
      this.escapeListener = null;
    }
  }
}
