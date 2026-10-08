import { describe, expect, it } from 'vitest';
import { languageOutputInstruction } from '@/infrastructure/providers/language-output-instructions';

describe('languageOutputInstruction', () => {
  it('strictly distinguishes Traditional and Simplified Chinese output', () => {
    const traditional = languageOutputInstruction('zh-Hant');
    const simplified = languageOutputInstruction('zh-Hans');

    expect(traditional).toContain('Traditional Chinese');
    expect(traditional).toContain('Taiwan-standard');
    expect(traditional).toContain('Never output Simplified Chinese');
    expect(simplified).toContain('Simplified Chinese');
  });

  it.each(['en', 'ja', 'ko', 'es'])('provides a language-specific rule for %s', (language) => {
    const instruction = languageOutputInstruction(language);
    expect(instruction).toContain('TARGET LANGUAGE REQUIREMENT');
    expect(instruction).not.toContain('BCP 47');
  });

  it('provides a safe default for any additional BCP 47 language', () => {
    expect(languageOutputInstruction('nl-BE')).toContain('BCP 47 code "nl-BE"');
  });
});

