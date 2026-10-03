import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '@/lib/api';
import { date, money } from '@/lib/format';
import type { GuardianDashboard } from '@/lib/types';
import { Badge, Card, colors, Empty, ErrorView, Loading, Muted, Row, Screen, SectionTitle, Stat, Title } from '@/components/ui';

export default function GuardianHome() {
  const [child, setChild] = useState<string | undefined>();
  const q = useQuery({
    queryKey: ['dashboard', 'guardian', child ?? 'default'],
    queryFn: () => api<GuardianDashboard>(`/api/portal/guardian/dashboard${child ? `?child=${child}` : ''}`),
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={q.refetch} />;
  const d = q.data;
  const selected = d.selectedChild;
  const due = d.fees?.totalDue ?? 0;

  return (
    <Screen refreshing={q.isRefetching} onRefresh={q.refetch}>
      <Row style={{ justifyContent: 'flex-end' }}>
        <Pressable onPress={() => router.push('/notifications')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name={d.unreadNotificationCount > 0 ? 'notifications' : 'notifications-outline'} size={22} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '600' }}>
            {d.unreadNotificationCount > 0 ? `${d.unreadNotificationCount} unread` : 'Notifications'}
          </Text>
        </Pressable>
      </Row>

      {d.children.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {d.children.map(({ student }) => {
            const active = student.id === selected?.id;
            return (
              <Pressable
                key={student.id}
                onPress={() => setChild(student.id)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: active ? colors.primary : colors.card,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '600' }}>{student.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {!selected ? (
        <Empty text="No children are linked to your account yet." />
      ) : (
        <>
          <Card
            style={{ backgroundColor: colors.primary, borderColor: colors.primary }}
            onPress={() => router.push({ pathname: '/child/[studentId]', params: { studentId: selected.id } })}
          >
            <Text style={{ color: '#fff', fontSize: 19, fontWeight: '700' }}>{selected.name}</Text>
            <Text style={{ color: '#e0e7ff' }}>ID {selected.studentIdCode}</Text>
            <Text style={{ color: '#fff', marginTop: 6, fontWeight: '600' }}>View details ›</Text>
          </Card>
          <Row style={{ flexWrap: 'wrap' }}>
            <Stat label="Attendance" value={`${d.attendance?.percentage ?? 0}%`} />
            <Stat label="Fees due" value={money(due)} tone={due > 0 ? 'danger' : 'success'} />
          </Row>

          <SectionTitle>Upcoming exams</SectionTitle>
          {(d.upcomingExams ?? []).length === 0 ? <Empty text="No upcoming exams." /> : null}
          {(d.upcomingExams ?? []).map((e) => (
            <Card key={e.id}>
              <Title>{e.title}</Title>
              <Muted>{date(e.startDate)}</Muted>
            </Card>
          ))}

          <SectionTitle>Recent results</SectionTitle>
          {(d.recentResults ?? []).length === 0 ? <Empty text="No results yet." /> : null}
          {(d.recentResults ?? []).map((r) => (
            <Card
              key={r.examId}
              onPress={() => router.push({ pathname: '/child/[studentId]/[section]', params: { studentId: selected.id, section: 'results' } })}
            >
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Title>{r.title}</Title>
                </View>
                <Badge text={`${r.overall.overallGrade} · ${r.overall.overallGpa.toFixed(2)}`} tone="primary" />
              </Row>
            </Card>
          ))}
        </>
      )}

      <SectionTitle>Notices</SectionTitle>
      {d.notices.length === 0 ? <Empty text="No notices." /> : null}
      {d.notices.map((n) => (
        <Card key={n.id} onPress={() => router.push('/guardian/notices')}>
          <Title>{n.title}</Title>
          <Muted>{date(n.publishedAt)}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
