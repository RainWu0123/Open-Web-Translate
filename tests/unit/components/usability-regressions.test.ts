import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Flashcards from '@/components/learning/FlashcardWorkbench.vue';
import Glossary from '@/components/GlossaryManager.vue';
import type { LearningCard } from '@/core/domain/learning-types';
import { SrsEngine } from '@/core/learning/srs-engine';

const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.restoreAllMocks(); });
const card = (id: string): LearningCard => ({ id, word: id, lemma: id, contextSentence: '', meaning: '意思', sourceLang: 'en', targetLang: 'zh-Hant', tags: [], srs: SrsEngine.createInitialState(), createdAt: Date.now(), updatedAt: Date.now() });
function render(props: any) { const wrapper = mount(Flashcards, { props }); wrappers.push(wrapper); return wrapper; }

describe('Learning flows use real data and confirmed saves', () => {
  it('shows an honest empty state and no fabricated linguistic information', async () => {
    const empty = render({ cards: [] });
    expect(empty.text()).toContain('還沒有收藏的單字');
    expect(empty.find('[data-testid="fc-card"]').exists()).toBe(false);
    const wrapper = render({ cards: [card('apple')] });
    await wrapper.get('[data-testid="fc-card"]').trigger('click');
    expect(wrapper.text()).not.toContain('Serendip');
    expect(wrapper.text()).not.toContain('40,000');
    expect(wrapper.text()).not.toContain('B2/C1');
    expect(wrapper.get('[data-testid="grade-easy-btn"]').text()).toContain('4 天後');
    expect(wrapper.get('[data-testid="grade-again-btn"]').text()).toContain('1 天後');
  });
  it('does not present future cards as due', () => {
    const future = card('later'); future.srs.nextReviewDate = Date.now() + 86400000;
    expect(render({ cards: [future] }).text()).toContain('目前沒有待複習');
  });
  it('keeps a failed review on the same card and permits retry', async () => {
    const saveReview = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    const wrapper = render({ cards: [card('first'), card('second')], saveReview });
    await wrapper.get('[data-testid="fc-card"]').trigger('click');
    await wrapper.get('[data-testid="grade-good-btn"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('尚未儲存');
    expect(wrapper.find('[data-testid="fc-summary"]').exists()).toBe(false);
    await wrapper.get('[data-testid="grade-good-btn"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="fc-card-word"]').text()).toBe('second');
  });
  it('does not skip the next card when saved data refreshes', async () => {
    const first = card('first'), second = card('second');
    let finish!: () => void;
    const wrapper = render({ cards: [first, second], saveReview: () => new Promise<void>(resolve => { finish = resolve; }) });
    await wrapper.get('[data-testid="fc-card"]').trigger('click');
    await wrapper.get('[data-testid="grade-good-btn"]').trigger('click');
    await wrapper.setProps({ cards: [{ ...first, srs: SrsEngine.calculateNextState(first.srs, 'good') }, second] });
    finish(); await flushPromises();
    expect(wrapper.get('[data-testid="fc-card-word"]').text()).toBe('second');
  });
  it('retains a newly typed term when storage fails', async () => {
    const wrapper = mount(Glossary, { props: { saveTerm: vi.fn().mockRejectedValue(new Error('offline')) } }); wrappers.push(wrapper);
    await wrapper.get('[data-testid="input-source-term"]').setValue('apple');
    await wrapper.get('[data-testid="input-target-term"]').setValue('蘋果');
    await wrapper.get('[data-testid="add-term-btn"]').trigger('click');
    await flushPromises();
    expect((wrapper.get('[data-testid="input-source-term"]').element as HTMLInputElement).value).toBe('apple');
    expect(wrapper.get('[role="alert"]').text()).toContain('輸入的內容已保留');
  });
});
