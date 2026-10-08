import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ActionSlider from '@/components/ActionSlider.vue';

function slider(props: any = {}) {
  const wrapper = mount(ActionSlider, {
    props: { active: 'right', ...props },
    slots: { left: 'Translate', right: 'Restore' },
  });
  const rail = wrapper.element as HTMLElement;
  vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({ width: 380 } as DOMRect);
  rail.setPointerCapture = vi.fn();
  rail.hasPointerCapture = () => true;
  rail.releasePointerCapture = vi.fn();
  return wrapper;
}

describe('Sliding action gestures', () => {
  it('sends exactly one command when dragging and suppresses the generated click', async () => {
    const wrapper = slider();
    await wrapper.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 280, clientY: 20 });
    await wrapper.trigger('pointermove', { pointerId: 1, clientX: 100, clientY: 20 });
    await wrapper.trigger('pointerup', { pointerId: 1, clientX: 100, clientY: 20 });
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('left')).toHaveLength(1);
    expect(wrapper.emitted('right')).toBeUndefined();
    wrapper.unmount();
  });

  it('does not send a command for a cancelled drag or a busy request', async () => {
    const wrapper = slider();
    await wrapper.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 280, clientY: 20 });
    await wrapper.trigger('pointermove', { pointerId: 1, clientX: 100, clientY: 20 });
    await wrapper.trigger('pointercancel', { pointerId: 1 });
    expect(wrapper.emitted('left')).toBeUndefined();
    await wrapper.setProps({ leftBusy: true });
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('left')).toBeUndefined();
    wrapper.unmount();
  });

  it('does not submit a disabled destination after dragging towards it', async () => {
    const wrapper = slider({ leftDisabled: true });
    await wrapper.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 280, clientY: 20 });
    await wrapper.trigger('pointermove', { pointerId: 1, clientX: 100, clientY: 20 });
    await wrapper.trigger('pointerup', { pointerId: 1, clientX: 100, clientY: 20 });
    expect(wrapper.emitted('left')).toBeUndefined();
    wrapper.unmount();
  });
});
