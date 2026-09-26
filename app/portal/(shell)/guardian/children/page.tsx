'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY, pickLocalized } from '@/lib/i18n';

interface ChildItem {
  isPrimary: boolean;
  student: {
    id: string;
    studentIdCode: string;
    name: string;
    banglaName: string | null;
    status: string;
    enrollments: Array<{ academicClass: { name: string; banglaName: string | null }; academicGroup: { name: string; banglaName: string | null } | null }>;
    studentBatches: Array<{ batch: { name: string; banglaName: string | null } }>;
  };
}

export default function GuardianChildrenPage() {
  const { lang } = usePortal();
  const t = DICTIONARY[lang];
  const ch = t.portalChildren;

  const [children, setChildren] = useState<ChildItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portal/guardian/children')
      .then((r) => r.json())
      .then((res) => res.success && setChildren(res.children))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-[800px] mx-auto flex flex-col gap-5">
      <h1 className="text-lg font-bold text-[#092f63]">{ch.title}</h1>

      {loading ? (
        <div className="py-16 text-center text-[13px] text-[#64748b]">{t.common.loading}</div>
      ) : children.length === 0 ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center text-[13px] text-[#64748b]">{ch.noChildren}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {children.map((c) => {
            const cls = c.student.enrollments[0]?.academicClass;
            const group = c.student.enrollments[0]?.academicGroup;
            const batch = c.student.studentBatches[0]?.batch;
            return (
              <Link
                key={c.student.id}
                href={`/portal/guardian/children/${c.student.id}`}
                className="card p-4 rounded-2xl bg-white border border-[#dce5f0] hover:border-[#063b78]/30 transition-colors flex items-center gap-3"
              >
                <span className="w-11 h-11 rounded-xl bg-[#063b78] text-white flex items-center justify-center font-black shrink-0">
                  {c.student.name.charAt(0)}
                </span>
                <div className="min-w-0 grow">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#092f63] text-[14px] truncate">{pickLocalized(lang, c.student.name, c.student.banglaName)}</span>
                    {c.isPrimary && <span className="rounded-full bg-[#063b78] px-2 py-0.5 text-[10px] font-bold text-white shrink-0">{ch.primary}</span>}
                  </div>
                  <div className="text-[12px] text-[#64748b] truncate">
                    {[c.student.studentIdCode, cls && pickLocalized(lang, cls.name, cls.banglaName), group && pickLocalized(lang, group.name, group.banglaName), batch && pickLocalized(lang, batch.name, batch.banglaName)]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
