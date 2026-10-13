'use client';
import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        // Bottom sheet on phones (never taller than the visible viewport, scrolls internally); centered card from sm up.
        className="bg-[#161b22] border border-[#30363d] rounded-t-xl sm:rounded-xl w-full sm:max-w-lg max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150"
      >
        <div className="flex items-center justify-between gap-2 pl-5 pr-2 py-2 border-b border-[#30363d] shrink-0">
          <h3 id={titleId} className="font-semibold text-lg text-white min-w-0 break-words">{title}</h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-[#0d1117] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="p-4 sm:p-5 overflow-y-auto min-h-0">{children}</div>
      </div>
    </div>
  );
};
