'use client';

import { useEffect, useState } from 'react';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY, formatDhakaDate, pickLocalized } from '@/lib/i18n';

interface StudentProfile {
  id: string;
  studentIdCode: string;
  name: string;
  banglaName: string | null;
  phone: string | null;
  email: string | null;
  dob: string | null;
  address: string | null;
  branch: { name: string } | null;
  enrollments: Array<{
    academicProgram: { name: string; banglaName: string | null };
    academicClass: { name: string; banglaName: string | null };
    academicGroup: { name: string; banglaName: string | null } | null;
  }>;
  studentBatches: Array<{ batch: { name: string; banglaName: string | null } }>;
}

export default function StudentPortalProfilePage() {
  const { lang, showToast } = usePortal();
  const t = DICTIONARY[lang];
  const p = t.portalProfile;

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    fetch('/api/portal/student/profile')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setProfile(res.student);
          setPhone(res.student.phone || '');
          setEmail(res.student.email || '');
          setAddress(res.student.address || '');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/portal/student/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, email, address }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      showToast(p.saved);
    } catch {
      showToast(p.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-16 text-center text-[13px] text-[#64748b]">{t.common.loading}</div>;
  if (!profile) return <div className="py-16 text-center text-[13px] text-rose-600">{t.common.loadFailed}</div>;

  const enrollment = profile.enrollments[0];
  const batch = profile.studentBatches[0]?.batch;

  return (
    <div className="max-w-[700px] mx-auto flex flex-col gap-5">
      <h1 className="text-lg font-bold text-[#092f63]">{p.title}</h1>

      <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0] grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
        <div>
          <div className="text-[#64748b]">{p.nameLabel}</div>
          <div className="font-semibold text-[#092f63]">{pickLocalized(lang, profile.name, profile.banglaName)}</div>
        </div>
        <div>
          <div className="text-[#64748b]">{p.studentIdLabel}</div>
          <div className="font-semibold text-[#092f63] font-mono">{profile.studentIdCode}</div>
        </div>
        {profile.dob && (
          <div>
            <div className="text-[#64748b]">{p.dobLabel}</div>
            <div className="font-semibold text-[#092f63]">{formatDhakaDate(profile.dob)}</div>
          </div>
        )}
        {profile.branch && (
          <div>
            <div className="text-[#64748b]">{p.branchLabel}</div>
            <div className="font-semibold text-[#092f63]">{profile.branch.name}</div>
          </div>
        )}
        {enrollment && (
          <>
            <div>
              <div className="text-[#64748b]">{p.programLabel}</div>
              <div className="font-semibold text-[#092f63]">{pickLocalized(lang, enrollment.academicProgram.name, enrollment.academicProgram.banglaName)}</div>
            </div>
            <div>
              <div className="text-[#64748b]">{p.classLabel}</div>
              <div className="font-semibold text-[#092f63]">{pickLocalized(lang, enrollment.academicClass.name, enrollment.academicClass.banglaName)}</div>
            </div>
            {enrollment.academicGroup && (
              <div>
                <div className="text-[#64748b]">{p.groupLabel}</div>
                <div className="font-semibold text-[#092f63]">{pickLocalized(lang, enrollment.academicGroup.name, enrollment.academicGroup.banglaName)}</div>
              </div>
            )}
          </>
        )}
        {batch && (
          <div>
            <div className="text-[#64748b]">{p.batchLabel}</div>
            <div className="font-semibold text-[#092f63]">{pickLocalized(lang, batch.name, batch.banglaName)}</div>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="card p-5 rounded-2xl bg-white border border-[#dce5f0] flex flex-col gap-4">
        <div className="fld">
          <label>{p.phoneLabel}</label>
          <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="fld">
          <label>{p.emailLabel}</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="fld">
          <label>{p.addressLabel}</label>
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <button type="submit" disabled={saving} className="primary justify-center text-sm py-2.5">
          {saving ? p.saving : p.save}
        </button>
      </form>
    </div>
  );
}
