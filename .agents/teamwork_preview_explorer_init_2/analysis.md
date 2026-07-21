# Analysis Report: Monolithic UI Component Decomposition (R2)

**Agent**: `teamwork_preview_explorer_init_2`  
**Date**: 2026-07-22  
**Target Milestone**: R2 — Monolithic UI Component Decomposition  
**Scope**: `src/entrypoints/options/App.vue`, `src/entrypoints/popup/App.vue`, `src/components/`

---

## 1. Overview & Problem Statement

Currently, `src/entrypoints/options/App.vue` is a 1,223-line monolithic Vue component containing all options logic:
- Sidebar navigation tab switching (`general`, `providers`, `vocabulary`)
- Embedded i18n translation dictionary (`en`, `zh-Hant`, `ja`) with 40+ key-value pairs per language
- General settings controls (translation enable toggle, target language select, display layout mode, translation mode, UI language, floating button toggle)
- Subtitle style controls (original font size range, translated font size range, original color picker, translated color picker)
- Provider engine & API key management (Gemini model preset selector, custom model ID validator, Gemini API key input/masking/clear, DeepL API key input/masking/clear)
- Saved Vocabulary Workbench manager (item list rendering, timestamped YouTube link rendering, single item deletion, clear all confirmation, CSV/Anki export)

Similarly, `src/entrypoints/popup/App.vue` (395 lines) duplicates several setting controls (translation toggle, target language selector, unconfigured Gemini banner, translate page button, restore page button, option link).

### Issues Identified:
1. **Monolithic Maintenance Overhead**: Any addition to settings or vocabulary UI requires modifying a massive 1,220+ line file (`options/App.vue`).
2. **Duplicated Logic & UI**: Setting controls (like language selectors and toggles) and status banners are duplicated between Options and Popup without shared components.
3. **Hardcoded Styling & Lack of Theme System**: Dark mode styles are currently hardcoded with static hex colors (`#0f172a`, `#1e293b`, `#1a1a2e`), making theme switching (light/dark/system) impossible without CSS refactoring.
4. **Lack of Component Reusability**: `src/components/` only contains an unused `HelloWorld.vue` template file.

---

## 2. Existing Codebase Breakdown

### A. Monolith Inspection (`src/entrypoints/options/App.vue`)
- **Lines 1–326 (Template)**:
  - Sidebar Navigation (lines 4–32)
  - General Settings Panel (lines 37–155)
  - Provider Settings Panel (lines 158–284)
  - Vocabulary Workbench Panel (lines 286–324)
- **Lines 328–738 (Script Setup)**:
  - i18n Dictionary (`translations` object, lines 341–477)
  - Model Registry helper imports (`getActiveVerifiedModels`, `getDeprecatedButFunctionalModels`, `validateModelId`, `findModelEntry`, `DEFAULT_MODEL_ID`)
  - State variables: `activeTab`, `settings`, `apiKeyInput`, `keyMessage`, `deeplKeyInput`, `deeplKeyMessage`, `selectedModelPreset`, `customModelInput`, `modelValidationError`, `vocabItems`
  - Message handling via `messageRouter.sendMessage` (`GET_SETTINGS`, `UPDATE_SETTINGS`, `GET_VOCAB_ITEMS`, `DELETE_VOCAB_ITEM`, `CLEAR_VOCAB_ITEMS`)
  - Export functionality via `VocabularyExporter.downloadCSV`
- **Lines 740–1223 (Scoped CSS Styles)**:
  - Custom toggle switch CSS (lines 890–930)
  - Custom selects, inputs, badges, buttons, ranges, and color pickers
  - Custom vocabulary list item layout and empty state styling

### B. Popup Monolith Inspection (`src/entrypoints/popup/App.vue`)
- **Template & Script**: Handles popup header, setting rows (`enabled`, `targetLanguage`), warning banner for unconfigured Gemini API key, action buttons for active tab translation and restoration, and footer options link.
- **CSS**: Scoped dark theme styles (`#1a1a2e`, `#667eea`).

