import type { Metadata } from 'next';
import SuperAdminShell from '@/components/SuperAdminShell';

export const metadata: Metadata = {
  title: 'Coaching OS · Platform Console',
  robots: { index: false, follow: false },
};

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <SuperAdminShell>{children}</SuperAdminShell>;
}
