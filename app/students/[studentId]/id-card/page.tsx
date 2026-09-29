'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useApp } from '@/lib/store';
import { DICTIONARY } from '@/lib/i18n';
import IdCardView, { type IdCardStudent } from '@/components/students/IdCardView';

export default function StudentIdCardPage() {
  const params = useParams();
  const studentId = params?.studentId as string;
  const { lang } = useApp();
  const dict = DICTIONARY[lang];

  const [data, setData] = useState<{ student: IdCardStudent; coachingCenter: any; branding: any } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/students/${studentId}/id-card`)
      .then((r) => r.json())
      .then((d) => d.success && setData(d))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) {
    return <div className="max-w-[700px] mx-auto py-16 text-center text-[13px] text-[#64748b]">{dict.common.loading}</div>;
  }
  if (!data) return null;

  return (
    <div className="max-w-[700px] mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between no-print">
        <Link href={`/students/${studentId}`} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#063b78] hover:underline">
          <Icon name="chevleft" size={16} />
          <span>{dict.students.viewProfile}</span>
        </Link>
        <button className="tb" onClick={() => window.print()}>
          <Icon name="file" size={15} />
          <span>{dict.idCard.print}</span>
        </button>
      </div>

      <div className="flex justify-center">
        <IdCardView student={data.student} coachingCenter={data.coachingCenter} branding={data.branding} lang={lang} dict={dict} />
      </div>
    </div>
  );
}
