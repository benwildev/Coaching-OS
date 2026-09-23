'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import FeesSubNav from '@/components/FeesSubNav';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDT, formatDhakaDate, toBanglaNumeral } from '@/lib/i18n';

interface DueRow {
  invoiceId: string;
  invoiceNumber: string;
  dueDate?: string | null;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  daysOverdue: number;
  student: { id: string; name: string; studentIdCode: string; phone?: string | null };
  guardian?: { name: string; phone: string } | null;
  batch?: { id: string; name: string } | null;
}

export default function DueReportPage() {
  const { lang } = useApp();
  const dict = DICTIONARY[lang];

  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'dueDate' | 'amount' | 'name'>('dueDate');
  const [rows, setRows] = useState<DueRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (overdueOnly) q.set('overdueOnly', 'true');
      q.set('sortBy', sortBy);
      q.set('pageSize', '100');
      const res = await fetch(`/api/fees/reports/due?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows || []);
      }
    } finally {
      setLoading(false);
    }
  }, [search, overdueOnly, sortBy]);

  useEffect(() => {
    const t = setTimeout(fetchList, 250);
    return () => clearTimeout(t);
  }, [fetchList]);

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{dict.fees.dueReportTitle}</h1>
        <p className="text-[13.5px] text-[#64748b] mt-0.5 font-medium">{dict.fees.dueReportSubtitle}</p>
      </div>

      <FeesSubNav />

      <div className="card p-4 md:p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-[#dce5f0] px-3.5 py-2.5 bg-[#f8fafc] max-w-sm grow focus-within:border-[#063b78] focus-within:bg-white transition-colors">
            <Icon name="search" size={17} className="text-[#64748b]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={dict.students.searchPlaceholder} className="bg-transparent outline-none w-full text-[13.5px] text-[#092f63] placeholder:text-[#94a3b8]" />
          </div>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="rounded-xl border border-[#dce5f0] bg-white px-3 py-2 text-[13px] text-[#092f63] font-medium outline-none focus:border-[#063b78]">
            <option value="dueDate">{dict.fees.sortByDueDate}</option>
            <option value="amount">{dict.fees.sortByAmount}</option>
            <option value="name">{dict.fees.sortByName}</option>
          </select>
          <button className="chip" aria-pressed={overdueOnly} onClick={() => setOverdueOnly((v) => !v)}>{dict.fees.overdueOnly}</button>
        </div>
      </div>

      {loading ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-12 md:p-16 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs text-center flex flex-col items-center">
          <div className="h-16 w-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
            <Icon name="check" size={32} />
          </div>
          <h2 className="text-xl font-bold text-[#063b78]">{dict.fees.emptyDueTitle}</h2>
          <p className="text-[14px] text-[#64748b] max-w-md mt-1.5 font-normal">{dict.fees.emptyDueDesc}</p>
        </div>
      ) : (
        <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{dict.fees.student}</th>
                  <th>{dict.fees.guardian}</th>
                  <th>{dict.fees.batch}</th>
                  <th>{dict.fees.invoiceNumber}</th>
                  <th>{dict.fees.dueDate}</th>
                  <th>{dict.fees.total}</th>
                  <th>{dict.fees.due}</th>
                  <th>{dict.fees.daysOverdue}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.invoiceId} className="trow">
                    <td className="text-left">
                      <div className="font-semibold text-[#092f63]">{r.student.name}</div>
                      <div className="text-[11px] text-[#8795ab]">{r.student.studentIdCode}</div>
                    </td>
                    <td className="text-left">
                      {r.guardian ? (
                        <>
                          <div>{r.guardian.name}</div>
                          <div className="text-[11px] text-[#8795ab] font-mono">{r.guardian.phone}</div>
                        </>
                      ) : '—'}
                    </td>
                    <td>{r.batch?.name || '—'}</td>
                    <td><Link href={`/fees/invoices/${r.invoiceId}`} className="font-mono font-bold text-[#063b78] hover:underline">{r.invoiceNumber}</Link></td>
                    <td>{r.dueDate ? formatDhakaDate(r.dueDate) : '—'}</td>
                    <td className="font-mono">{formatBDT(r.totalAmount, lang)}</td>
                    <td className="font-mono font-bold text-rose-700">{formatBDT(r.dueAmount, lang)}</td>
                    <td className={r.daysOverdue > 0 ? 'font-bold text-rose-600' : ''}>
                      {r.daysOverdue > 0 ? (lang === 'bn' ? toBanglaNumeral(r.daysOverdue) : r.daysOverdue) : '—'}
                    </td>
                    <td>
                      {r.guardian?.phone && (
                        <a href={`tel:${r.guardian.phone}`} className="tb">
                          <Icon name="phone" size={13} />
                          {dict.fees.call}
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
