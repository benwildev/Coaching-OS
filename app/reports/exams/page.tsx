import { Suspense } from 'react';
import { Loading } from '@/components/reports/ReportShell';
import ExamReports from '@/components/reports/pages/ExamReports';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <ExamReports />
    </Suspense>
  );
}
