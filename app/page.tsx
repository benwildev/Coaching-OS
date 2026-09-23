'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import KpiCard from '@/components/KpiCard';
import AlertCard from '@/components/AlertCard';
import ActivityItem from '@/components/ActivityItem';
import ChartCard from '@/components/ChartCard';
import Chip from '@/components/Chip';
import FeeChart from '@/components/charts/FeeChart';
import EnrollChart from '@/components/charts/EnrollChart';
import HourlyChart from '@/components/charts/HourlyChart';
import DonutChart from '@/components/charts/DonutChart';
import Heatmap from '@/components/charts/Heatmap';
import { scopeOf, kpisFor } from '@/lib/charts';
import { DATA, CONCEPTS, clsName } from '@/lib/data';
import { tkShort, grp } from '@/lib/format';
import { useApp } from '@/lib/store';

export default function DashboardPage() {
  const { cls, range, showToast } = useApp();
  const [concept, setConcept] = useState<'executive' | 'academic' | 'pulse'>('academic');
  const [feeMode, setFeeMode] = useState<'amount' | 'rate'>('amount');
  const [donutMode, setDonutMode] = useState<'amount' | 'txns'>('amount');
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  const sc = useMemo(() => scopeOf(cls), [cls]);
  const kpis = useMemo(() => kpisFor(sc, range), [sc, range]);
  const alerts = DATA.alerts.filter((a: any) => (a.cls === 'all' || a.cls === cls) && !dismissed[a.id]);

  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
      {/* Concept banner sub-bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#55637a]">Dashboard Concept</span>
          <span className="bg-[#ffd500] text-[#00296b] text-[11px] font-bold px-2 py-0.5 rounded-full">Phase 1: pick one</span>
        </div>
        <button
          type="button"
          onClick={() => showToast('Project handoff documentation package (demo)')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#d8e1ee] bg-white text-xs font-bold text-[#00296b] hover:bg-[#eef3fa] shadow-sm transition-colors cursor-pointer"
        >
          <Icon name="download" size={14} />
          <span>Project handoff</span>
        </button>
      </div>

      {/* Concept switcher - 3 large cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {CONCEPTS.map((c) => {
          const isActive = concept === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setConcept(c.id as any)}
              className={`flex items-center gap-3.5 p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#00296b] border-[#00296b] text-white shadow-md'
                  : 'bg-white border-[#d8e1ee] hover:border-[#00509d] text-[#00296b] shadow-xs'
              }`}
            >
              <span
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isActive ? 'bg-[#ffd500] text-[#00296b]' : 'bg-[#eef3fa] text-[#00296b]'
                }`}
              >
                <Icon name={c.id === 'executive' ? 'chart' : c.id === 'academic' ? 'grad' : 'zap'} size={20} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-bold truncate leading-tight">{c.name}</span>
                <span className={`block text-[11.5px] mt-0.5 truncate ${isActive ? 'text-[#c7d4e6]' : 'text-[#55637a]'}`}>
                  {c.desc}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {concept === 'executive' && (
        <Executive
          sc={sc}
          kpis={kpis}
          alerts={alerts}
          feeMode={feeMode}
          setFeeMode={setFeeMode}
          range={range}
          onDismiss={(id: string) => setDismissed((d) => ({ ...d, [id]: true }))}
          onAct={(action: string) => showToast(`${action || 'Action'} completed (demo)`)}
        />
      )}
      {concept === 'academic' && (
        <Academic
          sc={sc}
          kpis={kpis}
          alerts={alerts}
          onDismiss={(id: string) => setDismissed((d) => ({ ...d, [id]: true }))}
          onAct={(action: string) => showToast(`${action || 'Action'} completed (demo)`)}
        />
      )}
      {concept === 'pulse' && (
        <Pulse
          sc={sc}
          kpis={kpis}
          alerts={alerts}
          donutMode={donutMode}
          setDonutMode={setDonutMode}
          onDismiss={(id: string) => setDismissed((d) => ({ ...d, [id]: true }))}
          onAct={() => showToast('Opened (demo)')}
        />
      )}
    </div>
  );
}

/* ---------------- Executive Command Center ---------------- */
function Executive({ sc, kpis, alerts, feeMode, setFeeMode, range, onDismiss, onAct }: any) {
  return (
    <div className="flex flex-col gap-5">
      {/* Greeting Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 pt-1 pb-1">
        <div>
          <h1 className="dsp text-2xl sm:text-[28px] font-bold text-[#00296b] tracking-tight">Good afternoon, Farhana</h1>
          <p className="text-xs sm:text-[13px] text-[#55637a] mt-0.5 font-medium">
            Monday, 21 September 2026 · Dhanmondi, Dhaka · All classes (9–12) · figures for this month (1–21 Sep 2026)
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#55637a] shrink-0">
          <span className="w-2 h-2 rounded-full bg-[#10b981]" />
          <span>Updated 4:15 PM</span>
        </div>
      </div>

      {/* 8 KPI Cards (4 cols x 2 rows) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-stretch">
        {kpis.slice(0, 8).map((k: any) => (
          <div key={k.id} className="col-span-1">
            <KpiCard kpi={k} variant="exec" />
          </div>
        ))}
      </div>

      {/* Middle Section: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (Col 7 / 12) */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          <ChartCard
            title="Fee collection"
            subtitle="Are we collecting what we bill each month?"
            filter={
              <div className="flex items-center gap-3 flex-wrap">
                <div className="hidden sm:flex items-center gap-2 text-[11px] text-[#55637a]">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#00296b]" /> Collected</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#8fb3de]" /> Billed</span>
                  <span className="text-[#8795ab]">Ended months / tall bar indicates collection surge</span>
                </div>
                <div className="flex gap-1.5">
                  <Chip active={feeMode === 'amount'} onClick={() => setFeeMode('amount')}>Amount</Chip>
                  <Chip active={feeMode === 'rate'} onClick={() => setFeeMode('rate')}>Collection rate</Chip>
                </div>
              </div>
            }
          >
            <FeeChart sc={sc} range={range} mode={feeMode} />
          </ChartCard>

          <ChartCard
            title="Enrollment growth"
            subtitle="Is our student base growing?"
            filter={
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 text-[11px] text-[#55637a]">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#00296b]" /> Active students</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#ffd500]" /> New admissions (trend)</span>
                </div>
                <span className="text-xs font-bold text-[#00509d] bg-[#e6effa] px-2.5 py-1 rounded-full whitespace-nowrap">
                  ↗ +4.6% in 6 months
                </span>
              </div>
            }
          >
            <EnrollChart sc={sc} range={range} />
          </ChartCard>
        </div>

        {/* Right Column (Col 5 / 12) */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          <OutstandingFeesCard onAct={() => onAct('Reminders')} />
          <ClassComparison />
          <AttendanceHealthCard />
        </div>
      </div>

      {/* Activity & Needs Decision Section (50/50 split) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <ChartCard title="Recent activity" subtitle="What just happened at the centre?">
          <div className="flex flex-col divide-y divide-[#edf1f7]">
            {DATA.activity.map((a: any) => (
              <ActivityItem key={a.id} item={a} />
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Needs your decision" subtitle="What should I act on today?">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DATA.alerts.map((a: any) => (
              <AlertCard key={a.id} alert={a} onAct={() => onAct(a.action)} onDismiss={() => onDismiss(a.id)} />
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Class Scorecard Table (Full Width) */}
      <ClassScorecard />
    </div>
  );
}

/* ---------------- Right Column Widgets ---------------- */
function OutstandingFeesCard({ onAct }: { onAct: () => void }) {
  return (
    <div className="card p-4 md:p-5 flex flex-col gap-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="ttl">Outstanding fees</div>
          <div className="text-[12px] text-[#55637a]">How much is unpaid, and how old is it?</div>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#fff6cc] text-[#7a5200] border border-[#f2d45c] shrink-0">
          <Icon name="alert" size={13} />
          Action needed
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="dsp text-[26px] font-extrabold text-[#00296b] leading-tight">৳4.82 L</span>
        <span className="text-xs text-[#55637a]">· 4,82,122 total dues</span>
      </div>

      <div className="flex flex-col gap-2 pt-0.5">
        {DATA.aging.map((a: any) => {
          const max = 2.0;
          const pct = Math.min(100, Math.round((a.amount / max) * 100));
          return (
            <div key={a.id} className="flex items-center gap-3 text-xs">
              <span className="w-20 text-[#55637a] font-semibold shrink-0">{a.label}</span>
              <div className="grow h-2.5 rounded-full bg-[#e9eef7] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: a.color || '#00296b' }} />
              </div>
              <span className="w-14 text-right font-bold text-[#00296b] shrink-0">৳{a.amount.toFixed(2)} L</span>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl p-3 bg-[#fff8e1] border border-[#fde68a] text-[12px] text-[#7a5200] leading-relaxed">
        <span className="font-bold">৳3.04 L (63%)</span> is 30+ days late across <span className="font-bold">51 students</span>. bKash reminder SMS can recover about 40% within a week.
      </div>

      <button
        type="button"
        onClick={onAct}
        className="w-full bg-[#ffd500] hover:bg-[#ffdf00] text-[#00296b] font-bold text-[13px] py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99]"
      >
        <Icon name="send" size={15} />
        <span>Send fee reminders</span>
      </button>
    </div>
  );
}

function ClassComparison() {
  const { setCls, cls } = useApp();
  const [tab, setTab] = useState<'collection' | 'students' | 'rate' | 'attendance'>('collection');

  const items = useMemo(() => {
    return DATA.classes.map((c: any) => {
      let num = 0;
      let label = '';
      if (tab === 'collection') {
        num = c.collected;
        label = `৳${c.collected.toFixed(2)} L`;
      } else if (tab === 'students') {
        num = c.students;
        label = `${c.students}`;
      } else if (tab === 'rate') {
        num = Math.round((c.collected / c.billed) * 100);
        label = `${num}%`;
      } else {
        num = c.att30;
        label = `${c.att30.toFixed(1)}%`;
      }
      return { ...c, num, label };
    }).sort((a: any, b: any) => b.num - a.num);
  }, [tab]);

  const maxVal = Math.max(...items.map((x: any) => x.num)) || 1;

  return (
    <div className="card p-4 md:p-5 flex flex-col gap-3">
      <div>
        <div className="ttl">Class comparison</div>
        <div className="text-[12px] text-[#55637a] mt-0.5">Which classes lead and which need help? Tap a class to filter.</div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto hs pb-1">
        {[
          { id: 'collection', label: 'Collection' },
          { id: 'students', label: 'Students' },
          { id: 'rate', label: 'Collection rate' },
          { id: 'attendance', label: 'Attendance' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              tab === t.id ? 'bg-[#00296b] text-white shadow-sm' : 'bg-[#e9eef7] text-[#00296b] hover:bg-[#dce5f3]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 pt-1">
        {items.map((c: any, i: number) => {
          const pct = Math.min(100, Math.max(12, (c.num / maxVal) * 100));
          const isSelected = cls === c.id;
          return (
            <div
              key={c.id}
              onClick={() => setCls(isSelected ? 'all' : c.id)}
              className={`group cursor-pointer flex items-center gap-3 p-2 rounded-xl transition-colors ${
                isSelected ? 'bg-[#e6effa] ring-1 ring-[#00509d]' : 'hover:bg-[#eef3fa]'
              }`}
            >
              <span className="w-3.5 text-xs font-extrabold text-[#8795ab] text-center">{i + 1}</span>
              <div className="w-28 sm:w-36 shrink-0 min-w-0">
                <div className="text-xs font-bold text-[#00296b] group-hover:underline truncate">{c.name}</div>
                <div className="text-[10.5px] text-[#55637a] truncate">{c.city}</div>
              </div>
              <div className="grow h-2.5 rounded-full bg-[#e9eef7] overflow-hidden">
                <div className="h-full rounded-full bg-[#00296b] transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-16 text-right text-xs font-bold text-[#00296b] shrink-0">{c.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AttendanceHealthCard() {
  return (
    <div className="card p-4 md:p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="ttl">Attendance health today</div>
          <div className="text-[12px] text-[#55637a] mt-0.5">Where are today's missing students?</div>
        </div>
        <div className="flex items-center gap-2.5 text-[11px] text-[#55637a] shrink-0">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#00296b]" /> Present</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#8fb3de]" /> Late</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#ffd500]" /> Absent</span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 pt-1">
        {DATA.classes.map((c: any) => {
          const exp = c.att.exp;
          const pPct = (c.att.p / exp) * 100;
          const lPct = (c.att.l / exp) * 100;
          const aPct = (c.att.a / exp) * 100;
          return (
            <div key={c.id} className="flex items-center gap-3 text-xs">
              <span className="w-16 font-semibold text-[#00296b] shrink-0">{c.name}</span>
              <div className="grow h-3 rounded-full bg-[#e9eef7] overflow-hidden flex">
                <div style={{ width: `${pPct}%` }} className="h-full bg-[#00296b]" title={`Present: ${c.att.p}`} />
                <div style={{ width: `${lPct}%` }} className="h-full bg-[#8fb3de]" title={`Late: ${c.att.l}`} />
                <div style={{ width: `${aPct}%` }} className="h-full bg-[#ffd500]" title={`Absent: ${c.att.a}`} />
              </div>
              <span className="w-12 text-right font-bold text-[#00296b] shrink-0">{c.att30.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>

      <div className="text-[11.5px] text-[#55637a] pt-2 border-t border-[#edf1f7]">
        Phone calls due for unexcused: <span className="font-bold text-[#00296b]">12 students</span> absent today across all classes.
      </div>
    </div>
  );
}

function ClassScorecard() {
  const { cls, setCls } = useApp();
  const totStudents = 640;
  const totAdmissions = 50;
  const totCollected = 16.6;
  const totRate = 88;
  const totOutstanding = 4.82;
  const totAtt = 90.8;

  return (
    <div className="card p-4 md:p-5">
      <div className="mb-3">
        <div className="ttl">Class scorecard — this month</div>
        <div className="text-[12.5px] text-[#55637a] mt-0.5">One row per class. Select a row to filter the whole dashboard.</div>
      </div>
      <div className="overflow-x-auto scroll">
        <table className="tbl w-full">
          <thead>
            <tr>
              <th className="text-left">Class</th>
              <th className="text-left">Coordinator</th>
              <th className="text-right">Students</th>
              <th className="text-right">Admissions</th>
              <th className="text-right">Collected</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Outstanding</th>
              <th className="text-right">Attendance</th>
            </tr>
          </thead>
          <tbody>
            {DATA.classes.map((c: any) => {
              const active = cls === c.id;
              const rate = Math.round((c.collected / c.billed) * 100);
              return (
                <tr
                  key={c.id}
                  className={`trow cursor-pointer transition-colors ${active ? 'bg-[#e6effa]' : ''}`}
                  onClick={() => setCls(active ? 'all' : c.id)}
                >
                  <td className="text-left">
                    <div className="font-bold text-[#00296b]">{c.name}</div>
                    <div className="text-[11px] text-[#55637a]">{c.city}</div>
                  </td>
                  <td className="text-left text-[#1f2d44] font-medium">{c.manager}</td>
                  <td className="text-right text-[#1f2d44] font-semibold">{c.students}</td>
                  <td className="text-right text-[#1f2d44]">{c.admissions}</td>
                  <td className="text-right font-bold text-[#00296b]">৳{c.collected.toFixed(2)} L</td>
                  <td className="text-right font-semibold text-[#1f2d44]">{rate}%</td>
                  <td className="text-right font-bold text-[#7a5200]">৳{c.outstanding.toFixed(2)} L</td>
                  <td className="text-right font-bold text-[#00296b]">{c.att30.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr
              className={`border-t-2 border-[#d8e1ee] font-bold cursor-pointer hover:bg-[#eef3fa] ${cls === 'all' ? 'bg-[#f1f5fb]' : ''}`}
              onClick={() => setCls('all')}
            >
              <td className="text-left text-[#00296b]">All classes</td>
              <td className="text-left text-[#55637a] font-normal">—</td>
              <td className="text-right text-[#00296b]">{totStudents}</td>
              <td className="text-right text-[#00296b]">{totAdmissions}</td>
              <td className="text-right text-[#00296b]">৳{totCollected.toFixed(1)} L</td>
              <td className="text-right text-[#00296b]">{totRate}%</td>
              <td className="text-right text-[#7a5200]">৳{totOutstanding.toFixed(2)} L</td>
              <td className="text-right text-[#00296b]">{totAtt.toFixed(1)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Academic Performance Hub ---------------- */
function Academic({ sc, kpis, alerts, onDismiss, onAct }: any) {
  const [activeGroup, setActiveGroup] = useState<string>('All groups');
  const [subjMode, setSubjMode] = useState<'avg' | 'pass'>('avg');

  const batches = DATA.academicBatches || [];
  const filteredBatches =
    activeGroup === 'All groups'
      ? batches
      : batches.filter((b: any) => b.group === activeGroup);

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Academic Pulse Hero Banner */}
      <div
        className="rounded-2xl p-5 lg:p-6 text-white relative overflow-hidden shadow-sm flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-6"
        style={{ background: 'linear-gradient(135deg, #001f54 0%, #00296b 55%, #00387d 100%)' }}
      >
        {/* Left: Donut + Main Heading & Badges */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 lg:gap-6">
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx={50} cy={50} r={40} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={10} />
              <circle
                cx={50}
                cy={50}
                r={40}
                fill="none"
                stroke="#ffd500"
                strokeWidth={10}
                strokeLinecap="round"
                strokeDasharray={`${(90.8 / 100) * 251.3} 251.3`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="dsp text-2xl font-black text-white leading-none">90.8%</span>
              <span className="text-[10px] font-bold text-[#ffd500] mt-1">present today</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-extrabold tracking-wider uppercase text-[#ffd500]">
              ACADEMIC PULSE · MONDAY, 21 SEPTEMBER 2026
            </span>
            <h2 className="dsp text-2xl lg:text-[28px] font-extrabold text-white tracking-tight leading-tight">
              576 students expected in class today
            </h2>
            <div className="flex items-center gap-2 flex-wrap pt-0.5">
              <span className="bg-white/15 border border-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                318 present
              </span>
              <span className="bg-white/15 border border-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                26 late
              </span>
              <span className="bg-white/15 border border-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                32 absent
              </span>
            </div>
            <p className="text-xs text-[#93c5fd] font-medium pt-0.5">
              +2.2 pts vs 30-day avg (88.6%)
            </p>
          </div>
        </div>

        {/* Middle: 3 Quick Stats */}
        <div className="flex items-center gap-6 lg:gap-8 py-3 xl:py-0 border-t xl:border-t-0 xl:border-l border-white/15 xl:pl-8">
          <div>
            <div className="dsp text-2xl lg:text-3xl font-black text-white leading-none">14</div>
            <div className="text-xs font-bold text-[#c7d4e6] mt-1">Upcoming exams</div>
            <div className="text-[11px] text-[#93c5fd]">this week</div>
          </div>
          <div>
            <div className="dsp text-2xl lg:text-3xl font-black text-white leading-none">24</div>
            <div className="text-xs font-bold text-[#c7d4e6] mt-1">Active batches</div>
            <div className="text-[11px] text-[#93c5fd]">all</div>
          </div>
          <div>
            <div className="dsp text-2xl lg:text-3xl font-black text-white leading-none">24</div>
            <div className="text-xs font-bold text-[#c7d4e6] mt-1">Active teachers</div>
            <div className="text-[11px] text-[#93c5fd]">18 in class today</div>
          </div>
        </div>

        {/* Right: Happening Now Card */}
        <div className="bg-white rounded-xl p-3.5 shadow-sm text-[#00296b] min-w-[260px] xl:w-72 shrink-0 border border-white/20">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#55637a]">Happening now</span>
            <span className="bg-[#fef3c7] text-[#92400e] text-[10.5px] font-bold px-2 py-0.5 rounded-full">
              In progress
            </span>
          </div>
          <div className="text-[13.5px] font-extrabold text-[#00296b] mt-1.5 leading-snug">
            HSC Model Test 02 · General Math
          </div>
          <div className="text-xs text-[#55637a] mt-1 font-medium">
            9:00 · Class 12 · 128 students · Class 12
          </div>
        </div>
      </div>

      {/* 2. Three Alert Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Alert 1 */}
        <div className="card p-4 flex flex-col justify-between border-l-4 border-l-[#00296b]">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 bg-[#eef3fa] text-[#00296b] text-[10.5px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00296b]" />
                Needs attention
              </span>
              <button
                type="button"
                onClick={() => onDismiss('al_mock1')}
                className="text-[#8795ab] hover:text-[#00296b] text-sm p-0.5 leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>
            <h3 className="text-sm font-bold text-[#00296b] mt-2">Class 11 Science - B attendance fell to 78%</h3>
            <p className="text-xs text-[#55637a] mt-1 leading-relaxed">
              Down 8 points in two weeks. 6 students missed 3+ classes.
            </p>
          </div>
          <div className="pt-3">
            <button
              type="button"
              onClick={() => onAct('Review batch')}
              className="px-3.5 py-1.5 rounded-xl bg-[#00296b] hover:bg-[#003f88] text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Review batch
            </button>
          </div>
        </div>

        {/* Alert 2 */}
        <div className="card p-4 flex flex-col justify-between border-l-4 border-l-[#00296b]">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 bg-[#eef3fa] text-[#00296b] text-[10.5px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00296b]" />
                Needs attention
              </span>
              <button
                type="button"
                onClick={() => onDismiss('al_mock2')}
                className="text-[#8795ab] hover:text-[#00296b] text-sm p-0.5 leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>
            <h3 className="text-sm font-bold text-[#00296b] mt-2">6 test results not yet published</h3>
            <p className="text-xs text-[#55637a] mt-1 leading-relaxed">
              Papers held 12–17 Sep are waiting for mark entry.
            </p>
          </div>
          <div className="pt-3">
            <button
              type="button"
              onClick={() => onAct('Remind teachers')}
              className="px-3.5 py-1.5 rounded-xl bg-[#00296b] hover:bg-[#003f88] text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Remind teachers
            </button>
          </div>
        </div>

        {/* Alert 3 */}
        <div className="card p-4 flex flex-col justify-between border-l-4 border-l-[#00509d]">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 bg-[#e6f4ea] text-[#137333] text-[10.5px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-[#137333]" />
                Opportunity
              </span>
              <button
                type="button"
                onClick={() => onDismiss('al_mock3')}
                className="text-[#8795ab] hover:text-[#00296b] text-sm p-0.5 leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>
            <h3 className="text-sm font-bold text-[#00296b] mt-2">Class 10 Science - A is full</h3>
            <p className="text-xs text-[#55637a] mt-1 leading-relaxed">
              32 of 32 seats. Open batch Class 10C for waitlist.
            </p>
          </div>
          <div className="pt-3">
            <button
              type="button"
              onClick={() => onAct('Plan new batch')}
              className="px-3.5 py-1.5 rounded-xl bg-[#00296b] hover:bg-[#003f88] text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Plan new batch
            </button>
          </div>
        </div>
      </div>

      {/* 3. 4 Metric KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-stretch">
        <div className="card p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#eef2ff] text-[#4f46e5] flex items-center justify-center shrink-0">
            <Icon name="users" size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-[#55637a] font-semibold truncate">Total students</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="dsp text-xl font-bold text-[#00296b]">640</span>
              <span className="text-[11.5px] font-bold text-[#10b981]">▲ +18%</span>
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#fef9c3] text-[#ca8a04] flex items-center justify-center shrink-0">
            <Icon name="userplus" size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-[#55637a] font-semibold truncate">New admissions this month</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="dsp text-xl font-bold text-[#00296b]">40</span>
              <span className="text-[11.5px] font-bold text-[#10b981]">▲ +21.2%</span>
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#e0f2fe] text-[#0284c7] flex items-center justify-center shrink-0">
            <Icon name="wallet" size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-[#55637a] font-semibold truncate">Fees collected this month</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="dsp text-xl font-bold text-[#00296b]">৳ 16.6 L</span>
              <span className="text-[11.5px] font-bold text-[#10b981]">▲ +4.2%</span>
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#ffedd5] text-[#ea580c] flex items-center justify-center shrink-0">
            <Icon name="alert" size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-[#55637a] font-semibold truncate">Outstanding fees</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="dsp text-xl font-bold text-[#00296b]">৳ 4.82 L</span>
              <span className="text-[11.5px] font-bold text-[#ea580c]">▲ -2.8%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Middle Section - Row 1: Attendance Heatmap (7 cols) + Today's Classes & Exams (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Attendance by day */}
        <div className="lg:col-span-7 flex flex-col">
          <ChartCard
            title="Attendance by day"
            subtitle="Which days do students skip? Five weeks, Saturday to Thursday."
            className="h-full flex flex-col justify-between"
          >
            <Heatmap sc={sc} />
          </ChartCard>
        </div>

        {/* Today's classes & exams */}
        <div className="lg:col-span-5 flex flex-col">
          <ChartCard
            title="Today's classes & exams"
            subtitle="What is running, and what comes next?"
            className="h-full flex flex-col justify-between"
          >
            <div className="flex flex-col gap-3">
              {/* Timeline list */}
              <div className="flex flex-col gap-2.5">
                {(DATA.schedule || []).map((ev: any, i: number) => {
                  const isDone = ev.status === 'done';
                  const isLive = ev.status === 'live';
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 text-xs py-1 border-b border-[#edf1f7] last:border-0"
                    >
                      <span className="font-bold text-[#55637a] w-12 shrink-0 pt-0.5">{ev.time}</span>
                      <div className="grow min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[#00296b] truncate">{ev.title}</span>
                          {isDone && (
                            <span className="text-[10px] font-bold text-[#55637a] bg-[#eef3fa] px-1.5 py-0.2 rounded">
                              Done
                            </span>
                          )}
                          {isLive && (
                            <span className="text-[10px] font-bold text-[#92400e] bg-[#fef3c7] px-2 py-0.5 rounded-full">
                              In progress
                            </span>
                          )}
                          {!isDone && !isLive && (
                            <span className="text-[10.5px] font-semibold text-[#00509d]">
                              Up next
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#55637a] mt-0.5">{ev.meta}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Sub-section: UPCOMING EXAMS */}
              <div className="pt-3 border-t border-[#edf1f7]">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#55637a] mb-2.5">
                  Upcoming exams
                </div>
                <div className="flex flex-col gap-2">
                  {(DATA.exams || []).map((ex: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-2 rounded-xl bg-[#f8fafc] border border-[#edf1f7]"
                    >
                      <div className="w-11 h-11 rounded-lg bg-[#ffd500] text-[#00296b] flex flex-col items-center justify-center shrink-0 font-bold leading-none">
                        <span className="text-sm font-black">{ex.day || '23'}</span>
                        <span className="text-[9px] uppercase font-extrabold mt-0.5">{ex.month || 'SEP'}</span>
                      </div>
                      <div className="min-w-0 grow">
                        <div className="text-xs font-bold text-[#00296b] truncate">{ex.title}</div>
                        <div className="text-[11px] text-[#55637a] mt-0.5">{ex.meta}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ChartCard>
        </div>
      </div>

      {/* 5. Middle Section - Row 2: Batch Performance (7 cols) + Subject Results (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Batch performance */}
        <div className="lg:col-span-7 flex flex-col">
          <ChartCard
            title="Batch performance"
            subtitle="Which batches are thriving and which need support?"
            className="h-full flex flex-col justify-between"
          >
            <div className="flex flex-col gap-3">
              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {['All groups', 'Science', 'Business Studies', 'Humanities'].map((grp) => (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setActiveGroup(grp)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      activeGroup === grp
                        ? 'bg-[#00296b] text-white'
                        : 'bg-[#f0f4f9] text-[#55637a] hover:bg-[#e2e8f0]'
                    }`}
                  >
                    {grp}
                  </button>
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-[11px] text-[#55637a] font-medium pt-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#00296b]" />
                  Average exam score
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rotate-45 border-2 border-[#00509d] bg-white inline-block" />
                  Attendance
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1 h-3 bg-[#f59e0b] inline-block" />
                  Below 65
                </span>
              </div>

              {/* Batches Progress List */}
              <div className="flex flex-col gap-3 pt-2">
                {filteredBatches.map((b: any) => (
                  <div
                    key={b.id || b.name}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between py-1.5 border-b border-[#edf1f7] last:border-0"
                  >
                    <div className="w-48 shrink-0">
                      <div className="text-[13px] font-bold text-[#00296b] truncate">{b.name}</div>
                      <div className="text-[11px] text-[#55637a]">
                        {b.students} students · {b.group}
                      </div>
                    </div>

                    <div className="grow relative h-4 bg-[#e9eef7] rounded-full flex items-center overflow-visible">
                      {/* Threshold line at 65% */}
                      <div
                        className="absolute top-0 bottom-0 left-[65%] w-0.5 bg-[#f59e0b] z-10"
                        title="Benchmark: 65"
                      />
                      {/* Score Bar */}
                      <div
                        className="h-full rounded-full bg-[#00296b]"
                        style={{ width: `${b.score}%` }}
                      />
                      {/* Attendance Diamond Marker */}
                      <div
                        className="absolute w-3.5 h-3.5 -top-[1px] rotate-45 border-2 border-[#00509d] bg-white z-20 shadow-xs"
                        style={{ left: `calc(${b.att}% - 7px)` }}
                        title={`Attendance: ${b.att}%`}
                      />
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-right sm:w-28 justify-end">
                      <span className="text-[12.5px] font-extrabold text-[#00296b]">{b.score}</span>
                      <span className="text-[11.5px] text-[#55637a]">{b.att}% present</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ChartCard>
        </div>

        {/* Subject results */}
        <div className="lg:col-span-5 flex flex-col">
          <ChartCard
            title="Subject results"
            subtitle="Where do students need extra support? Latest tests."
            className="h-full flex flex-col justify-between"
            filter={
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setSubjMode('avg')}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    subjMode === 'avg' ? 'bg-[#00296b] text-white' : 'bg-[#eef3fa] text-[#55637a]'
                  }`}
                >
                  Average score
                </button>
                <button
                  type="button"
                  onClick={() => setSubjMode('pass')}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    subjMode === 'pass' ? 'bg-[#00296b] text-white' : 'bg-[#eef3fa] text-[#55637a]'
                  }`}
                >
                  Pass rate
                </button>
              </div>
            }
          >
            <div className="flex flex-col gap-2.5">
              {DATA.subjects.map((s: any) => {
                const val = subjMode === 'avg' ? s.avg : s.pass;
                const isUnder70 = s.warn || val < 70;
                return (
                  <div key={s.id} className="flex items-center gap-3 text-xs">
                    <span className="w-24 font-bold text-[#00296b] truncate">{s.name}</span>
                    <div className="grow h-3 bg-[#e9eef7] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${val}%`,
                          backgroundColor: isUnder70 ? '#f59e0b' : '#00296b',
                        }}
                      />
                    </div>
                    <span className="w-8 text-right font-extrabold text-[#00296b]">{val.toFixed(1)}</span>
                    <span
                      className={`w-12 text-right font-bold text-[11px] ${
                        s.up ? 'text-[#10b981]' : 'text-[#ea580c]'
                      }`}
                    >
                      ▲ {s.delta || '+1.0'}
                    </span>
                  </div>
                );
              })}
              <p className="text-[11.5px] text-[#55637a] pt-1 leading-relaxed">
                ▲▼ change in average vs. previous test. Bars under 70 are marked in yellow.
              </p>
            </div>
          </ChartCard>
        </div>
      </div>

      {/* 5. Bottom Section: 3 Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Col 1: Top performers */}
        <div className="card p-5 flex flex-col h-full">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-md bg-[#fef9c3] text-[#a16207] flex items-center justify-center">
              <Icon name="award" size={14} />
            </div>
            <h3 className="text-sm font-bold text-[#00296b]">Top performers</h3>
          </div>
          <p className="text-xs text-[#55637a] mb-4">Who deserves recognition this term?</p>

          <div className="flex flex-col flex-1 justify-between gap-1">
            {DATA.topStudents.slice(0, 8).map((s: any, i: number) => {
              const medalBg =
                i === 0
                  ? 'bg-[#ffd500] text-[#00296b]'
                  : i === 1
                  ? 'bg-[#e2e8f0] text-[#00296b]'
                  : i === 2
                  ? 'bg-[#fed7aa] text-[#9a3412]'
                  : 'bg-[#eef3fa] text-[#55637a]';
              return (
                <div
                  key={s.name}
                  className="flex items-center gap-3 py-1.5 border-b border-[#edf1f7] last:border-0"
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${medalBg}`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 grow">
                    <div className="text-xs font-bold text-[#00296b] truncate">{s.name}</div>
                    <div className="text-[11px] text-[#55637a] truncate">{s.batch}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-black text-[#00296b]">{s.score}</div>
                    <div className="text-[10.5px] font-bold text-[#10b981]">{s.delta}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Col 2: Needs attention */}
        <div className="card p-5 flex flex-col h-full">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-md bg-[#fef9c3] text-[#a16207] flex items-center justify-center">
              <Icon name="alert" size={14} />
            </div>
            <h3 className="text-sm font-bold text-[#00296b]">Needs attention</h3>
          </div>
          <p className="text-xs text-[#55637a] mb-4">Who is at risk of falling behind?</p>

          <div className="flex flex-col flex-1 justify-between gap-2.5">
            {DATA.riskStudents.slice(0, 5).map((s: any) => (
              <div
                key={s.name}
                className="p-2.5 rounded-xl border border-[#edf1f7] bg-[#f8fafc] flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#00296b]">{s.name}</span>
                  <button
                    type="button"
                    onClick={() => onAct(`Contact ${s.name}`)}
                    className="text-[11px] font-bold text-[#00296b] bg-white border border-[#d8e1ee] hover:bg-[#eef3fa] px-2 py-0.5 rounded-lg shadow-2xs transition-colors cursor-pointer"
                  >
                    Contact
                  </button>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10.5px] font-bold bg-[#fef3c7] text-[#92400e] px-1.5 py-0.5 rounded">
                    Attendance: {s.att}%
                  </span>
                  <span className="text-[10.5px] font-bold bg-[#fef3c7] text-[#92400e] px-1.5 py-0.5 rounded">
                    Avg score: {s.score}
                  </span>
                  {s.due > 0 && (
                    <span className="text-[10.5px] font-bold bg-[#fee2e2] text-[#b91c1c] px-1.5 py-0.5 rounded">
                      ৳{s.due.toLocaleString()} due
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[#55637a] leading-tight">{s.reason}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Col 3: Teacher workload */}
        <div className="card p-5 flex flex-col h-full">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-md bg-[#eef3fa] text-[#00296b] flex items-center justify-center">
              <Icon name="teacher" size={14} />
            </div>
            <h3 className="text-sm font-bold text-[#00296b]">Teacher workload</h3>
          </div>
          <p className="text-xs text-[#55637a] mb-4">
            Is anyone overloaded? Classes per week against a 20-class target.
          </p>

          <div className="flex flex-col flex-1 justify-between gap-1">
            {DATA.teachers.slice(0, 8).map((t: any) => {
              const isOver = t.classes > 20;
              return (
                <div key={t.name} className="flex items-center gap-2.5 py-1">
                  <div className="w-7 h-7 rounded-full bg-[#00296b] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    {t.initials || t.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 grow">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#00296b] truncate">{t.name}</span>
                      {isOver && (
                        <span className="text-[9.5px] font-bold text-[#92400e] bg-[#fef3c7] px-1.5 py-0.2 rounded">
                          Over target
                        </span>
                      )}
                    </div>
                    <div className="text-[10.5px] text-[#55637a] truncate">{t.subject}</div>
                    <div className="relative h-2 bg-[#e9eef7] rounded-full overflow-hidden mt-1">
                      {/* Target marker line at 20 (scaled out of 25) */}
                      <div className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-white/70 z-10" />
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (t.classes / 25) * 100)}%`,
                          backgroundColor: isOver ? '#f59e0b' : '#00296b',
                        }}
                      />
                    </div>
                  </div>
                  <span className="w-6 text-right text-xs font-extrabold text-[#00296b] shrink-0">
                    {t.classes}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Visual Operations Pulse ---------------- */
function Pulse({ sc, kpis, alerts, donutMode, setDonutMode, onDismiss, onAct }: any) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {kpis.slice(0, 8).map((k: any) => (
        <div key={k.id}><KpiCard kpi={k} variant="pulse" /></div>
      ))}

      <div className="col-span-2 flex flex-col">
        <ChartCard
          title="Today"
          subtitle={`Hourly check-ins · ${grp(DATA.today.admissions)} admissions today`}
          className="h-full flex flex-col"
        >
          <div className="flex-1 flex flex-col justify-center">
            <HourlyChart sc={sc} />
          </div>
        </ChartCard>
      </div>

      <div className="col-span-2 flex flex-col">
        <ChartCard
          title="Payment channels"
          subtitle="Where September's collections came from"
          className="h-full flex flex-col"
          filter={
            <div className="flex gap-1.5">
              <Chip active={donutMode === 'amount'} onClick={() => setDonutMode('amount')}>
                Amount
              </Chip>
              <Chip active={donutMode === 'txns'} onClick={() => setDonutMode('txns')}>
                Transactions
              </Chip>
            </div>
          }
        >
          <div className="flex-1 flex flex-col justify-between gap-3">
            <div className="flex-1 flex items-center justify-center py-2">
              <DonutChart sc={sc} mode={donutMode} />
            </div>
            <div className="mt-auto pt-3 border-t border-[#edf1f7] flex items-center justify-between text-xs text-[#55637a] flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#10b981]" />
                <span className="font-semibold text-[#00296b]">Digital collections: 70.1%</span>
              </div>
              <span className="text-[11.5px]">Avg txn: ৳3,068 · Reconciled today</span>
            </div>
          </div>
        </ChartCard>
      </div>

      <div className="col-span-2 flex flex-col">
        <ChartCard title="Live activity" subtitle="Streaming in as it happens" className="h-full flex flex-col">
          <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold text-[#7a5200]">
            <span className="livedot" /> LIVE
          </div>
          <div className="flex flex-col flex-1 justify-between gap-1">
            {DATA.activity.slice(0, 5).map((a: any) => (
              <ActivityItem key={a.id} item={a} />
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="col-span-2 flex flex-col">
        <ChartCard
          title="Admission funnel"
          subtitle="Inquiries through to admitted, this month"
          className="h-full flex flex-col"
        >
          <div className="flex flex-col flex-1 justify-between gap-3">
            <div className="flex flex-col gap-2.5">
              {DATA.funnel.map((f: any, i: number) => {
                const colors = ['#00296b', '#003f88', '#00509d', '#ffd500'];
                const convRate = i === 0 ? '100%' : `${((f.value / DATA.funnel[i - 1].value) * 100).toFixed(1)}% step`;
                return (
                  <div key={f.id} className="flex items-center gap-3">
                    <span className="w-36 text-[12.5px] font-semibold text-[#00296b] shrink-0 truncate">
                      {f.label}
                    </span>
                    <div className="grow h-3 rounded-full bg-[#e9eef7] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(f.value / DATA.funnel[0].value) * 100}%`,
                          backgroundColor: colors[i],
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-semibold text-[#55637a] bg-[#f1f5f9] px-1.5 py-0.5 rounded">
                        {convRate}
                      </span>
                      <span className="w-7 text-right text-[12px] font-bold text-[#00296b]">{f.value}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Conversion KPIs */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#edf1f7]">
              <div className="bg-[#f8fafc] border border-[#edf1f7] rounded-xl p-2.5 text-center">
                <div className="text-[10.5px] font-bold text-[#55637a] uppercase tracking-wider">Overall Rate</div>
                <div className="text-base font-extrabold text-[#00296b] mt-0.5">41.7%</div>
                <div className="text-[10px] text-[#10b981] font-semibold">▲ +3.2% vs target</div>
              </div>
              <div className="bg-[#f8fafc] border border-[#edf1f7] rounded-xl p-2.5 text-center">
                <div className="text-[10.5px] font-bold text-[#55637a] uppercase tracking-wider">Trial to Admit</div>
                <div className="text-base font-extrabold text-[#00296b] mt-0.5">78.4%</div>
                <div className="text-[10px] text-[#55637a]">40 of 51 enrolled</div>
              </div>
              <div className="bg-[#f8fafc] border border-[#edf1f7] rounded-xl p-2.5 text-center">
                <div className="text-[10.5px] font-bold text-[#55637a] uppercase tracking-wider">Monthly Target</div>
                <div className="text-base font-extrabold text-[#00296b] mt-0.5">40 / 45</div>
                <div className="text-[10px] text-[#00509d] font-semibold">88.9% achieved</div>
              </div>
            </div>

            {/* Admitted by class */}
            <div className="pt-2 border-t border-[#edf1f7] flex items-center justify-between text-xs flex-wrap gap-1.5">
              <span className="text-[11.5px] font-bold text-[#55637a]">Admitted by class:</span>
              <div className="flex gap-1.5 text-[11px] font-bold flex-wrap">
                <span className="px-2 py-0.5 bg-[#eef3fa] text-[#00296b] rounded-lg">Class 9: 12</span>
                <span className="px-2 py-0.5 bg-[#eef3fa] text-[#00296b] rounded-lg">Class 10: 14</span>
                <span className="px-2 py-0.5 bg-[#eef3fa] text-[#00296b] rounded-lg">Class 11: 11</span>
                <span className="px-2 py-0.5 bg-[#eef3fa] text-[#00296b] rounded-lg">Class 12: 13</span>
              </div>
            </div>
          </div>
        </ChartCard>
      </div>

      <div className="col-span-2 md:col-span-4">
        <ChartCard title="Batch occupancy" subtitle="Fill rate, sorted by capacity used">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...DATA.batches].sort((a: any, z: any) => z.enrolled / z.capacity - a.enrolled / a.capacity).slice(0, 9).map((b: any) => (
              <div key={b.id} className="border border-[#edf1f7] rounded-xl p-3">
                <div className="text-[12.5px] font-bold text-[#00296b] truncate">{b.name}</div>
                <div className="text-[11px] text-[#55637a] mb-1.5">{b.teacher}</div>
                <div className="h-2 rounded-full bg-[#e9eef7] overflow-hidden">
                  <div className="h-full rounded-full bg-[#00509d]" style={{ width: `${(b.enrolled / b.capacity) * 100}%` }} />
                </div>
                <div className="text-[11px] text-[#55637a] mt-1">{b.enrolled}/{b.capacity} seats</div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="col-span-2 md:col-span-4">
        <ChartCard title="Actionable alerts">
          <div className="grid sm:grid-cols-2 gap-3">
            {alerts.map((a: any) => <AlertCard key={a.id} alert={a} onAct={onAct} onDismiss={() => onDismiss(a.id)} />)}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
