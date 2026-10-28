import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FlashcardWorkbench from '@/components/learning/FlashcardWorkbench.vue';
import GlossaryManager from '@/components/GlossaryManager.vue';
import { learningText } from '@/shared/i18n/learning';
import { SrsEngine } from '@/core/learning/srs-engine';

describe('learning interface languages', () => {
  it.each([
    ['en', 'No saved words yet', 'Saved words'],
    ['ja', '保存した単語はまだありません', '保存した単語'],
    ['zh-Hans', '还没有收藏的单词', '收藏清单'],
    ['zh-Hant', '還沒有收藏的單字', '收藏清單'],
  ])('renders empty review and vocabulary in %s', (language, reviewTitle, vocabularyTitle) => {
    const review = mount(FlashcardWorkbench, { props: { cards: [], language } });
    const glossary = mount(GlossaryManager, { props: { items: [], language } });
    expect(review.text()).toContain(reviewTitle);
    expect(glossary.text()).toContain(vocabularyTitle);
    review.unmount(); glossary.unmount();
  });

  it('updates the visible text when a user changes language', async () => {
    const wrapper = mount(FlashcardWorkbench, { props: { cards: [], language: 'en' } });
    await wrapper.setProps({ language: 'ja' });
    expect(wrapper.text()).toContain('保存した単語はまだありません');
    expect(wrapper.text()).not.toContain('No saved words yet');
    wrapper.unmount();
  });

  it.each([
    ['en', 'Show answer', 'Again'],
    ['ja', '答えを見る', 'もう一度'],
    ['zh-Hans', '查看答案', '生疏'],
    ['zh-Hant', '點擊看答案', '生疏'],
  ])('localizes an active review card in %s', async (language, reveal, grade) => {
    const card = { id: '1', word: 'apple', lemma: 'apple', meaning: 'fruit', contextSentence: '',
      sourceLang: 'en', targetLang: 'ja', tags: [], srs: SrsEngine.createInitialState(), createdAt: 0, updatedAt: 0 };
    const wrapper = mount(FlashcardWorkbench, { props: { cards: [card], language } });
    expect(wrapper.text()).toContain(reveal);
    await wrapper.get('[data-testid="fc-card"]').trigger('click');
    expect(wrapper.get('[data-testid="grade-again-btn"]').text()).toContain(grade);
    wrapper.unmount();
  });

  it('interpolates dynamic review and vocabulary text', () => {
    expect(learningText('en', 'counter', { current: 2, total: 5 })).toBe('Card 2 / 5');
    expect(learningText('ja', 'reviewCount', { count: 3 })).toContain('3');
    expect(learningText('zh-Hans', 'days', { count: 4 })).toBe('4 天后');
  });
});
