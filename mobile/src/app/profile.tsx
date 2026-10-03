import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Text } from 'react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, label } from '@/lib/format';
import type { GuardianProfile, StudentProfile } from '@/lib/types';
import { Button, Card, colors, ErrorView, Input, KeyValue, Loading, Muted, Screen, SectionTitle, Title } from '@/components/ui';

type Fields = Record<string, string>;

function EditableFields({
  initial,
  fields,
  onSave,
}: {
  initial: Fields;
  fields: Array<{ key: string; label: string; keyboard?: 'phone-pad' | 'email-address' }>;
  onSave: (values: Fields) => Promise<void>;
}) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await onSave(values);
      setMessage({ ok: true, text: 'Saved.' });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <SectionTitle>Contact details</SectionTitle>
      {fields.map((f) => (
        <Input
          key={f.key}
          label={f.label}
          value={values[f.key] ?? ''}
          onChangeText={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
          keyboardType={f.keyboard}
          autoCapitalize={f.keyboard === 'email-address' ? 'none' : 'sentences'}
        />
      ))}
      {message ? <Text style={{ color: message.ok ? colors.success : colors.danger }}>{message.text}</Text> : null}
      <Button title="Save" onPress={save} loading={saving} />
    </>
  );
}

function StudentProfileView() {
  const q = useQuery({ queryKey: ['profile', 'student'], queryFn: () => api<{ student: StudentProfile }>('/api/portal/student/profile') });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={q.refetch} />;
  const s = q.data.student;
  const e = s.enrollments[0];
  return (
    <Screen>
      <Card>
        <Title>{s.name}</Title>
        {s.banglaName ? <Muted>{s.banglaName}</Muted> : null}
        <KeyValue k="Student ID" v={s.studentIdCode} />
        {e ? <KeyValue k="Session" v={e.academicSession.name} /> : null}
        {e ? <KeyValue k="Program" v={e.academicProgram.name} /> : null}
        {e ? <KeyValue k="Class" v={e.academicClass.name} /> : null}
        {e?.academicGroup ? <KeyValue k="Group" v={e.academicGroup.name} /> : null}
        {s.studentBatches.length > 0 ? <KeyValue k="Batches" v={s.studentBatches.map((b) => b.batch.name).join(', ')} /> : null}
        {s.branch ? <KeyValue k="Branch" v={s.branch.name} /> : null}
        {s.dob ? <KeyValue k="Date of birth" v={date(s.dob)} /> : null}
      </Card>
      <EditableFields
        initial={{ phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '' }}
        fields={[
          { key: 'phone', label: 'Phone', keyboard: 'phone-pad' },
          { key: 'email', label: 'Email', keyboard: 'email-address' },
          { key: 'address', label: 'Address' },
        ]}
        onSave={async (v) => {
          // Omitted fields are cleared server-side, so send the photo back unchanged.
          await api('/api/portal/student/profile', { method: 'PATCH', body: { ...v, photoUrl: s.photoUrl } });
          await q.refetch();
        }}
      />
    </Screen>
  );
}

function GuardianProfileView() {
  const q = useQuery({ queryKey: ['profile', 'guardian'], queryFn: () => api<{ guardian: GuardianProfile }>('/api/portal/guardian/profile') });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={q.refetch} />;
  const g = q.data.guardian;
  return (
    <Screen>
      <Card>
        <Title>{g.name}</Title>
        {g.banglaName ? <Muted>{g.banglaName}</Muted> : null}
        <KeyValue k="Relationship" v={label(g.relationship)} />
        {g.studentGuardians.map((sg) => (
          <KeyValue key={sg.student.id} k={sg.isPrimary ? 'Child (primary)' : 'Child'} v={`${sg.student.name} · ${sg.student.studentIdCode}`} />
        ))}
      </Card>
      <EditableFields
        initial={{ phone: g.phone, altPhone: g.altPhone ?? '', whatsapp: g.whatsapp ?? '', email: g.email ?? '', address: g.address ?? '' }}
        fields={[
          { key: 'phone', label: 'Phone', keyboard: 'phone-pad' },
          { key: 'altPhone', label: 'Alternative phone', keyboard: 'phone-pad' },
          { key: 'whatsapp', label: 'WhatsApp', keyboard: 'phone-pad' },
          { key: 'email', label: 'Email', keyboard: 'email-address' },
          { key: 'address', label: 'Address' },
        ]}
        onSave={async (v) => {
          await api('/api/portal/guardian/profile', { method: 'PATCH', body: v });
          await q.refetch();
        }}
      />
    </Screen>
  );
}

export default function Profile() {
  const { me } = useAuth();
  return me?.user?.portalType === 'GUARDIAN' ? <GuardianProfileView /> : <StudentProfileView />;
}
