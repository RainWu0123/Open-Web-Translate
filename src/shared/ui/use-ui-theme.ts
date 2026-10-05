import { ref, onMounted, onUnmounted } from 'vue';
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';

export function useUiTheme(onError: (message: string) => void) {
  const theme = ref<'light' | 'dark' | 'system'>('system');
  let unwatch: (() => void) | undefined;
  function apply(value: 'light' | 'dark' | 'system' = 'system') {
    theme.value = value;
    document.documentElement.dataset.theme = value;
  }
  onMounted(async () => {
    try {
      apply((await SettingsStorage.get()).theme ?? 'system');
      unwatch = SettingsStorage.watch(settings => apply(settings.theme ?? 'system'));
    } catch { onError('無法讀取外觀設定，請重新開啟擴充功能。'); }
  });
  onUnmounted(() => unwatch?.());
  async function onThemeChange(event: Event) {
    const previous = document.documentElement.dataset.theme as typeof theme.value;
    const value = (event.target as HTMLSelectElement).value as typeof theme.value;
    apply(value);
    try { await SettingsStorage.set({ theme: value }); }
    catch { apply(previous); onError('外觀設定未儲存，請再試一次。'); }
  }
  return { theme, onThemeChange };
}
