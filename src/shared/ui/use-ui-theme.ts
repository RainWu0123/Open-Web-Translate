import { ref, computed, onMounted, onUnmounted } from 'vue';
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { learningText, type LearningKey } from '@/shared/i18n/learning';

export function useUiTheme(onError: (message: string) => void, language: () => string | undefined = () => 'auto') {
  const error = (key: LearningKey) => onError(learningText(language(), key));
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
    } catch { error('themeReadFailed'); }
  });
  onUnmounted(() => { unwatch?.(); media?.removeEventListener('change', onSystemChange); });
  async function setTheme(value: typeof theme.value) {
    const previous = document.documentElement.dataset.theme as typeof theme.value;
    apply(value);
    try { await SettingsStorage.set({ theme: value }); }
    catch { apply(previous); error('themeSaveFailed'); }
  }
  function onThemeChange(event: Event) {
    return setTheme((event.target as HTMLSelectElement).value as typeof theme.value);
  }
  function toggleTheme() { return setTheme(resolvedTheme.value === 'dark' ? 'light' : 'dark'); }
  return { theme, resolvedTheme, onThemeChange, toggleTheme };
}
