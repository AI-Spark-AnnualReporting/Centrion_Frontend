import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      // Top-right on every breakpoint. Bottom-right (the shadcn default) put
      // toasts on top of the chat launcher and the compliance run dock.
      "fixed right-0 top-0 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 md:max-w-[400px]",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  // Sizing / radius / shadow follow the app's cards and modals rather than the
  // shadcn defaults (which are a third bigger than anything else on screen).
  // The 3px left edge is the brand accent, red on a failure.
  "group pointer-events-auto relative flex w-full items-start justify-between gap-3 overflow-hidden rounded-[12px] border border-l-[3px] bg-white p-[14px] pr-9 shadow-[0_10px_30px_rgba(20,24,60,.14)] transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full",
  {
    variants: {
      variant: {
        default: "border-[#E2E4F0] border-l-[#4040C8] text-[#1A1D2E]",
        success: "success group border-[#BBE5C5] border-l-[#16A34A] text-[#1A1D2E]",
        destructive: "destructive group border-[#F5C2C7] border-l-[#E5484D] text-[#1A1D2E]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

// The countdown Radix is already running. `animationDuration` is set inline
// from the toast's own duration, so the bar and the dismissal stay in step, and
// `group-hover:paused` mirrors Radix pausing its timer while hovered.
const ToastTimer = ({ durationMs }: { durationMs: number }) => (
  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#ECEEF8]">
    <div
      className="h-full w-full origin-left animate-toast-timer bg-[#4040C8] group-hover:[animation-play-state:paused] group-[.success]:bg-[#16A34A] group-[.destructive]:bg-[#E5484D]"
      style={{ animationDuration: `${durationMs}ms` }}
    />
  </div>
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return <ToastPrimitives.Root ref={ref} className={cn(toastVariants({ variant }), className)} {...props} />;
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-[26px] shrink-0 items-center justify-center self-center rounded-[8px] border border-[#4040C8]/20 bg-[#4040C8]/[.08] px-[10px] text-[11px] font-bold text-[#4040C8] transition-colors hover:bg-[#4040C8]/[.14] group-[.success]:border-[#16A34A]/25 group-[.success]:bg-[#16A34A]/[.08] group-[.success]:text-[#15803D] group-[.success]:hover:bg-[#16A34A]/[.14] group-[.destructive]:border-[#E5484D]/25 group-[.destructive]:bg-[#E5484D]/[.08] group-[.destructive]:text-[#B33A3E] group-[.destructive]:hover:bg-[#E5484D]/[.14] focus:outline-none focus:ring-2 focus:ring-[#4040C8]/40 disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      // Always visible: a toast that dismisses itself still needs an obvious way
      // out, and hover-to-reveal doesn't exist on touch.
      "absolute right-2 top-2 rounded-md p-1 text-[#9BA3C4] transition-colors hover:text-[#1A1D2E] focus:outline-none focus:ring-2 focus:ring-[#4040C8]/40",
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="h-[13px] w-[13px]" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title ref={ref} className={cn("text-[12px] font-bold leading-[1.35] tracking-[-.1px]", className)} {...props} />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description ref={ref} className={cn("mt-[3px] text-[11px] leading-[1.5] text-[#5A6080]", className)} {...props} />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  ToastTimer,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
