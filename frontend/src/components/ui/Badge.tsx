'use client';
import React from 'react';
import { clsx } from 'clsx';

export const Badge: React.FC<{ children: React.ReactNode; variant?: 'info' | 'success' | 'warning' | 'error'; className?: string }> = ({
  children,
  variant = 'info',
  className,
}) => {
  const styles = {
    info: 'bg-blue-950 text-blue-300 border-blue-800',
    success: 'bg-green-950 text-green-300 border-green-800',
    warning: 'bg-yellow-950 text-yellow-300 border-yellow-800',
    error: 'bg-red-950 text-red-300 border-red-800',
  };

  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border', styles[variant], className)}>
      {children}
    </span>
  );
};
