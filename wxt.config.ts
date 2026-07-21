import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue'],
  manifest: ({ browser }) => ({
    name: 'Open Web Translate',
    version: '0.1.0',
    description: 'An open-source browser translation extension.',
    permissions: [
      'activeTab',
      'storage',
      'contextMenus',
      'scripting',
      '<all_urls>',
      ...(browser === 'firefox' ? ['<all_urls>'] : []),
    ],
    host_permissions: [
      '*://*/*',
      '<all_urls>',
      'https://generativelanguage.googleapis.com/*',
      'https://api-free.deepl.com/*',
      'https://api.deepl.com/*',
      'https://translate.googleapis.com/*',
    ],
    options_ui: {
      open_in_tab: true,
    },
    web_accessible_resources: [
      {
        resources: ['netflix-main.js'],
        matches: ['*://*.netflix.com/*'],
      },
    ],
  }),
});
