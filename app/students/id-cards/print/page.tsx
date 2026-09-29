'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import IdCardView, { type IdCardStudent } from '@/components/students/IdCardView';

export default function BulkIdCardPrintPage() {
  const { lang } = useApp();
  const dict = DICTIONARY[lang];

  const [data, setData] = useState<{ students: IdCardStudent[]; coachingCenter: any; branding: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem('bulkIdCardStudentIds');
    const studentIds: string[] = raw ? JSON.parse(raw) : [];
    if (studentIds.length === 0) {
      setLoading(false);
      setError(true);
      return;
    }
    fetch('/api/students/id-cards/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setData(d);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="max-w-[900px] mx-auto py-16 text-center text-[13px] text-[#64748b]">{dict.common.loading}</div>;
  }
  if (error || !data || data.students.length === 0) {
    return (
      <div className="max-w-[900px] mx-auto py-16 text-center flex flex-col items-center gap-3">
        <p className="text-[14px] text-[#64748b]">{dict.common.loadFailed}</p>
        <Link href="/students" className="text-[#063b78] font-semibold hover:underline">{dict.students.viewProfile}</Link>
      </div>
    );
  }

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between no-print">
        <Link href="/students" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#063b78] hover:underline">
          <Icon name="chevleft" size={16} />
          <span>{dict.students.title}</span>
        </Link>
        <button className="tb" onClick={() => window.print()}>
          <Icon name="file" size={15} />
          <span>{dict.idCard.print}</span>
        </button>
      </div>

      <div className="id-card-grid justify-center mx-auto">
        {data.students.map((student) => (
          <IdCardView key={student.id} student={student} coachingCenter={data.coachingCenter} branding={data.branding} lang={lang} dict={dict} />
        ))}
      </div>
    </div>
  );
}
