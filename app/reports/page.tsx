'use client';
import { useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import ChartCard from '@/components/ChartCard';
import { DATA, ROSTER, clsName } from '@/lib/data';
import { tkShort } from '@/lib/format';
import { useApp } from '@/lib/store';

const REPORTS = [
  { id: 'fee-summary', label: 'Fee collection summary', icon: 'wallet' },
  { id: 'dues', label: 'Outstanding dues by class', icon: 'alert' },
  { id: 'attendance', label: 'Attendance summary', icon: 'calcheck' },
  { id: 'academic', label: 'Academic performance by subject', icon: 'grad' },
  { id: 'batch-occupancy', label: 'Batch occupancy', icon: 'layers' },
  { id: 'teacher-load', label: 'Teacher workload', icon: 'teacher' },
  { id: 'admissions', label: 'Admissions funnel', icon: 'userplus' },
  { id: 'payment-channels', label: 'Payment channel mix', icon: 'banknote' },
  { id: 'risk', label: 'Students needing attention', icon: 'activity' },
];

export default function ReportsPage() {
  const { cls, showToast } = useApp();
  const [repId, setRepId] = useState('fee-summary');
  const rep = REPORTS.find((r) => r.id === repId)!;

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row gap-4">
      <div className="card p-3 md:w-64 shrink-0 flex flex-row md:flex-col gap-1 overflow-x-auto hs">
        {REPORTS.map((r) => (
          <button key={r.id} onClick={() => setRepId(r.id)} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-left whitespace-nowrap ${repId === r.id ? 'bg-[#e6effa] text-[#001d4d]' : 'text-[#1f2d44] hover:bg-[#eef3fa]'}`}>
            <Icon name={r.icon} size={16} />
            {r.label}
          </button>
        ))}
      </div>

      <div className="grow min-w-0">
        <ChartCard
          title={rep.label}
          subtitle={clsName(cls)}
          filter={
            <div className="flex gap-2">
              <button className="tb" onClick={() => showToast('CSV exported (demo)')}><Icon name="download" size={15} /> CSV</button>
              <button className="tb" onClick={() => window.print()}><Icon name="file" size={15} /> Print</button>
            </div>
          }
        >
          <ReportBody id={repId} cls={cls} />
        </ChartCard>
      </div>
    </div>
  );
}

function ReportBody({ id, cls }: { id: string; cls: string }) {
  const classes = DATA.classes.filter((c: any) => cls === 'all' || c.id === cls);

  if (id === 'fee-summary' || id === 'dues') {
    return (
      <table className="tbl">
        <thead><tr><th>Class</th><th>Billed</th><th>Collected</th><th>Outstanding</th><th>Overdue students</th></tr></thead>
        <tbody>
          {classes.map((c: any) => (
            <tr key={c.id} className="trow">
              <td className="text-left font-bold text-[#00296b]">{c.name}</td>
              <td>{tkShort(c.billed)}</td>
              <td>{tkShort(c.collected)}</td>
              <td>{tkShort(c.outstanding)}</td>
              <td>{c.overdue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (id === 'attendance') {
    return (
      <table className="tbl">
        <thead><tr><th>Class</th><th>Expected</th><th>Present</th><th>Late</th><th>Absent</th><th>30-day rate</th></tr></thead>
        <tbody>
          {classes.map((c: any) => (
            <tr key={c.id} className="trow">
              <td className="text-left font-bold text-[#00296b]">{c.name}</td>
              <td>{c.att.exp}</td><td>{c.att.p}</td><td>{c.att.l}</td><td>{c.att.a}</td><td>{c.att30.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (id === 'academic') {
    return (
      <table className="tbl">
        <thead><tr><th>Subject</th><th>Average</th><th>Pass rate</th><th>Previous term</th></tr></thead>
        <tbody>
          {DATA.subjects.map((s: any) => (
            <tr key={s.id} className="trow">
              <td className="text-left font-bold text-[#00296b]">{s.name}</td><td>{s.avg.toFixed(1)}</td><td>{s.pass}%</td><td>{s.prev.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (id === 'batch-occupancy') {
    return (
      <table className="tbl">
        <thead><tr><th>Batch</th><th>Enrolled</th><th>Capacity</th><th>Fill rate</th></tr></thead>
        <tbody>
          {DATA.batches.filter((b: any) => cls === 'all' || b.cls === cls).map((b: any) => (
            <tr key={b.id} className="trow">
              <td className="text-left font-bold text-[#00296b]">{b.name}</td><td>{b.enrolled}</td><td>{b.capacity}</td><td>{((b.enrolled / b.capacity) * 100).toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (id === 'teacher-load') {
    return (
      <table className="tbl">
        <thead><tr><th>Teacher</th><th>Subject</th><th>Classes/week</th><th>Students</th></tr></thead>
        <tbody>
          {DATA.teachers.map((t: any) => (
            <tr key={t.id} className="trow"><td className="text-left font-bold text-[#00296b]">{t.name}</td><td className="text-left">{t.subject}</td><td>{t.classes}</td><td>{t.students}</td></tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (id === 'admissions') {
    return (
      <table className="tbl">
        <thead><tr><th>Stage</th><th>Count</th><th>Conversion</th></tr></thead>
        <tbody>
          {DATA.funnel.map((f: any, i: number) => (
            <tr key={f.id} className="trow"><td className="text-left font-bold text-[#00296b]">{f.label}</td><td>{f.value}</td><td>{i === 0 ? '—' : ((f.value / DATA.funnel[i - 1].value) * 100).toFixed(0) + '%'}</td></tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (id === 'payment-channels') {
    return (
      <table className="tbl">
        <thead><tr><th>Channel</th><th>Amount</th><th>Transactions</th></tr></thead>
        <tbody>
          {DATA.payments.map((p: any) => (
            <tr key={p.id} className="trow"><td className="text-left font-bold text-[#00296b]">{p.label}</td><td>{tkShort(p.amount)}</td><td>{p.txns}</td></tr>
          ))}
        </tbody>
      </table>
    );
  }
  // risk
  return (
    <table className="tbl">
      <thead><tr><th>Student</th><th>Batch</th><th>Attendance</th><th>Score</th><th>Reason</th></tr></thead>
      <tbody>
        {DATA.riskStudents.map((s: any) => (
          <tr key={s.name} className="trow"><td className="text-left font-bold text-[#00296b]">{s.name}</td><td className="text-left">{s.batch}</td><td>{s.att}%</td><td>{s.score}</td><td className="text-left">{s.reason}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
