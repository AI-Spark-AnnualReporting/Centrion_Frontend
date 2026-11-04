// A popup that ✕ / Esc close but a click outside doesn't — a half-filled plan
// or quote form must not vanish by accident (same rule as the Licenses page).

import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export function FormDialog({ open, title, onClose, children }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className="left-0 right-0 top-[4vh] mx-auto translate-x-0 translate-y-0 max-w-2xl max-h-[92vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none"
        onInteractOutside={(event) => event.preventDefault()}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
