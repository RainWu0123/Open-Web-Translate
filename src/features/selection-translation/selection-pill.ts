/**
 * Selection Translation Pill
 *
 * Listens for user text selection on standard web pages and displays
 * an interactive quick-action pill ("譯") to trigger selection translation.
 */

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
  pill.title = '劃詞翻譯';
  pill.textContent = '譯';
  pill.style.cssText = `
    position: fixed;
    z-index: 2147483600;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.35);
    background: #0d9488;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    font-family: var(--font-ui, system-ui, -apple-system, sans-serif);
    cursor: pointer;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      0 2px 6px rgba(0, 0, 0, 0.25),
      0 4px 12px rgba(13, 148, 136, 0.45);
    padding: 0;
    line-height: 1;
    transition: transform 0.15s ease, filter 0.15s ease;
    user-select: none;
  `;

  pill.addEventListener('pointerenter', () => {
    pill.style.transform = 'scale(1.08)';
  });
  pill.addEventListener('pointerleave', () => {
    pill.style.transform = '';
  });

  const x = Math.min(Math.max(8, rect.left + rect.width / 2 - 15), window.innerWidth - 38);
  const y = rect.top > 40 ? rect.top - 36 : rect.bottom + 6;
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

export function setupSelectionTranslate(onTranslate: (selection: Selection) => Promise<void> | void): () => void {
  const onPointerUp = () => {
    if (selectionHideTimer) clearTimeout(selectionHideTimer);
    selectionHideTimer = setTimeout(() => {
      const selection = window.getSelection();
      if (
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
  };
}
