import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue'],
  manifest: () => ({
    name: 'Open Web Translate',
    // `version` is intentionally omitted: WXT derives it from package.json,
    // so the manifest can no longer drift from the released version.
    description: 'An open-source browser translation extension.',
    permissions: [
      'activeTab',
      'storage',
      'contextMenus',
      'scripting',
    ],
    host_permissions: [
      '*://*/*',
      'https://generativelanguage.googleapis.com/*',
      'https://api-free.deepl.com/*',
      'https://api.deepl.com/*',
      'https://translate.googleapis.com/*',
    ],
    browser_specific_settings: {
      gecko: {
        id: 'open-web-translate@rainwu.org',
        strict_min_version: '109.0',
      },
    },
    action: {
      default_title: '開啟 Open Web Translate 設定',
    },
    web_accessible_resources: [
      {
        resources: ['netflix-main.js'],
        matches: ['*://*.netflix.com/*'],
      },
      {
        resources: ['youtube-main.js'],
        matches: ['*://*.youtube.com/*'],
      },
    ],
  }),
});
