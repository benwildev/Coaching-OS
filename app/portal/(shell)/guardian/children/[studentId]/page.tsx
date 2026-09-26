'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY, formatDhakaDate, pickLocalized } from '@/lib/i18n';

interface ChildProfile {
  id: string;
  studentIdCode: string;
  name: string;
  banglaName: string | null;
  dob: string | null;
  branch: { name: string } | null;
  enrollments: Array<{
    academicProgram: { name: string; banglaName: string | null };
    academicClass: { name: string; banglaName: string | null };
    academicGroup: { name: string; banglaName: string | null } | null;
  }>;
  studentBatches: Array<{ batch: { name: string; banglaName: string | null } }>;
}

export default function GuardianChildProfilePage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = use(params);
  const { lang } = usePortal();
  const t = DICTIONARY[lang];
  const p = t.portalProfile;

  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/guardian/children/${studentId}`)
      .then((r) => r.json())
      .then((res) => (res.success ? setProfile(res.student) : setError(res.error === 'STUDENT_NOT_LINKED' ? t.portalChildren.accessDenied : res.message || t.common.loadFailed)))
      .catch(() => setError(t.common.loadFailed))
      .finally(() => setLoading(false));
  }, [studentId, t.common.loadFailed]);

  if (loading) return <div className="py-16 text-center text-[13px] text-[#64748b]">{t.common.loading}</div>;
  if (error || !profile) return <div className="py-16 text-center text-[13px] text-rose-600">{error || t.common.loadFailed}</div>;

  const enrollment = profile.enrollments[0];
  const batch = profile.studentBatches[0]?.batch;

  const links = [
    { href: `/portal/guardian/children/${studentId}/attendance`, icon: 'check', label: t.portal.nav.attendance },
    { href: `/portal/guardian/children/${studentId}/fees`, icon: 'wallet', label: t.portal.nav.fees },
    { href: `/portal/guardian/children/${studentId}/results`, icon: 'award', label: t.portal.nav.results },
    { href: `/portal/guardian/children/${studentId}/materials`, icon: 'book', label: t.portal.nav.materials },
  ];

  return (
    <div className="max-w-[700px] mx-auto flex flex-col gap-5">
      <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0]">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-xl bg-[#063b78] text-white flex items-center justify-center font-black text-lg shrink-0">
            {profile.name.charAt(0)}
          </span>
          <div className="min-w-0">
            <div className="font-bold text-[#092f63] text-[15px] truncate">{pickLocalized(lang, profile.name, profile.banglaName)}</div>
            <div className="text-[12px] text-[#64748b]">{profile.studentIdCode}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12.5px]">
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
            </>
          )}
          {batch && (
            <div>
              <div className="text-[#64748b]">{p.batchLabel}</div>
              <div className="font-semibold text-[#092f63]">{pickLocalized(lang, batch.name, batch.banglaName)}</div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="card p-4 rounded-2xl bg-white border border-[#dce5f0] hover:border-[#063b78]/30 transition-colors flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[#eef4fb] text-[#063b78] flex items-center justify-center shrink-0">
              <Icon name={l.icon} size={17} />
            </span>
            <span className="font-bold text-[#092f63] text-[13.5px]">{l.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
