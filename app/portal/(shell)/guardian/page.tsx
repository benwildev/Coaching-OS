'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { usePortal } from '@/components/portal/PortalProvider';
import { DICTIONARY, formatDhakaDate, pickLocalized } from '@/lib/i18n';

interface ChildOption {
  student: { id: string; name: string; banglaName: string | null; studentIdCode: string };
  isPrimary: boolean;
}

interface DashboardData {
  children: ChildOption[];
  selectedChild: { id: string; name: string; banglaName: string | null; studentIdCode: string } | null;
  attendance: { percentage: number; present: number; late: number; absent: number; excused: number } | null;
  fees: { totalDue: number; totalPaid: number } | null;
  upcomingExams: Array<{ id: string; title: string; banglaTitle: string | null; startDate: string | null }>;
  recentResults: Array<{ examId: string; title: string; banglaTitle: string | null; overall: { overallGrade: string; overallGpa: number } }>;
  notices: Array<{ id: string; title: string; banglaTitle: string | null }>;
  unreadNotificationCount: number;
}

function GuardianDashboardContent() {
  const { lang } = usePortal();
  const t = DICTIONARY[lang];
  const d = t.portalDashboard;
  const ch = t.portalChildren;
  const router = useRouter();
  const childParam = useSearchParams().get('child') || '';

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const sp = childParam ? `?child=${childParam}` : '';
    fetch(`/api/portal/guardian/dashboard${sp}`)
      .then((r) => r.json())
      .then((res) => res.success && setData(res))
      .finally(() => setLoading(false));
  }, [childParam]);

  useEffect(load, [load]);

  if (loading) return <div className="py-16 text-center text-[13px] text-[#64748b]">{t.common.loading}</div>;
  if (!data) return <div className="py-16 text-center text-[13px] text-rose-600">{t.common.loadFailed}</div>;

  if (data.children.length === 0) {
    return <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center text-[13px] text-[#64748b]">{ch.noChildren}</div>;
  }

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-5">
      {data.children.length > 1 && (
        <div className="card p-3 rounded-2xl bg-white border border-[#dce5f0] flex items-center gap-3">
          <span className="text-[12px] font-bold text-[#64748b] shrink-0">{ch.selectChild}</span>
          <select
            className="grow h-9 rounded-xl border border-[#dce5f0] px-3 text-[13.5px]"
            value={data.selectedChild?.id || ''}
            onChange={(e) => router.push(`/portal/guardian?child=${e.target.value}`)}
          >
            {data.children.map((c) => (
              <option key={c.student.id} value={c.student.id}>
                {pickLocalized(lang, c.student.name, c.student.banglaName)} ({c.student.studentIdCode}){c.isPrimary ? ` · ${ch.primary}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {data.selectedChild && (
        <div className="card p-5 rounded-2xl bg-white border border-[#dce5f0]">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-xl bg-[#063b78] text-white flex items-center justify-center font-black text-lg shrink-0">
              {data.selectedChild.name.charAt(0)}
            </span>
            <div className="min-w-0">
              <div className="font-bold text-[#092f63] text-[15px] truncate">{pickLocalized(lang, data.selectedChild.name, data.selectedChild.banglaName)}</div>
              <div className="text-[12px] text-[#64748b]">{data.selectedChild.studentIdCode}</div>
            </div>
            <Link href={`/portal/guardian/children/${data.selectedChild.id}`} className="ml-auto tb text-[12px] shrink-0">
              {ch.viewProfile}
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Link href={`/portal/guardian/children/${data.selectedChild?.id}/attendance`} className="card p-4 rounded-2xl bg-white border border-[#dce5f0] hover:border-[#063b78]/30 transition-colors">
          <div className="text-[11.5px] text-[#64748b] font-semibold">{d.attendanceRate}</div>
          <div className="text-2xl font-black text-[#063b78] mt-1">{data.attendance?.percentage ?? 0}%</div>
        </Link>
        <Link href={`/portal/guardian/children/${data.selectedChild?.id}/fees`} className="card p-4 rounded-2xl bg-white border border-[#dce5f0] hover:border-[#063b78]/30 transition-colors">
          <div className="text-[11.5px] text-[#64748b] font-semibold">{d.feesDue}</div>
          <div className="text-2xl font-black text-[#063b78] mt-1">৳{data.fees ? Number(data.fees.totalDue).toLocaleString('en-BD') : 0}</div>
        </Link>
        <Link href="/portal/guardian/notifications" className="card p-4 rounded-2xl bg-white border border-[#dce5f0] hover:border-[#063b78]/30 transition-colors col-span-2 sm:col-span-1">
          <div className="text-[11.5px] text-[#64748b] font-semibold">{d.unreadNotifications}</div>
          <div className="text-2xl font-black text-[#063b78] mt-1">{data.unreadNotificationCount}</div>
        </Link>
      </div>

      <section className="card p-5 rounded-2xl bg-white border border-[#dce5f0]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[#092f63] text-[14px]">{d.upcomingExams}</h2>
          {data.selectedChild && (
            <Link href={`/portal/guardian/children/${data.selectedChild.id}/results`} className="text-[12px] font-bold text-[#063b78] hover:underline">{d.viewAll}</Link>
          )}
        </div>
        {data.upcomingExams.length === 0 ? (
          <p className="text-[13px] text-[#64748b] text-center py-4">{d.noUpcomingExams}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.upcomingExams.map((e) => (
              <li key={e.id} className="flex items-center justify-between text-[13px] border-b border-[#edf1f7] pb-2 last:border-0 last:pb-0">
                <span className="font-semibold text-[#092f63]">{pickLocalized(lang, e.title, e.banglaTitle)}</span>
                <span className="text-[#64748b]">{e.startDate ? formatDhakaDate(e.startDate) : '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5 rounded-2xl bg-white border border-[#dce5f0]">
        <h2 className="font-bold text-[#092f63] text-[14px] mb-3">{d.recentResults}</h2>
        {data.recentResults.length === 0 ? (
          <p className="text-[13px] text-[#64748b] text-center py-4">{d.noRecentResults}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.recentResults.map((r) => (
              <li key={r.examId} className="flex items-center justify-between text-[13px] border-b border-[#edf1f7] pb-2 last:border-0 last:pb-0">
                <span className="font-semibold text-[#092f63]">{pickLocalized(lang, r.title, r.banglaTitle)}</span>
                <span className="font-bold text-[#063b78]">{r.overall.overallGrade} · {r.overall.overallGpa.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5 rounded-2xl bg-white border border-[#dce5f0]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[#092f63] text-[14px]">{d.recentNotices}</h2>
          <Link href="/portal/guardian/notices" className="text-[12px] font-bold text-[#063b78] hover:underline">{d.viewAll}</Link>
        </div>
        {data.notices.length === 0 ? (
          <p className="text-[13px] text-[#64748b] text-center py-4">{d.noNotices}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.notices.map((n) => (
              <li key={n.id} className="flex items-center gap-2 text-[13px] border-b border-[#edf1f7] pb-2 last:border-0 last:pb-0">
                <Icon name="pin" size={14} className="text-[#063b78] shrink-0" />
                <span className="font-semibold text-[#092f63] truncate">{pickLocalized(lang, n.title, n.banglaTitle)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function GuardianPortalDashboard() {
  return (
    <Suspense fallback={null}>
      <GuardianDashboardContent />
    </Suspense>
  );
}
