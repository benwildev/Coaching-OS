import { Suspense } from 'react';
import { Loading } from '@/components/reports/ReportShell';
import { ExamDetail } from '@/components/reports/pages/ExamDetail';

export default async function Page({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  return (
    <Suspense fallback={<Loading />}>
      <ExamDetail examId={examId} />
    </Suspense>
  );
}
