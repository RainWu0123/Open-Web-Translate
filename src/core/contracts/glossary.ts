/** Scope for glossary entries */
export type GlossaryScope = "global" | "domain";

/** A single glossary rule */
export interface GlossaryEntry {
  source: string;
  target: string;
  scope: GlossaryScope;
  domain?: string;
}

/** A compiled/resolved glossary ready for a translation request */
export interface ResolvedGlossary {
  id?: string;
  entries: GlossaryEntry[] | Map<string, string>;
}
