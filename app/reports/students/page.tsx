import { Suspense } from 'react';
import { Loading } from '@/components/reports/ReportShell';
import StudentReports from '@/components/reports/pages/StudentReports';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <StudentReports />
    </Suspense>
  );
}