### C. CSS & Framework Inspection
- `package.json` relies on native Vue 3 (`^3.5.29`) and WXT (`^0.20.27`). No external UI component library (e.g. Element Plus, Vuetify) or utility CSS framework (e.g. Tailwind CSS, UnoCSS) is installed.
- Global styles: `src/entrypoints/options/style.css` (lines 1–6) and `src/entrypoints/popup/style.css` (lines 1–9) set minimal body background and margins.
- **Conclusion for Styling**: We will use standard Vue Scoped CSS paired with global CSS Custom Properties (`:root` / `[data-theme]`) for theme tokens to ensure light/dark theme compatibility without external dependencies.

---

## 3. Component Decomposition Plan

We decompose the monolithic pages into four cohesive, reusable components under `src/components/`:

```
src/components/
├── ProviderConfigCard.vue   # Engine selection & API key configuration card
├── DisplaySettings.vue      # Display modes, language options, subtitle styles
├── GlossaryManager.vue      # Vocabulary workbench & glossary list management
├── ThemeToggle.vue          # Light / Dark / System theme switcher
└── ui/                      # Base primitive controls (optional sub-components)
    ├── ToggleSwitch.vue     # Reusable boolean toggle
    ├── SelectInput.vue      # Reusable styled select dropdown
    └── RangeSlider.vue      # Reusable slider input with value badge
```

---

### Component 1: `ProviderConfigCard.vue`

- **Target File**: `src/components/ProviderConfigCard.vue`
- **Purpose**: Encapsulates engine selection (Google free, Gemini API, DeepL API, Mock) and provider-specific credential/model configurations.

#### Interface Specifications:
```typescript
// Props
interface ProviderConfigCardProps {
  activeProviderId: string;
  hasGeminiApiKey: boolean;
  geminiApiKeyMasked: string;
  geminiModel: string;
  hasDeeplApiKey: boolean;
  deeplApiKeyMasked: string;
  activeModels: GeminiModelEntry[];
  deprecatedModels: GeminiModelEntry[];
  t: (key: string) => string;
}

// Events (Emits)
interface ProviderConfigCardEmits {
  (e: 'update:activeProviderId', providerId: string): void;
  (e: 'saveGeminiKey', key: string): void;
  (e: 'clearGeminiKey'): void;
  (e: 'saveGeminiModel', modelId: string): void;
  (e: 'saveDeeplKey', key: string): void;
  (e: 'clearDeeplKey'): void;
}
```

#### Internal Reactive State & Behaviors:
- Presets vs Custom model selection (`selectedModelPreset`, `customModelInput`).
- Validation state (`modelValidationError`) using `validateModelId`.
- API Key input text buffers (`apiKeyInput`, `deeplKeyInput`).
- Success/Error notification messages (`keyMessage`, `deeplKeyMessage`).

---

### Component 2: `DisplaySettings.vue`

- **Target File**: `src/components/DisplaySettings.vue`
- **Purpose**: Controls general layout settings, translation modes, interface language, floating quick-translate button, and subtitle styling customization. Reusable in both Options page (full mode) and Popup page (compact mode).

#### Interface Specifications:
```typescript
// Props
interface DisplaySettingsProps {
  settings: ExtensionSettings;
  t: (key: string) => string;
  compact?: boolean; // If true, renders simplified mode for Popup
}

// Events (Emits)
interface DisplaySettingsEmits {
  (e: 'update:settings', updated: Partial<ExtensionSettings>): void;
  (e: 'change', key: keyof ExtensionSettings, value: any): void;
}
```

#### Rendered Sub-sections (Full Mode):
1. **General Translation**: Enable switch, Target Language selector.
2. **Layout & Execution Mode**: Display Layout Mode (Bilingual, Translation-First, Immersive), Translation Mode (Fast / Quality).
3. **UI & Accessibility**: Interface Language select, Floating Button toggle.
4. **Subtitle Styling**: Subtitle Original/Translated Font Size sliders (12–32px, 14–40px) and Color pickers with live HEX indicators.

---

### Component 3: `GlossaryManager.vue`

- **Target File**: `src/components/GlossaryManager.vue`
- **Purpose**: Encapsulates saved vocabulary items and glossary management (display, search/filter, delete single item, clear all, export CSV/Anki format).

