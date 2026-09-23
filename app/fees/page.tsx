'use client';
import { useMemo, useState } from 'react';
import ChartCard from '@/components/ChartCard';
import Chip from '@/components/Chip';
import KpiCard from '@/components/KpiCard';
import { scopeOf, kpisFor } from '@/lib/charts';
import { DATA, ROSTER, clsName, FEES } from '@/lib/data';
import { tkShort } from '@/lib/format';
import { useApp } from '@/lib/store';

export default function FeesPage() {
  const { cls, range, showToast } = useApp();
  const [tab, setTab] = useState<'dues' | 'payments' | 'structure'>('dues');
  const [q, setQ] = useState('');
  const sc = useMemo(() => scopeOf(cls), [cls]);
  const kpis = useMemo(() => kpisFor(sc, range), [sc, range]);
  const feesKpi = kpis.find((k: any) => k.id === 'fees');
  const outstandingKpi = kpis.find((k: any) => k.id === 'outstanding');

  const dues = ROSTER.students.filter((s: any) => (cls === 'all' || s.cls === cls) && s.dueMonths.length > 0 && (!q || s.name.toLowerCase().includes(q.toLowerCase())));
  const payments = ROSTER.payments.filter((p: any) => cls === 'all' || p.cls === cls).slice(0, 60);

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[feesKpi, outstandingKpi, kpis.find((k: any) => k.id === 'students'), kpis.find((k: any) => k.id === 'admissions')].map((k: any) => (
          <KpiCard key={k.id} kpi={k} variant="exec" />
        ))}
      </div>

      <ChartCard title="Dues ageing" subtitle={`Outstanding by how overdue it is · ${clsName(cls)}`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {DATA.aging.map((a: any) => (
            <div key={a.id} className="border border-[#edf1f7] rounded-xl p-3">
              <div className="text-[11.5px] text-[#55637a]">{a.label}</div>
              <div className="dsp text-lg font-extrabold text-[#00296b]">{tkShort(a.amount)}</div>
            </div>
          ))}
        </div>
      </ChartCard>

      <div className="card">
        <div className="flex border-b border-[#edf1f7] px-4">
          <button className="tab" aria-selected={tab === 'dues'} onClick={() => setTab('dues')}>Dues</button>
          <button className="tab" aria-selected={tab === 'payments'} onClick={() => setTab('payments')}>Payments</button>
          <button className="tab" aria-selected={tab === 'structure'} onClick={() => setTab('structure')}>Fee structure</button>
        </div>
        <div className="p-4">
          {tab === 'dues' && (
            <>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student…" className="tb w-full max-w-xs mb-3" />
              <div className="overflow-x-auto scroll">
                <table className="tbl">
                  <thead><tr><th>Student</th><th>Guardian</th><th>Months due</th><th>Amount</th><th></th></tr></thead>
                  <tbody>
                    {dues.slice(0, 40).map((s: any) => (
                      <tr key={s.id} className="trow">
                        <td className="text-left font-bold text-[#00296b]">{s.name}<div className="text-[11px] text-[#8795ab] font-normal">{s.batchName}</div></td>
                        <td className="text-left">{s.guardian}<div className="text-[11px] text-[#8795ab]">{s.phone}</div></td>
                        <td>{s.dueMonths.join(', ')}</td>
                        <td>{'৳' + (s.fee * s.dueMonths.length).toLocaleString('en-IN')}</td>
                        <td>
                          <button className="tb" onClick={() => showToast('Reminder sent (demo)')}>Remind</button>
                        </td>
                      </tr>
                    ))}
                    {dues.length === 0 && <tr><td colSpan={5} className="text-center text-[#55637a] py-8">No outstanding dues.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === 'payments' && (
            <div className="overflow-x-auto scroll">
              <table className="tbl">
                <thead><tr><th>Receipt</th><th>Student</th><th>Purpose</th><th>Amount</th><th>Method</th><th>Date</th></tr></thead>
                <tbody>
                  {payments.map((p: any) => (
                    <tr key={p.receipt} className="trow">
                      <td className="text-left font-mono text-[12px]">{p.receipt}</td>
                      <td className="text-left">{p.name}</td>
                      <td className="text-left">{p.purpose}</td>
                      <td>{'৳' + p.amount.toLocaleString('en-IN')}</td>
                      <td className="capitalize">{p.method}</td>
                      <td>{p.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tab === 'structure' && (
            <div className="overflow-x-auto scroll">
              <table className="tbl">
                <thead><tr><th>Class</th><th>Science</th><th>Business Studies</th><th>Humanities</th></tr></thead>
                <tbody>
                  {DATA.classes.map((c: any) => (
                    <tr key={c.id} className="trow">
                      <td className="text-left font-bold text-[#00296b]">{c.name}</td>
                      <td>{'৳' + FEES[c.id]}</td>
                      <td>{'৳' + (FEES[c.id] - 400)}</td>
                      <td>{'৳' + (FEES[c.id] - 400)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
