import './globals.css';
import React from 'react';

export const metadata = {
  title: 'Study AI — Project-Aware AI Developer Assistant',
  description: 'AI learning and interview prep tool for software developers.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0d1117] text-[#e6edf3] antialiased">
        {children}
      </body>
    </html>
  );
}
