import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import FlashcardWorkbench from '../../../src/components/learning/FlashcardWorkbench.vue';
import type { LearningCard } from '../../../src/core/domain/learning-types';

describe('FlashcardWorkbench.vue Component Tests', () => {
  const sampleCards: LearningCard[] = [
    {
      id: 'c1',
      word: 'perspicacious',
      lemma: 'perspicacious',
      pos: 'adjective',
      phonetic: 'ˌpɜː.spɪˈkeɪ.ʃəs',
      meaning: '有洞察力的，敏銳的',
      contextSentence: 'She was perspicacious enough to realize the scheme.',
      contextTranslation: '她非常敏銳，足以識破這個陰謀。',
      sourceLang: 'en',
      targetLang: 'zh-Hant',
      tags: ['vocab'],
      srs: {
        interval: 0,
        repetition: 0,
        easeFactor: 2.5,
        nextReviewDate: Date.now() - 1000, // Due
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'c2',
      word: 'serendipity',
      lemma: 'serendipity',
      pos: 'noun',
      phonetic: 'ˌser.ənˈdɪp.ə.ti',
      meaning: '機緣湊巧，意外收穫',
      contextSentence: 'A fortunate stroke of serendipity.',
      sourceLang: 'en',
      targetLang: 'zh-Hant',
      tags: ['vocab'],
      srs: {
        interval: 0,
        repetition: 0,
        easeFactor: 2.5,
        nextReviewDate: Date.now() - 1000, // Due
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  it('renders front face with cloze sentence and word', () => {
    const wrapper = mount(FlashcardWorkbench, {
      props: { cards: sampleCards },
    });

    expect(wrapper.find('[data-testid="fc-card-word"]').text()).toBe('perspicacious');
    expect(wrapper.find('.context-cloze').html()).toContain('cloze-blank');
    expect(wrapper.find('[data-testid="fc-grade-actions"]').exists()).toBe(false);
  });

  it('flips to back face and reveals meaning and grade buttons upon click', async () => {
    const wrapper = mount(FlashcardWorkbench, {
      props: { cards: sampleCards },
    });

    const card = wrapper.find('[data-testid="fc-card"]');
    await card.trigger('click');

    expect(wrapper.find('[data-testid="fc-card-meaning"]').text()).toBe('有洞察力的，敏銳的');
    expect(wrapper.find('[data-testid="fc-grade-actions"]').exists()).toBe(true);
  });

  it('emits review event with selected grade and advances to next card', async () => {
    const wrapper = mount(FlashcardWorkbench, {
      props: { cards: sampleCards },
    });

    // Flip card 1
    await wrapper.find('[data-testid="fc-card"]').trigger('click');

    // Click 'good'
    const goodBtn = wrapper.find('[data-testid="grade-good-btn"]');
    await goodBtn.trigger('click');

    expect(wrapper.emitted('review')?.[0]).toEqual(['c1', 'good']);

    // Should now show card 2
    expect(wrapper.find('[data-testid="fc-card-word"]').text()).toBe('serendipity');

    // Flip and finish card 2
    await wrapper.find('[data-testid="fc-card"]').trigger('click');
    await wrapper.find('[data-testid="grade-easy-btn"]').trigger('click');

    expect(wrapper.emitted('review')?.[1]).toEqual(['c2', 'easy']);

    // Should show completion summary
    expect(wrapper.find('[data-testid="fc-summary"]').exists()).toBe(true);
  });
});
