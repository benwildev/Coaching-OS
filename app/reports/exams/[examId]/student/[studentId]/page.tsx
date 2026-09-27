import { Suspense } from 'react';
import { Loading } from '@/components/reports/ReportShell';
import { ExamStudentResult } from '@/components/reports/pages/ExamDetail';

export default async function Page({ params }: { params: Promise<{ examId: string; studentId: string }> }) {
  const { examId, studentId } = await params;
  return (
    <Suspense fallback={<Loading />}>
      <ExamStudentResult examId={examId} studentId={studentId} />
    </Suspense>
  );
}
