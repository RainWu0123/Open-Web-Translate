import { ref, computed, onMounted, onUnmounted } from 'vue';
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';

export function useUiTheme(onError: (message: string) => void) {
  const theme = ref<'light' | 'dark' | 'system'>('system');
  const systemDark = ref(false);
  const resolvedTheme = computed(() => theme.value === 'system' ? (systemDark.value ? 'dark' : 'light') : theme.value);
  let media: MediaQueryList | undefined;
  const onSystemChange = (event: MediaQueryListEvent) => { systemDark.value = event.matches; };
  let unwatch: (() => void) | undefined;
  function apply(value: 'light' | 'dark' | 'system' = 'system') {
    theme.value = value;
    document.documentElement.dataset.theme = value;
  }
  onMounted(async () => {
    if (typeof window.matchMedia === 'function') {
      media = window.matchMedia('(prefers-color-scheme: dark)');
      systemDark.value = media.matches;
      media.addEventListener('change', onSystemChange);
    }
    try {
      apply((await SettingsStorage.get()).theme ?? 'system');
      unwatch = SettingsStorage.watch(settings => apply(settings.theme ?? 'system'));
    } catch { onError('無法讀取外觀設定，請重新開啟擴充功能。'); }
  });
  onUnmounted(() => { unwatch?.(); media?.removeEventListener('change', onSystemChange); });
  async function setTheme(value: typeof theme.value) {
    const previous = document.documentElement.dataset.theme as typeof theme.value;
    apply(value);
    try { await SettingsStorage.set({ theme: value }); }
    catch { apply(previous); onError('外觀設定未儲存，請再試一次。'); }
  }
  function onThemeChange(event: Event) {
    return setTheme((event.target as HTMLSelectElement).value as typeof theme.value);
  }
  function toggleTheme() { return setTheme(resolvedTheme.value === 'dark' ? 'light' : 'dark'); }
  return { theme, resolvedTheme, onThemeChange, toggleTheme };
}
