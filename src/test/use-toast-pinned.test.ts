import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { reducer, toast, useToast, AI_CREDITS_TOAST_ID } from '@/hooks/use-toast';

type ToastInState = Parameters<typeof reducer>[0]['toasts'][number];

function makeToast(id: string, open = true): ToastInState {
  return { id, open, title: id };
}

/** Add toasts one by one, the way toast() dispatches them, and return the ids left. */
function idsAfterAdding(toasts: ToastInState[]): string[] {
  let state = { toasts: [] as ToastInState[] };
  for (const toast of toasts) state = reducer(state, { type: 'ADD_TOAST', toast });
  return state.toasts.map((t) => t.id);
}

describe('toast list limit', () => {
  it('still shows only the newest ordinary toast', () => {
    expect(idsAfterAdding([makeToast('1'), makeToast('2')])).toEqual(['2']);
  });

  it('keeps the open AI-credits toast when another toast is added', () => {
    const ids = idsAfterAdding([makeToast(AI_CREDITS_TOAST_ID), makeToast('1'), makeToast('2')]);
    expect(ids).toEqual(['2', AI_CREDITS_TOAST_ID]);
  });

  it('lets a closed AI-credits toast be pushed out', () => {
    const ids = idsAfterAdding([makeToast(AI_CREDITS_TOAST_ID, false), makeToast('1')]);
    expect(ids).toEqual(['1']);
  });

  it('replaces the AI-credits toast instead of showing two copies', () => {
    const ids = idsAfterAdding([makeToast(AI_CREDITS_TOAST_ID, false), makeToast(AI_CREDITS_TOAST_ID)]);
    expect(ids).toEqual([AI_CREDITS_TOAST_ID]);
  });
});

describe('toast() with a fixed id', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('tells the caller when the toast closes, and re-showing it is not removed by the old timer', () => {
    vi.useFakeTimers();
    const onOpenChange = vi.fn();
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ id: AI_CREDITS_TOAST_ID, title: 'first', onOpenChange });
    });
    const shown = result.current.toasts.find((t) => t.id === AI_CREDITS_TOAST_ID);
    act(() => {
      shown?.onOpenChange?.(false);
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);

    act(() => {
      toast({ id: AI_CREDITS_TOAST_ID, title: 'second' });
    });
    // The first copy's removal timer (1,000,000 ms) must not remove the second copy.
    act(() => {
      vi.advanceTimersByTime(1000001);
    });
    const ids = result.current.toasts.filter((t) => t.id === AI_CREDITS_TOAST_ID);
    expect(ids).toHaveLength(1);
    expect(ids[0].open).toBe(true);
  });
});
