import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { api } from '@/lib/api';
import { date, label, money } from '@/lib/format';
import type { StudentDashboard } from '@/lib/types';
import { attendanceTone } from '@/screens/shared';
import { Badge, Body, Card, colors, Empty, ErrorView, Loading, Muted, Row, Screen, SectionTitle, Stat, Title } from '@/components/ui';

export default function StudentHome() {
  const q = useQuery({ queryKey: ['dashboard', 'student'], queryFn: () => api<StudentDashboard>('/api/portal/student/dashboard') });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={q.refetch} />;
  const d = q.data;
  const enrollment = d.student.enrollments[0];
  const due = d.fees?.totalDue ?? 0;

  return (
    <Screen refreshing={q.isRefetching} onRefresh={q.refetch}>
      <Card style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: '#fff', fontSize: 19, fontWeight: '700' }}>{d.student.name}</Text>
            <Text style={{ color: '#e0e7ff' }}>ID {d.student.studentIdCode}</Text>
            {enrollment ? (
              <Text style={{ color: '#e0e7ff' }}>
                {enrollment.academicProgram.name} · {enrollment.academicClass.name}
              </Text>
            ) : null}
          </View>
          <Ionicons
            name={d.unreadNotificationCount > 0 ? 'notifications' : 'notifications-outline'}
            size={26}
            color="#fff"
            onPress={() => router.push('/notifications')}
          />
        </Row>
        {d.unreadNotificationCount > 0 ? (
          <Text style={{ color: '#fff', marginTop: 8 }}>{d.unreadNotificationCount} unread notification(s)</Text>
        ) : null}
      </Card>

      <Row style={{ flexWrap: 'wrap' }}>
        <Stat label="Attendance" value={`${d.attendance.percentage}%`} />
        <Stat label="Fees due" value={money(due)} tone={due > 0 ? 'danger' : 'success'} />
      </Row>
      {d.nextDue ? (
        <Card onPress={() => router.push('/student/fees')}>
          <Muted>Next due · {d.nextDue.invoiceNumber}</Muted>
          <Title>
            {money(d.nextDue.dueAmount)}
            {d.nextDue.dueDate ? ` by ${date(d.nextDue.dueDate)}` : ''}
          </Title>
        </Card>
      ) : null}

      <SectionTitle>Upcoming exams</SectionTitle>
      {d.upcomingExams.length === 0 ? <Empty text="No upcoming exams." /> : null}
      {d.upcomingExams.map((e) => (
        <Card key={e.id} onPress={() => router.push('/exams')}>
          <Title>{e.title}</Title>
          <Muted>
            {label(e.examType)} · {date(e.startDate)}
          </Muted>
        </Card>
      ))}

      <SectionTitle>Recent results</SectionTitle>
      {d.recentResults.length === 0 ? <Empty text="No results yet." /> : null}
      {d.recentResults.map((r) => (
        <Card key={r.examId} onPress={() => router.push('/student/results')}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Title>{r.title}</Title>
              <Muted>
                {r.overall.overallPercentage.toFixed(1)}%{r.rank ? ` · Rank ${r.rank}` : ''}
              </Muted>
            </View>
            <Badge text={`${r.overall.overallGrade} · ${r.overall.overallGpa.toFixed(2)}`} tone="primary" />
          </Row>
        </Card>
      ))}

      {(d.attendance.recent ?? []).length > 0 ? <SectionTitle>Recent attendance</SectionTitle> : null}
      {(d.attendance.recent ?? []).map((a) => (
        <Card key={a.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Body>{date(a.date)}</Body>
              <Muted>
                {a.batchName}
                {a.subjectName ? ` · ${a.subjectName}` : ''}
              </Muted>
            </View>
            <Badge text={label(a.status)} tone={attendanceTone(a.status)} />
          </Row>
        </Card>
      ))}

      <SectionTitle>Notices</SectionTitle>
      {d.notices.length === 0 ? <Empty text="No notices." /> : null}
      {d.notices.map((n) => (
        <Card key={n.id} onPress={() => router.push('/student/notices')}>
          <Title>{n.title}</Title>
          <Muted>{date(n.publishedAt)}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
