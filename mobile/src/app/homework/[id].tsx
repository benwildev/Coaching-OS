import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Text } from 'react-native';
import { api } from '@/lib/api';
import { dateTime, label } from '@/lib/format';
import type { HomeworkDetail } from '@/lib/types';
import { Badge, Body, Button, Card, colors, ErrorView, Input, KeyValue, Loading, Muted, Screen, SectionTitle, Title } from '@/components/ui';

export default function HomeworkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ['homework-detail', id],
    queryFn: () => api<{ homework: HomeworkDetail }>(`/api/portal/student/homework/${id}`),
  });
  const [content, setContent] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={q.refetch} />;
  const h = q.data.homework;
  const sub = h.submission;
  const reviewed = sub?.status === 'REVIEWED';
  const open = h.status === 'PUBLISHED' && !reviewed;
  const draftContent = content ?? sub?.content ?? '';
  const draftUrl = fileUrl ?? sub?.fileUrl ?? '';

  const submit = async () => {
    if (!draftContent.trim() && !draftUrl.trim()) {
      return setMessage({ ok: false, text: 'Write an answer or add a file link.' });
    }
    setSaving(true);
    setMessage(null);
    try {
      await api(`/api/portal/student/homework/${id}/submit`, {
        body: { content: draftContent.trim() || undefined, fileUrl: draftUrl.trim() || undefined },
      });
      setMessage({ ok: true, text: 'Submitted.' });
      setContent(null);
      setFileUrl(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['homework-detail', id] }),
        client.invalidateQueries({ queryKey: ['homework'] }),
      ]);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Submission failed.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen refreshing={q.isRefetching} onRefresh={q.refetch}>
      <Card style={{ gap: 6 }}>
        <Title>{h.title}</Title>
        {h.banglaTitle ? <Muted>{h.banglaTitle}</Muted> : null}
        <KeyValue k="Subject" v={h.subject.name} />
        <KeyValue k="Batch" v={h.batch.name} />
        {h.teacher ? <KeyValue k="Teacher" v={h.teacher.name} /> : null}
        <KeyValue k="Due" v={dateTime(h.dueAt)} />
        {h.description ? <Body style={{ marginTop: 6 }}>{h.description}</Body> : null}
        {h.banglaDescription ? <Body>{h.banglaDescription}</Body> : null}
        {h.fileUrl ? (
          <Text onPress={() => WebBrowser.openBrowserAsync(h.fileUrl!)} style={{ color: colors.primary, fontWeight: '600', marginTop: 6 }}>
            Open attachment ›
          </Text>
        ) : null}
      </Card>

      {sub ? (
        <Card style={{ gap: 6 }}>
          <Badge text={label(sub.status)} tone={reviewed ? 'success' : sub.isLate ? 'warning' : 'primary'} />
          <Muted>Submitted {dateTime(sub.submittedAt)}</Muted>
          {sub.feedback ? <Body>Teacher feedback: {sub.feedback}</Body> : null}
        </Card>
      ) : null}

      {open ? (
        <>
          <SectionTitle>{sub ? 'Update your submission' : 'Your submission'}</SectionTitle>
          <Input
            label="Answer"
            value={draftContent}
            onChangeText={setContent}
            multiline
            style={{ minHeight: 120, textAlignVertical: 'top', paddingTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: '#fff' }}
          />
          <Input label="File link (optional)" value={draftUrl} onChangeText={setFileUrl} autoCapitalize="none" keyboardType="url" placeholder="https://…" />
          {message ? <Text style={{ color: message.ok ? colors.success : colors.danger }}>{message.text}</Text> : null}
          <Button title={sub ? 'Update submission' : 'Submit'} onPress={submit} loading={saving} />
        </>
      ) : null}
    </Screen>
  );
}
