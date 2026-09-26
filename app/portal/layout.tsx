import { PortalProvider } from '@/components/portal/PortalProvider';

export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return <PortalProvider>{children}</PortalProvider>;
}
