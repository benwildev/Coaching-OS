import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '@/lib/store';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Coaching OS · Alokito Coaching Centre',
  description: 'Class 9–12 coaching centre management platform (demo).',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="min-h-full" suppressHydrationWarning>
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
