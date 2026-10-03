import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import type { StudentProfile } from '@/lib/types';
import { MenuList } from '@/components/MenuList';
import { Card, ErrorView, KeyValue, Loading, Muted, Screen, Title } from '@/components/ui';

export default function ChildDetail() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const q = useQuery({
    queryKey: ['child', studentId],
    queryFn: () => api<{ student: StudentProfile }>(`/api/portal/guardian/children/${studentId}`),
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={q.refetch} />;
  const s = q.data.student;
  const enrollment = s.enrollments[0];
  const section = (key: string) => ({ pathname: '/child/[studentId]/[section]' as const, params: { studentId, section: key } });

  return (
    <Screen refreshing={q.isRefetching} onRefresh={q.refetch}>
      <Stack.Screen options={{ title: s.name }} />
      <Card>
        <Title>{s.name}</Title>
        {s.banglaName ? <Muted>{s.banglaName}</Muted> : null}
        <KeyValue k="Student ID" v={s.studentIdCode} />
        {enrollment ? <KeyValue k="Program" v={enrollment.academicProgram.name} /> : null}
        {enrollment ? <KeyValue k="Class" v={enrollment.academicClass.name} /> : null}
        {s.studentBatches.length > 0 ? <KeyValue k="Batches" v={s.studentBatches.map((b) => b.batch.name).join(', ')} /> : null}
        {s.branch ? <KeyValue k="Branch" v={s.branch.name} /> : null}
        {s.dob ? <KeyValue k="Date of birth" v={date(s.dob)} /> : null}
      </Card>
      <MenuList
        items={[
          { label: 'Attendance', icon: 'calendar-outline', href: section('attendance') },
          { label: 'Results', icon: 'ribbon-outline', href: section('results') },
          { label: 'Fees & payments', icon: 'wallet-outline', href: section('fees') },
          { label: 'Homework', icon: 'document-text-outline', href: section('homework') },
          { label: 'Study materials', icon: 'library-outline', href: section('materials') },
        ]}
      />
    </Screen>
  );
}
