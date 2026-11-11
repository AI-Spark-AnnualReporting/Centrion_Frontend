import * as React from "react";

import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 1000000;

// Toasts that a newer toast must not push out while they are open. Only one
// slot is shown (TOAST_LIMIT), so without this the page's own "X failed" toast
// replaced the AI-credits notice in the same moment it appeared.
export const AI_CREDITS_TOAST_ID = "ai-credits-paused";
const PINNED_TOAST_IDS = new Set<string>([AI_CREDITS_TOAST_ID]);

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const;

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type ActionType = typeof actionTypes;

type Action =
  | {
      type: ActionType["ADD_TOAST"];
      toast: ToasterToast;
    }
  | {
      type: ActionType["UPDATE_TOAST"];
      toast: Partial<ToasterToast>;
    }
  | {
      type: ActionType["DISMISS_TOAST"];
      toastId?: ToasterToast["id"];
    }
  | {
      type: ActionType["REMOVE_TOAST"];
      toastId?: ToasterToast["id"];
    };

interface State {
  toasts: ToasterToast[];
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

/** True when this toast is pinned and still showing, so it must not be pushed out. */
function isOpenPinnedToast(toast: ToasterToast): boolean {
  return PINNED_TOAST_IDS.has(toast.id) && toast.open !== false;
}

/**
 * Put a new toast first, keep at most TOAST_LIMIT, but never drop an open pinned
 * toast. A toast with the same id as the new one is replaced, not duplicated.
 */
function addToastToList(toasts: ToasterToast[], newToast: ToasterToast): ToasterToast[] {
  const others = toasts.filter((t) => t.id !== newToast.id);
  const kept = [newToast, ...others].slice(0, TOAST_LIMIT);
  const droppedPinned = others.filter((t) => isOpenPinnedToast(t) && !kept.includes(t));
  return [...kept, ...droppedPinned];
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: addToastToList(state.toasts, action.toast),
      };

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) => (t.id === action.toast.id ? { ...t, ...action.toast } : t)),
      };

    case "DISMISS_TOAST": {
      const { toastId } = action;

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t,
        ),
      };
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

const listeners: Array<(state: State) => void> = [];

let memoryState: State = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

// `id` is optional: pass a fixed one to show the same toast again instead of a
// second copy (the AI-credits notice does).
type Toast = Omit<ToasterToast, "id"> & { id?: string };

/** Stop a pending removal, so re-showing a closed toast by the same id is not removed by the old timer. */
function cancelPendingRemoval(toastId: string): void {
  const timeout = toastTimeouts.get(toastId);
  if (timeout === undefined) return;
  clearTimeout(timeout);
  toastTimeouts.delete(toastId);
}

function toast({ id: fixedId, onOpenChange: callerOnOpenChange, ...props }: Toast) {
  const id = fixedId ?? genId();
  cancelPendingRemoval(id);

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    });
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id });

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        // The caller may want to know when the user closes it (the AI-credits
        // notice starts its 5-minute quiet period then).
        callerOnOpenChange?.(open);
        if (!open) dismiss();
      },
    },
  });

  return {
    id: id,
    dismiss,
    update,
  };
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  };
}

export { useToast, toast };
