import { useToast } from "@/hooks/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTimer,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

// Matches Radix's own default. Kept as a constant so the countdown bar can be
// drawn for the same span the timer actually runs.
const DEFAULT_TOAST_MS = 5000;

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        // Infinity means the caller wants it to stay until dismissed (the
        // compliance run notice does) — no countdown to draw.
        const ms = props.duration ?? DEFAULT_TOAST_MS;
        return (
          <Toast key={id} {...props}>
            <div className="min-w-0">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
            {Number.isFinite(ms) && <ToastTimer durationMs={ms} />}
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
