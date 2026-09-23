'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import FeesSubNav from '@/components/FeesSubNav';
import { useApp } from '@/lib/store';
import { DICTIONARY, formatBDT, formatDhakaDate } from '@/lib/i18n';
import { PAYMENT_METHODS } from '@/lib/validations/payment';

interface CollectionReport {
  totalsByMethod: Record<string, number>;
  grandTotal: number;
  paymentsCount: number;
  daily: Array<{ date: string; count: number; methods: Record<string, number>; total: number }>;
}

export default function CollectionReportPage() {
  const { lang } = useApp();
  const dict = DICTIONARY[lang];

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(todayStr);
  const [method, setMethod] = useState('all');
  const [report, setReport] = useState<CollectionReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (dateFrom) q.set('dateFrom', dateFrom);
      if (dateTo) q.set('dateTo', dateTo);
      if (method !== 'all') q.set('method', method);
      const res = await fetch(`/api/fees/reports/collection?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setReport(data.report);
      }
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, method]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#063b78] tracking-tight">{dict.fees.collectionReportTitle}</h1>
        <p className="text-[13.5px] text-[#64748b] mt-0.5 font-medium">{dict.fees.collectionReportSubtitle}</p>
      </div>

      <FeesSubNav />

      <div className="card p-4 md:p-5 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs flex flex-wrap items-end gap-3">
        <div className="fld max-w-[180px]">
          <label>{dict.fees.dateFrom}</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="fld max-w-[180px]">
          <label>{dict.fees.dateTo}</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="fld max-w-[200px]">
          <label>{dict.fees.method}</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="all">{dict.fees.allTypes}</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{(dict.paymentMethod as any)[m]}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card p-12 rounded-2xl bg-white border border-[#dce5f0] text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-solid border-[#063b78] border-r-transparent align-[-0.125em]" />
        </div>
      ) : !report || report.paymentsCount === 0 ? (
        <div className="card p-12 md:p-16 rounded-2xl bg-white border border-[#dce5f0] shadow-2xs text-center flex flex-col items-center">
          <div className="h-16 w-16 rounded-2xl bg-blue-50 text-[#063b78] flex items-center justify-center mb-4">
            <Icon name="chart" size={32} />
          </div>
          <h2 className="text-xl font-bold text-[#063b78]">{dict.fees.emptyCollectionTitle}</h2>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-4 rounded-xl bg-[#eef3fa] border border-[#d8e1ee]">
              <div className="text-[11px] font-bold text-[#063b78] uppercase">{dict.fees.totalCollection}</div>
              <div className="dsp text-xl font-extrabold text-[#00296b]">{formatBDT(report.grandTotal, lang)}</div>
            </div>
            <div className="card p-4 rounded-xl bg-white border border-[#d8e1ee]">
              <div className="text-[11px] font-bold text-[#55637a] uppercase">{dict.fees.paymentsCol}</div>
              <div className="dsp text-xl font-extrabold text-[#092f63]">{report.paymentsCount}</div>
            </div>
            {PAYMENT_METHODS.filter((m) => report.totalsByMethod[m] > 0).map((m) => (
              <div key={m} className="card p-4 rounded-xl bg-white border border-[#d8e1ee]">
                <div className="text-[11px] font-bold text-[#55637a] uppercase">{(dict.paymentMethod as any)[m]}</div>
                <div className="dsp text-lg font-extrabold text-[#092f63]">{formatBDT(report.totalsByMethod[m], lang)}</div>
              </div>
            ))}
          </div>

          <div className="card rounded-2xl bg-white border border-[#dce5f0] shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#edf1f7] font-bold text-[#063b78]">{dict.fees.dailyCollection}</div>
            <div className="overflow-x-auto scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{dict.fees.date}</th>
                    <th>{dict.fees.paymentsCol}</th>
                    {PAYMENT_METHODS.map((m) => <th key={m}>{(dict.paymentMethod as any)[m]}</th>)}
                    <th>{dict.fees.total}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.daily.map((d) => (
                    <tr key={d.date} className="trow">
                      <td className="text-left font-semibold text-[#092f63]">{formatDhakaDate(d.date)}</td>
                      <td>{d.count}</td>
                      {PAYMENT_METHODS.map((m) => (
                        <td key={m} className="font-mono">{d.methods[m] > 0 ? formatBDT(d.methods[m], lang) : '—'}</td>
                      ))}
                      <td className="font-mono font-bold text-[#092f63]">{formatBDT(d.total, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
