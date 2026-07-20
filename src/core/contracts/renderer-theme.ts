/** CSS variables for theming */
export interface ThemeVariables {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily?: string;
  fontSize?: string;
}

/** Theme preset definition */
export interface ThemePreset {
  id: string;
  name: string;
  variables: ThemeVariables;
}

/** Full renderer theme configuration */
export interface RendererTheme {
  presets: ThemePreset[];
  activePresetId: string;
  customVariables?: Partial<ThemeVariables>;
}
