/**
 * Dictionary popover — the click-a-word surface of the learning mode.
 *
 * Shows the clicked token, the sentence it came from, the sentence's
 * translation, a one-word gloss fetched on demand, and a save-to-vocabulary
 * action. Deliberately NOT a dictionary engine: the gloss comes from the
 * caller (machine translation of the word in isolation); serious dictionary
 * depth (JMdict / Yomitan-grade) is a future module behind the same
 * `onLookup` seam.
 *
 * Plain DOM (content-script friendly, no Vue mount). Interface:
 * show(entry) · hide() · dispose().
 */

export interface DictionaryPopoverEntry {
  surface: string;
  sentence: string;
  sentenceTranslation?: string;
  clientX: number;
  clientY: number;
}

export interface DictionaryPopoverCallbacks {
  /** Fetch a one-word gloss; resolve with '' when unavailable. */
  onLookup(surface: string): Promise<string>;
  /** Persist a vocabulary card; resolve with an error message on failure. */
  onSave(entry: { surface: string; sentence: string; sentenceTranslation?: string }): Promise<void>;
}

const POPOVER_ID = 'owt-dictionary-popover';

export class DictionaryPopover {
  private el: HTMLElement | null = null;
  private outsideClickListener: ((e: MouseEvent) => void) | null = null;
  private escapeListener: ((e: KeyboardEvent) => void) | null = null;
  private current: DictionaryPopoverEntry | null = null;

  constructor(private callbacks: DictionaryPopoverCallbacks) {}

  public show(entry: DictionaryPopoverEntry): void {
    this.current = entry;
    this.ensureElement();
    const el = this.el!;
    el.innerHTML = '';

    // ── header: the word ──
    const head = document.createElement('div');
    head.className = 'owt-dp-head';
    const word = document.createElement('span');
    word.className = 'owt-dp-word';
    word.textContent = entry.surface;
    head.appendChild(word);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'owt-dp-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this.hide());
    head.appendChild(closeBtn);
    el.appendChild(head);

    // ── gloss (async) ──
    const gloss = document.createElement('div');
    gloss.className = 'owt-dp-gloss';
    gloss.textContent = '查詢中…';
    el.appendChild(gloss);
    void this.callbacks
      .onLookup(entry.surface)
      .then((text) => {
        if (this.current === entry) {
          gloss.textContent = text || '（無查詞結果）';
        }
      })
      .catch(() => {
        if (this.current === entry) gloss.textContent = '（查詞失敗）';
      });

    // ── sentence context ──
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

    // ── actions ──
    const actions = document.createElement('div');
    actions.className = 'owt-dp-actions';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'owt-dp-save';
    saveBtn.textContent = '⭐ 存單字';
    saveBtn.addEventListener('click', () => {
      void this.callbacks
        .onSave({
          surface: entry.surface,
          sentence: entry.sentence,
          sentenceTranslation: entry.sentenceTranslation,
        })
        .then(() => {
          saveBtn.textContent = '✅ 已儲存';
          saveBtn.disabled = true;
        })
        .catch(() => {
          saveBtn.textContent = '⚠ 儲存失敗';
        });
    });
    actions.appendChild(saveBtn);
    el.appendChild(actions);

    // ── position near the click, clamped to the viewport ──
    el.style.display = 'block';
    const rect = el.getBoundingClientRect();
    const pad = 12;
    let left = entry.clientX + pad;
    let top = entry.clientY + pad;
    if (left + rect.width > window.innerWidth - pad) left = Math.max(pad, entry.clientX - rect.width - pad);
    if (top + rect.height > window.innerHeight - pad) top = Math.max(pad, entry.clientY - rect.height - pad);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;

    this.armDismissal();
  }

  public hide(): void {
    this.disarmDismissal();
    this.current = null;
    if (this.el) this.el.style.display = 'none';
  }

  public dispose(): void {
    this.hide();
    this.el?.remove();
    this.el = null;
  }

  // ── internals ──────────────────────────────────────────────────────

  private ensureElement(): void {
    if (this.el) return;
    const el = document.createElement('div');
    el.id = POPOVER_ID;
    el.style.position = 'fixed';
    el.style.display = 'none';
    el.style.zIndex = '2147483600';
    el.style.minWidth = '240px';
    el.style.maxWidth = '360px';
    el.style.padding = '12px 14px';
    el.style.borderRadius = '12px';
    el.style.background = 'rgba(17, 17, 22, 0.96)';
    el.style.border = '1px solid rgba(139, 92, 246, 0.4)';
    el.style.boxShadow = '0 10px 32px rgba(0, 0, 0, 0.6)';
    el.style.backdropFilter = 'blur(10px)';
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
#${POPOVER_ID} .owt-dp-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px; }
#${POPOVER_ID} .owt-dp-word { font-size: 18px; font-weight: 700; color: #c4b5fd; }
#${POPOVER_ID} .owt-dp-close { background: none; border: none; color: #94a3b8; font-size: 13px; cursor: pointer; padding: 2px 4px; }
#${POPOVER_ID} .owt-dp-close:hover { color: #f1f5f9; }
#${POPOVER_ID} .owt-dp-gloss { font-size: 13px; color: #e2e8f0; margin-bottom: 8px; white-space: pre-wrap; }
#${POPOVER_ID} .owt-dp-sentence { font-size: 12px; color: #cbd5e1; border-left: 2px solid rgba(139, 92, 246, 0.5); padding-left: 8px; margin-bottom: 4px; }
#${POPOVER_ID} .owt-dp-translation { font-size: 12px; color: #94a3b8; border-left: 2px solid rgba(148, 163, 184, 0.4); padding-left: 8px; margin-bottom: 8px; }
#${POPOVER_ID} .owt-dp-actions { display: flex; justify-content: flex-end; }
#${POPOVER_ID} .owt-dp-save { background: rgba(139, 92, 246, 0.25); border: 1px solid rgba(139, 92, 246, 0.5); color: #ddd6fe; font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 8px; cursor: pointer; }
#${POPOVER_ID} .owt-dp-save:hover { background: rgba(139, 92, 246, 0.4); }
#${POPOVER_ID} .owt-dp-save:disabled { opacity: 0.6; cursor: default; }
`;
    (document.head || document.documentElement).appendChild(style);
  }

  private armDismissal(): void {
    this.disarmDismissal();
    this.outsideClickListener = (e: MouseEvent) => {
      if (this.el?.contains(e.target as Node)) return;
      this.hide();
    };
    this.escapeListener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.hide();
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
