import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { api } from '@/lib/api';
import type { GuardianChild } from '@/lib/types';
import { Badge, Card, Empty, ErrorView, Loading, Muted, Row, Screen, Title } from '@/components/ui';

export default function Children() {
  const q = useQuery({
    queryKey: ['children'],
    queryFn: () => api<{ children: Array<{ isPrimary: boolean; student: GuardianChild }> }>('/api/portal/guardian/children'),
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={q.refetch} />;
  return (
    <Screen refreshing={q.isRefetching} onRefresh={q.refetch}>
      {q.data.children.length === 0 ? <Empty text="No children are linked to your account yet." /> : null}
      {q.data.children.map(({ student, isPrimary }) => {
        const enrollment = student.enrollments[0];
        const batch = student.studentBatches[0]?.batch;
        return (
          <Card key={student.id} onPress={() => router.push({ pathname: '/child/[studentId]', params: { studentId: student.id } })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Title>{student.name}</Title>
                <Muted>ID {student.studentIdCode}</Muted>
                <Muted>
                  {[enrollment?.academicClass.name, enrollment?.academicGroup?.name, batch?.name].filter(Boolean).join(' · ')}
                </Muted>
              </View>
              {isPrimary ? <Badge text="Primary" tone="primary" /> : null}
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
