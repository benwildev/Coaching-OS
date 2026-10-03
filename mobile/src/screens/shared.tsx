import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { api, studentBase } from '@/lib/api';
import { date, dateTime, label, money } from '@/lib/format';
import type {
  AttendanceRecord,
  AttendanceStatus,
  AttendanceSummary,
  ExamResultGroup,
  FeesResponse,
  HomeworkItem,
  InvoiceStatus,
  Material,
  Notice,
  Pagination,
  PortalExam,
  PortalNotification,
  TimetableSlot,
} from '@/lib/types';
import { Badge, Body, Card, colors, Empty, ErrorView, KeyValue, Loading, Muted, Row, Screen, SectionTitle, Stat, Title } from '@/components/ui';

type ChildProp = { childId?: string };

export function attendanceTone(status: AttendanceStatus) {
  return status === 'PRESENT' ? 'success' : status === 'LATE' ? 'warning' : status === 'ABSENT' ? 'danger' : 'neutral';
}

function invoiceTone(status: InvoiceStatus) {
  return status === 'PAID' ? 'success' : status === 'PARTIAL' ? 'warning' : status === 'OVERDUE' ? 'danger' : 'neutral';
}

export function AttendanceScreen({ childId }: ChildProp) {
  const q = useQuery({
    queryKey: ['attendance', childId ?? 'me'],
    queryFn: () =>
      api<{ summary: AttendanceSummary; records: AttendanceRecord[]; pagination: Pagination }>(`${studentBase(childId)}/attendance`),
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={q.refetch} />;
  const { summary, records } = q.data;
  return (
    <Screen refreshing={q.isRefetching} onRefresh={q.refetch}>
      <Row style={{ flexWrap: 'wrap' }}>
        <Stat label="Attendance" value={`${summary.percentage}%`} />
        <Stat label="Present" value={summary.present} tone="success" />
      </Row>
      <Row style={{ flexWrap: 'wrap' }}>
        <Stat label="Late" value={summary.late} tone="warning" />
        <Stat label="Absent" value={summary.absent} tone="danger" />
      </Row>
      <SectionTitle>Records</SectionTitle>
      {records.length === 0 ? <Empty text="No attendance records yet." /> : null}
      {records.map((r) => (
        <Card key={r.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Title>{date(r.date)}</Title>
              <Muted>
                {r.batch.name}
                {r.subject ? ` · ${r.subject.name}` : ''}
                {r.inTime ? ` · ${r.inTime}` : ''}
              </Muted>
            </View>
            <Badge text={label(r.status)} tone={attendanceTone(r.status)} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}

export function ResultsScreen({ childId }: ChildProp) {
  const q = useQuery({
    queryKey: ['results', childId ?? 'me'],
    queryFn: () => api<{ history: ExamResultGroup[] }>(`${studentBase(childId)}/results`),
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={q.refetch} />;
  return (
    <Screen refreshing={q.isRefetching} onRefresh={q.refetch}>
      {q.data.history.length === 0 ? <Empty text="No published results yet." /> : null}
      {q.data.history.map((exam) => (
        <Card key={exam.examId} style={{ gap: 8 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Title>{exam.title}</Title>
              <Muted>
                {label(exam.examType)} · {date(exam.startDate)}
                {exam.rank ? ` · Rank ${exam.rank}` : ''}
              </Muted>
            </View>
            <Badge text={exam.overall.isPassed ? 'Passed' : 'Failed'} tone={exam.overall.isPassed ? 'success' : 'danger'} />
          </Row>
          <Row style={{ gap: 16 }}>
            <Body>Grade: {exam.overall.overallGrade}</Body>
            <Body>GPA: {exam.overall.overallGpa.toFixed(2)}</Body>
            <Body>{exam.overall.overallPercentage.toFixed(1)}%</Body>
          </Row>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }}>
            {exam.subjects.map((s) => (
              <KeyValue
                key={s.resultId}
                k={s.subjectName}
                v={s.marksObtained === null ? label(s.status) : `${s.marksObtained}/${s.totalMarks}${s.grade ? ` · ${s.grade}` : ''}`}
              />
            ))}
          </View>
        </Card>
      ))}
    </Screen>
  );
}

export function FeesScreen({ childId }: ChildProp) {
  const q = useQuery({
    queryKey: ['fees', childId ?? 'me'],
    queryFn: () => api<FeesResponse>(`${studentBase(childId)}/fees`),
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={q.refetch} />;
  const { summary, invoices, payments } = q.data;
  return (
    <Screen refreshing={q.isRefetching} onRefresh={q.refetch}>
      <Row style={{ flexWrap: 'wrap' }}>
        <Stat label="Billed" value={money(summary.totalBilled)} />
        <Stat label="Paid" value={money(summary.totalPaid)} tone="success" />
      </Row>
      <Stat label="Due" value={money(summary.totalDue)} tone={summary.totalDue > 0 ? 'danger' : 'success'} />
      <SectionTitle>Invoices</SectionTitle>
      {invoices.length === 0 ? <Empty text="No invoices." /> : null}
      {invoices.map((inv) => {
        const payable = Number(inv.dueAmount) > 0 && inv.status !== 'CANCELLED' && inv.status !== 'DRAFT';
        return (
          <Card
            key={inv.id}
            onPress={payable ? () => router.push({ pathname: '/pay/[invoiceId]', params: { invoiceId: inv.id } }) : undefined}
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Title>{inv.invoiceNumber}</Title>
                <Muted>
                  {date(inv.invoiceDate)}
                  {inv.dueDate ? ` · Due ${date(inv.dueDate)}` : ''}
                </Muted>
              </View>
              <Badge text={label(inv.status)} tone={invoiceTone(inv.status)} />
            </Row>
            <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <Body>Total {money(inv.totalAmount)}</Body>
              <Body style={{ fontWeight: '700', color: payable ? colors.danger : colors.success }}>
                {payable ? `Due ${money(inv.dueAmount)} · Pay ›` : 'Settled'}
              </Body>
            </Row>
          </Card>
        );
      })}
      {payments && payments.length > 0 ? (
        <>
          <SectionTitle>Payments</SectionTitle>
          {payments.map((p) => (
            <Card key={p.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Title>{money(p.amount)}</Title>
                  <Muted>
                    {p.receiptNumber} · {label(p.paymentMethod)} · {date(p.paymentDate)}
                  </Muted>
                </View>
                <Badge text={label(p.status)} tone={p.status === 'COMPLETED' ? 'success' : 'neutral'} />
              </Row>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function homeworkTone(status: HomeworkItem['computedStatus']) {
  if (status === 'REVIEWED' || status === 'SUBMITTED') return 'success';
  if (status === 'DUE_SOON' || status === 'RETURNED') return 'warning';
  if (status === 'LATE') return 'danger';
  return 'primary';
}

export function HomeworkScreen({ childId }: ChildProp) {
  const q = useQuery({
    queryKey: ['homework', childId ?? 'me'],
    queryFn: () => api<{ homeworks: HomeworkItem[] }>(`${studentBase(childId)}/homework`),
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={q.refetch} />;
  return (
    <Screen refreshing={q.isRefetching} onRefresh={q.refetch}>
      {q.data.homeworks.length === 0 ? <Empty text="No homework." /> : null}
      {q.data.homeworks.map((h) => (
        <Card
          key={h.id}
          onPress={childId ? undefined : () => router.push({ pathname: '/homework/[id]', params: { id: h.id } })}
        >
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Title>{h.title}</Title>
              <Muted>
                {h.subject.name} · {h.batch.name}
              </Muted>
              <Muted>Due {dateTime(h.dueAt)}</Muted>
            </View>
            <Badge text={label(h.computedStatus)} tone={homeworkTone(h.computedStatus)} />
          </Row>
          {h.submission?.feedback ? <Body style={{ marginTop: 8 }}>Feedback: {h.submission.feedback}</Body> : null}
        </Card>
      ))}
    </Screen>
  );
}

export function MaterialsScreen({ childId }: ChildProp) {
  const q = useQuery({
    queryKey: ['materials', childId ?? 'me'],
    queryFn: () => api<{ materials: Material[] }>(`${studentBase(childId)}/materials`),
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={q.refetch} />;
  return (
    <Screen refreshing={q.isRefetching} onRefresh={q.refetch}>
      {q.data.materials.length === 0 ? <Empty text="No study materials." /> : null}
      {q.data.materials.map((m) => (
        <Card key={m.id} onPress={m.fileUrl ? () => WebBrowser.openBrowserAsync(m.fileUrl!) : undefined}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Title>{m.title}</Title>
              <Muted>
                {m.subject.name}
                {m.publishedAt ? ` · ${date(m.publishedAt)}` : ''}
              </Muted>
            </View>
            <Badge text={m.type} tone="primary" />
          </Row>
          {m.description ? <Body style={{ marginTop: 6 }}>{m.description}</Body> : null}
          {m.fileUrl ? <Text style={{ color: colors.primary, marginTop: 6, fontWeight: '600' }}>Open ›</Text> : null}
        </Card>
      ))}
    </Screen>
  );
}

export function NoticesScreen({ audience }: { audience: 'student' | 'guardian' }) {
  const q = useQuery({
    queryKey: ['notices', audience],
    queryFn: () => api<{ notices: Notice[] }>(`/api/portal/${audience}/notices`),
  });
  const [open, setOpen] = useState<string | null>(null);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={q.refetch} />;
  return (
    <Screen refreshing={q.isRefetching} onRefresh={q.refetch}>
      {q.data.notices.length === 0 ? <Empty text="No notices." /> : null}
      {q.data.notices.map((n) => (
        <Card key={n.id} onPress={() => setOpen(open === n.id ? null : n.id)}>
          <Title>{n.title}</Title>
          {n.banglaTitle ? <Body>{n.banglaTitle}</Body> : null}
          <Muted>{date(n.publishedAt)}</Muted>
          {open === n.id ? (
            <View style={{ marginTop: 8, gap: 8 }}>
              <Body>{n.content}</Body>
              {n.banglaContent ? <Body>{n.banglaContent}</Body> : null}
            </View>
          ) : (
            <Body style={{ marginTop: 6 }}>{n.content.length > 120 ? `${n.content.slice(0, 120)}…` : n.content}</Body>
          )}
        </Card>
      ))}
    </Screen>
  );
}

export function NotificationsScreen() {
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ notifications: PortalNotification[] }>('/api/portal/notifications'),
  });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ['notifications'] });
    client.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const markRead = async (id: string) => {
    await api(`/api/portal/notifications/${id}/read`, { method: 'POST' }).catch(() => {});
    refresh();
  };
  const markAll = async () => {
    await api('/api/portal/notifications/read-all', { method: 'POST' }).catch(() => {});
    refresh();
  };
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={q.refetch} />;
  const list = q.data.notifications;
  return (
    <Screen refreshing={q.isRefetching} onRefresh={q.refetch}>
      {list.some((n) => !n.isRead) ? (
        <Text onPress={markAll} style={{ color: colors.primary, fontWeight: '600', textAlign: 'right' }}>
          Mark all as read
        </Text>
      ) : null}
      {list.length === 0 ? <Empty text="No notifications." /> : null}
      {list.map((n) => (
        <Card
          key={n.id}
          onPress={n.isRead ? undefined : () => markRead(n.id)}
          style={n.isRead ? undefined : { borderColor: colors.primary, backgroundColor: colors.primarySoft }}
        >
          <Title>{n.title}</Title>
          <Body>{n.body}</Body>
          <Muted style={{ marginTop: 4 }}>{dateTime(n.createdAt)}</Muted>
        </Card>
      ))}
    </Screen>
  );
}

export function ExamsScreen() {
  const q = useQuery({ queryKey: ['exams'], queryFn: () => api<{ exams: PortalExam[] }>('/api/portal/student/exams') });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={q.refetch} />;
  return (
    <Screen refreshing={q.isRefetching} onRefresh={q.refetch}>
      {q.data.exams.length === 0 ? <Empty text="No exams scheduled." /> : null}
      {q.data.exams.map((e) => (
        <Card key={e.id} style={{ gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Title>{e.title}</Title>
              <Muted>
                {label(e.examType)} · {date(e.startDate)}
                {e.batch ? ` · ${e.batch.name}` : ''}
              </Muted>
            </View>
            <Badge text={label(e.status)} tone={e.status === 'SCHEDULED' ? 'primary' : 'neutral'} />
          </Row>
          {e.subjects.map((s) => (
            <KeyValue
              key={s.id}
              k={s.subject.name}
              v={`${s.examDate ? date(s.examDate) : 'TBA'}${s.startTime ? ` ${s.startTime}` : ''} · ${s.totalMarks} marks`}
            />
          ))}
        </Card>
      ))}
    </Screen>
  );
}

const DAY_ORDER = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

export function TimetableScreen() {
  const q = useQuery({
    queryKey: ['timetable'],
    queryFn: () => api<{ timetable: TimetableSlot[] }>('/api/portal/student/timetable'),
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={q.refetch} />;
  const days = DAY_ORDER.map((d) => ({ day: d, slots: q.data.timetable.filter((s) => s.dayOfWeek === d) })).filter(
    (d) => d.slots.length > 0
  );
  return (
    <Screen refreshing={q.isRefetching} onRefresh={q.refetch}>
      {days.length === 0 ? <Empty text="No classes in your routine." /> : null}
      {days.map((d) => (
        <View key={d.day} style={{ gap: 8 }}>
          <SectionTitle>{label(d.day)}</SectionTitle>
          {d.slots.map((s) => (
            <Card key={s.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Title>{s.subjectName}</Title>
                  <Muted>
                    {s.batchName}
                    {s.teacherName ? ` · ${s.teacherName}` : ''}
                    {s.roomName ? ` · ${s.roomName}` : ''}
                  </Muted>
                </View>
                <Badge text={`${s.startTime}–${s.endTime}`} tone="primary" />
              </Row>
            </Card>
          ))}
        </View>
      ))}
    </Screen>
  );
}
