'use client';
import React from 'react';
import { clsx } from 'clsx';

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={clsx('bg-[#161b22] border border-[#30363d] rounded-lg p-4 shadow-sm', className)}>
    {children}
  </div>
);
