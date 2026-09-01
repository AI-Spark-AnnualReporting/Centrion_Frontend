import { useEffect } from 'react';
import type { ReactNode } from 'react';

// A plain modal shell for the Add-figure picker.
//
// Mirrors CoverTemplatePicker's shell (overlay + centered card + Escape-to-close)
// rather than reusing ApproveConfirmDialog, which bakes in its own confirm button
// and approve wording — the picker brings its own footer.
export function FigureDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1400,
        background: 'rgba(20,22,40,.45)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'fade-in .2s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(860px, 100%)',
          maxHeight: '86vh',
          overflowY: 'auto',
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(20,22,40,.28)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
