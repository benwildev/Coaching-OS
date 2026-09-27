import { Suspense } from 'react';
import { Loading } from '@/components/reports/ReportShell';
import AttendanceReports from '@/components/reports/pages/AttendanceReports';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <AttendanceReports />
    </Suspense>
  );
}
