import { Suspense } from 'react';
import { Loading } from '@/components/reports/ReportShell';
import TeacherReports from '@/components/reports/pages/TeacherReports';

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <TeacherReports />
    </Suspense>
  );
}
