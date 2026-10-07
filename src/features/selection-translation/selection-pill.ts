/**
 * Selection Translation Pill
 *
 * Listens for user text selection on standard web pages and displays
 * an interactive quick-action pill ("譯") to trigger selection translation.
 */
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { translate } from '@/shared/i18n';

let selectionUiLanguage: string = 'auto';
let selectionPill: HTMLElement | null = null;
let selectionHideTimer: ReturnType<typeof setTimeout> | null = null;

export function isInsideOwnUi(node: Node | null): boolean {
  if (!node) return false;
  const el = node instanceof HTMLElement ? node : node.parentElement;
  if (!el) return false;
  return Boolean(
    el.closest?.(
      '#owt-floating-badge-host, #owt-netflix-overlay-host, #owt-dictionary-popover, #owt-netflix-selector-menu, #owt-selection-pill',
    ),
  );
}

export function hideSelectionPill(): void {
  selectionPill?.remove();
  selectionPill = null;
}

export function showSelectionPill(rect: DOMRect, onTranslate: (selection: Selection) => void): void {
  hideSelectionPill();

  const pill = document.createElement('button');
  pill.id = 'owt-selection-pill';
  pill.type = 'button';
  pill.title = translate(selectionUiLanguage, 'selection.translateTitle');
  pill.textContent = translate(selectionUiLanguage, 'selection.pill');
  pill.style.cssText = `
    position: fixed;
    z-index: 2147483600;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: #0c0d10;
    color: #fafafa;
    font-size: 12px;
    font-weight: 700;
    font-family: var(--font-ui, system-ui, -apple-system, sans-serif);
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    padding: 0;
    line-height: 1;
    transition: transform 0.15s ease, filter 0.15s ease;
    user-select: none;
  `;

  pill.addEventListener('pointerenter', () => {
    pill.style.transform = 'scale(1.03)';
  });
  pill.addEventListener('pointerleave', () => {
    pill.style.transform = '';
  });

  const x = Math.min(Math.max(8, rect.left + rect.width / 2 - 16), window.innerWidth - 40);
  const y = rect.top > 40 ? rect.top - 40 : rect.bottom + 6;
  pill.style.left = `${x}px`;
  pill.style.top = `${y}px`;

  pill.addEventListener('pointerdown', (e) => e.stopPropagation());
  pill.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const selection = window.getSelection();
    hideSelectionPill();
    if (!selection || selection.isCollapsed) return;
    onTranslate(selection);
  });

  document.body.appendChild(pill);
  selectionPill = pill;
}

export function setupSelectionTranslate(onTranslate: (selection: Selection) => Promise<void> | void, isEnabled: () => boolean = () => true): () => void {
  void SettingsStorage.get().then((settings) => {
    selectionUiLanguage = settings.uiLanguage || 'auto';
  }).catch(() => {});
  const unwatchSettings = SettingsStorage.watch((settings) => {
    selectionUiLanguage = settings.uiLanguage || 'auto';
  });

  const onPointerUp = () => {
    if (selectionHideTimer) clearTimeout(selectionHideTimer);
    selectionHideTimer = setTimeout(() => {
      const selection = window.getSelection();
      if (
        !isEnabled() ||
        !selection ||
        selection.isCollapsed ||
        isInsideOwnUi(selection.anchorNode) ||
        isInsideOwnUi(selection.focusNode)
      ) {
        hideSelectionPill();
        return;
      }
      const text = selection.toString().trim();
      if (text.length < 2 || text.length > 5000) {
        hideSelectionPill();
        return;
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      showSelectionPill(rect, onTranslate);
    }, 250);
  };

  const onPointerDown = (e: MouseEvent | PointerEvent) => {
    if (!isInsideOwnUi(e.target as Node)) hideSelectionPill();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') hideSelectionPill();
  };

  const onScroll = () => hideSelectionPill();

  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('scroll', onScroll, { passive: true, capture: true });

  return () => {
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('scroll', onScroll);
    hideSelectionPill();
    unwatchSettings();
  };
}
