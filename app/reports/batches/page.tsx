import { Suspense } from 'react';
import { Loading } from '@/components/reports/ReportShell';
import BatchReports from '@/components/reports/pages/BatchReports';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <BatchReports />
    </Suspense>
  );
}
