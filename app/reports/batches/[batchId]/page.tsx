import { Suspense } from 'react';
import { Loading } from '@/components/reports/ReportShell';
import BatchDetail from '@/components/reports/pages/BatchDetail';

export default async function Page({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  return (
    <Suspense fallback={<Loading />}>
      <BatchDetail batchId={batchId} />
    </Suspense>
  );
}
