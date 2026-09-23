import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '@/lib/store';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Coaching OS · বাংলাদেশ কোচিং সেন্টার ম্যানেজমেন্ট সিস্টেম',
  description: 'Production-grade Bangladesh-first Coaching Center Management System (SSC, HSC, Admission).',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn" className="h-full" suppressHydrationWarning>
      <body className="min-h-full" suppressHydrationWarning>
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
