// A save the server refused, shown as a popup in the middle of the screen
// (decided 2026-11-11, mockup "Save errors" option B): the page dims, the
// popup rises in, the red icon pulses. Only an × closes it (or Esc, or a
// click outside). Animations live in index.css (.err-pop-*) and switch off
// with the "reduce motion" setting.
//
// Plan: Centrion_Frontend/.claude/plans/error-popup.md

import * as DialogPrimitive from '@radix-ui/react-dialog';

export function ErrorPopup({ open, title, message, onClose }: {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="err-pop-backdrop" />
        <DialogPrimitive.Content role="alertdialog" className="err-pop">
          <DialogPrimitive.Close className="err-pop-x" aria-label="Close">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </DialogPrimitive.Close>
          <span className="err-pop-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v5" /><path d="M12 16.5h.01" /><circle cx="12" cy="12" r="9" />
            </svg>
          </span>
          <DialogPrimitive.Title className="err-pop-title">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="err-pop-text">{message}</DialogPrimitive.Description>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** A name-clash message from the server ("There's already a plan called …"). */
export function isNameTaken(message: string): boolean {
  return message.startsWith("There's already a plan called");
}
