import { Suspense } from 'react';
import { Loading } from '@/components/reports/ReportShell';
import FinanceReports from '@/components/reports/pages/FinanceReports';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <FinanceReports />
    </Suspense>
  );
}