#### Interface Specifications:
```typescript
// Props
interface GlossaryManagerProps {
  items: VocabItem[];
  t: (key: string) => string;
  loading?: boolean;
}

// Events (Emits)
interface GlossaryManagerEmits {
  (e: 'deleteItem', id: string): void;
  (e: 'clearAll'): void;
  (e: 'exportCsv'): void;
  (e: 'refresh'): void;
}
```

#### Internal Reactive State & Behaviors:
- Search filter buffer (`searchQuery: ref<string>('')`) to quickly search saved terms/translations.
- Confirmation dialog state for clearing vocabulary.
- Rendering of timestamped YouTube links (`item.url`) with external icon badge `📺`.
- Empty state fallback UI when `items.length === 0`.

---

### Component 4: `ThemeToggle.vue`

- **Target File**: `src/components/ThemeToggle.vue`
- **Purpose**: Theme selection control (Light / Dark / System) with persistence and automatic application of theme attributes to `document.documentElement`.

#### Interface Specifications:
```typescript
type ThemeMode = 'light' | 'dark' | 'system';

// Props
interface ThemeToggleProps {
  modelValue?: ThemeMode;
  compact?: boolean; // Icon button toggle mode for headers
}

// Events (Emits)
interface ThemeToggleEmits {
  (e: 'update:modelValue', theme: ThemeMode): void;
}
```

#### Internal Logic & Theme Strategy:
- Listens to system theme changes via `window.matchMedia('(prefers-color-scheme: dark)')`.
- Sets `data-theme="light"` or `data-theme="dark"` on `document.documentElement`.
- Emits changes to caller for persistence in `ExtensionSettings`.

---

## 4. Theme & Styling Strategy (Light/Dark Support)

To provide clean light/dark theme support without adding external CSS framework dependencies, we define a centralized CSS variable palette in `src/assets/styles/tokens.css`:

```css
:root, [data-theme="dark"] {
  --bg-primary: #0f172a;
  --bg-secondary: #1e293b;
  --bg-card: #1e293b;
  --bg-input: #0f172a;
  --text-primary: #f8fafc;
  --text-secondary: #cbd5e1;
  --text-muted: #94a3b8;
  --border-color: #334155;
  --primary-accent: #2563eb;
  --primary-hover: #1d4ed8;
  --accent-badge-bg: rgba(16, 185, 129, 0.15);
  --accent-badge-text: #34d399;
}

[data-theme="light"] {
  --bg-primary: #f8fafc;
  --bg-secondary: #ffffff;
  --bg-card: #ffffff;
  --bg-input: #f1f5f9;
  --text-primary: #0f172a;
  --text-secondary: #334155;
  --text-muted: #64748b;
  --border-color: #e2e8f0;
  --primary-accent: #2563eb;
  --primary-hover: #1d4ed8;
  --accent-badge-bg: rgba(16, 185, 129, 0.1);
  --accent-badge-text: #059669;
}
```

All decomposed Vue SFCs will reference `var(--bg-card)`, `var(--text-primary)`, etc. within their scoped styles.

---

## 5. Proposed Refactoring Steps for Implementation Team

1. **Step 1: Create Global Theme Tokens & ThemeToggle Component**:
   - Create `src/assets/styles/tokens.css` with CSS variables.
   - Create `src/components/ThemeToggle.vue`.
2. **Step 2: Create Sub-Components**:
   - Build `ProviderConfigCard.vue` with prop/emit interfaces.
   - Build `DisplaySettings.vue` with full and compact mode support.
   - Build `GlossaryManager.vue` with search filter and item management.
3. **Step 3: Refactor `options/App.vue`**:
   - Import and integrate `ThemeToggle`, `DisplaySettings`, `ProviderConfigCard`, and `GlossaryManager`.
   - Reduce file size from 1,223 lines to under 150 lines.
4. **Step 4: Refactor `popup/App.vue`**:
   - Integrate `DisplaySettings.vue` with `compact: true`.
   - Integrate `ThemeToggle.vue` into the header.
5. **Step 5: Verification**:
   - Run `pnpm compile` / `pnpm typecheck` to confirm Vue TypeScript types.
   - Run `pnpm test` to ensure unit test suite passes.

