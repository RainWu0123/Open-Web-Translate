import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
const EXTENSION_ICONS = {
  16: 'icon/16.png',
  32: 'icon/32.png',
  48: 'icon/48.png',
  96: 'icon/96.png',
  128: 'icon/128.png',
} as const;

export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  modules: ['@wxt-dev/module-vue'],
  manifest: () => ({
    name: 'Open Web Translate',
    // `version` is intentionally omitted: WXT derives it from package.json,
    // so the manifest can no longer drift from the released version.
    description: 'An open-source browser translation extension.',
    // Declare icons explicitly instead of relying on framework inference.
    // Firefox/AMO uses manifest.icons for the add-on listing and about:addons;
    // action.default_icon covers the browser toolbar.
    icons: EXTENSION_ICONS,
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
        strict_min_version: '142.0',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
    action: {
      default_title: '開啟 Open Web Translate 設定',
      default_icon: EXTENSION_ICONS,
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
