import { Suspense } from 'react';
import { Loading } from '@/components/reports/ReportShell';
import AttendanceStudentDetail from '@/components/reports/pages/AttendanceStudentDetail';

export default async function Page({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  return (
    <Suspense fallback={<Loading />}>
      <AttendanceStudentDetail studentId={studentId} />
    </Suspense>
  );
}
