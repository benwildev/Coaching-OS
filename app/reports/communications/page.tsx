import { Suspense } from 'react';
import { Loading } from '@/components/reports/ReportShell';
import CommunicationReports from '@/components/reports/pages/CommunicationReports';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <CommunicationReports />
    </Suspense>
  );
}
