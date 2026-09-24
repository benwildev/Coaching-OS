import Link from 'next/link';
import Icon from '@/components/Icon';
import { initials, tkCompact } from '@/lib/format';
import { formatTime12h } from '@/lib/schedule';
import type { DashboardData } from '@/lib/services/dashboard.service';

// ---------- shared ----------

export function Panel({
  title,
  subtitle,
  icon,
  action,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-4 md:p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon && (
              <span className="w-7 h-7 rounded-lg bg-[#fff6cc] text-[#7a5200] flex items-center justify-center shrink-0">
                <Icon name={icon} size={15} />
              </span>
            )}
            <h2 className="ttl">{title}</h2>
          </div>
          {subtitle && <p className="text-[12.5px] text-[#55637a] mt-0.5">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-sm text-[#64748b]">{children}</div>;
}

function timeAgo(at: Date, now: Date) {
  const s = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

// ---------- Outstanding fees ----------

export function OutstandingFees({ data }: { data: DashboardData['outstanding'] }) {
  const max = Math.max(1, ...data.aging.map((a) => a.amount));
  const colors = ['#063b78', '#ffd200', '#f59e0b', '#ea580c'];
  const latePct = data.total > 0 ? Math.round((data.late30Amount / data.total) * 100) : 0;

  return (
    <Panel
      title="Outstanding fees"
      subtitle="How much is unpaid, and how old is it?"
      action={
        data.late30Amount > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#fff6cc] text-[#7a5200] border border-[#ffe27a]">
            <Icon name="alert" size={12} /> Action needed
          </span>
        ) : undefined
      }
    >
      {data.total === 0 ? (
        <Empty>No unpaid invoices. Everything billed has been collected.</Empty>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="dsp text-[30px] text-[#063b78] leading-none">{tkCompact(data.total)}</span>
            <span className="text-xs text-[#64748b]">
              · ৳{Math.round(data.total).toLocaleString('en-IN')} across {data.invoices} invoices
            </span>
          </div>
          <div className="flex flex-col gap-2.5">
            {data.aging.map((a, i) => (
              <div key={a.label} className="grid grid-cols-[76px_1fr_64px] items-center gap-3 text-[12.5px]">
                <span className="text-[#55637a]">{a.label}</span>
                <div className="h-2 rounded-full bg-[#edf1f7] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(a.amount / max) * 100}%`, background: colors[i] }} />
                </div>
                <span className="text-right font-bold text-[#092f63] num">{tkCompact(a.amount)}</span>
              </div>
            ))}
          </div>
          {data.late30Amount > 0 && (
            <div className="mt-4 rounded-xl bg-[#fffbeb] border border-[#fde68a] px-3.5 py-2.5 text-[12.5px] text-[#7a5200]">
              <b>
                {tkCompact(data.late30Amount)} ({latePct}%)
              </b>{' '}
              is 30+ days late across <b>{data.lateStudents} students</b>.
            </div>
          )}
          <Link href="/fees/reports/due" className="primary w-full justify-center mt-4">
            <Icon name="send" size={15} /> Review dues &amp; send reminders
          </Link>
        </>
      )}
    </Panel>
  );
}

// ---------- Attendance heatmap ----------

export function AttendanceHeatmap({ weeks }: { weeks: DashboardData['heatmap'] }) {
  const values = weeks.flatMap((w) => w.days.map((d) => d.value)).filter((v): v is number => v != null);
  const days = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const level = (v: number) => (hi - lo < 0.5 ? 3 : Math.min(3, Math.floor(((v - lo) / (hi - lo)) * 4)));
  const shades = [
    { bg: '#e3edf8', fg: '#063b78' },
    { bg: '#b9cfeb', fg: '#063b78' },
    { bg: '#8fb3de', fg: '#063b78' },
    { bg: '#063b78', fg: '#ffffff' },
  ];

  return (
    <Panel
      title="Attendance by day"
      subtitle="Which days do students skip? Five weeks, Saturday to Thursday."
      action={
        <div className="flex items-center gap-1 text-[11px] text-[#64748b]">
          Lower
          {shades.map((s) => (
            <span key={s.bg} className="w-3 h-3 rounded-[3px]" style={{ background: s.bg }} />
          ))}
          Higher
        </div>
      }
    >
      {values.length === 0 ? (
        <Empty>No attendance marked in the last five weeks.</Empty>
      ) : (
        <div className="overflow-x-auto hs">
          <table className="w-full min-w-[440px] border-separate" style={{ borderSpacing: 6 }}>
            <thead>
              <tr>
                <th />
                {days.map((d) => (
                  <th key={d} className="text-[11.5px] font-bold text-[#55637a] pb-1">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.label}>
                  <td className="text-[11.5px] text-[#55637a] pr-2 whitespace-nowrap">{w.label}</td>
                  {w.days.map((d) => {
                    if (d.future) {
                      return (
                        <td key={d.date}>
                          <div
                            className="h-10 rounded-lg"
                            style={{ background: 'repeating-linear-gradient(45deg,#f1f4f9 0 6px,#e6ecf4 6px 8px)' }}
                            title={`${d.date} · upcoming`}
                          />
                        </td>
                      );
                    }
                    if (d.value == null) {
                      return (
                        <td key={d.date}>
                          <div className="h-10 rounded-lg bg-[#f8fafc] border border-dashed border-[#dce5f0] flex items-center justify-center text-[11px] text-[#94a3b8]" title={`${d.date} · no classes marked`}>
                            —
                          </div>
                        </td>
                      );
                    }
                    const s = shades[level(d.value)];
                    return (
                      <td key={d.date}>
                        <div
                          className="h-10 rounded-lg flex items-center justify-center text-[12.5px] font-bold num"
                          style={{ background: s.bg, color: s.fg }}
                          title={`${d.date} · ${d.value}% present`}
                        >
                          {Math.round(d.value)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ---------- Recent activity ----------

const ACTIVITY_STYLE: Record<string, { icon: string; cls: string }> = {
  payment: { icon: 'banknote', cls: 'bg-[#e6effa] text-[#00509d]' },
  admission: { icon: 'userplus', cls: 'bg-[#ffd200] text-[#063b78]' },
  attendance: { icon: 'calcheck', cls: 'bg-[#e9eef7] text-[#063b78]' },
  result: { icon: 'award', cls: 'bg-[#e9eef7] text-[#063b78]' },
  message: { icon: 'send', cls: 'bg-[#fff6cc] text-[#7a5200]' },
};

export function RecentActivity({ items, now }: { items: DashboardData['activity']; now: Date }) {
  return (
    <Panel title="Recent activity" subtitle="What just happened at the centre?">
      {items.length === 0 ? (
        <Empty>Payments, admissions and attendance will appear here as they happen.</Empty>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((a) => {
            const st = ACTIVITY_STYLE[a.kind];
            return (
              <li key={a.id} className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-[#f5f8fd]">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${st.cls}`}>
                  <Icon name={st.icon} size={15} />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-[#092f63] leading-snug">
                    {a.amount != null && <span className="num">{tkCompact(a.amount)} </span>}
                    {a.title}
                  </div>
                  <div className="text-[11.5px] text-[#64748b] truncate">
                    {a.sub}
                    {a.sub ? ' · ' : ''}
                    {timeAgo(a.at, now)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ---------- Today's classes & exams ----------

const STATUS_BADGE = {
  done: { label: 'Done', cls: 'bg-[#eef2f8] text-[#55637a]' },
  live: { label: 'In progress', cls: 'bg-[#ffd200] text-[#063b78]' },
  next: { label: 'Up next', cls: 'bg-[#e6effa] text-[#00509d]' },
};

export function TodaySchedule({ agenda, exams }: { agenda: DashboardData['todaysAgenda']; exams: DashboardData['upcomingExams'] }) {
  return (
    <Panel title="Today's classes & exams" subtitle="What is running, and what comes next?">
      {agenda.length === 0 ? (
        <Empty>No classes or exams scheduled today.</Empty>
      ) : (
        <ul className="flex flex-col">
          {agenda.map((c) => (
            <li key={c.id}>
              <Link href={c.href} className={`grid grid-cols-[62px_1fr] gap-3 py-2 rounded-lg hover:bg-[#f5f8fd] px-1 ${c.status === 'done' ? 'opacity-70' : ''}`}>
                <span className="text-[12px] font-bold text-[#55637a] num pt-0.5">{formatTime12h(c.time)}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {c.kind === 'exam' && <Icon name="award" size={13} className="text-[#b38f00]" />}
                    <span className="text-[13px] font-bold text-[#092f63]">{c.title}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_BADGE[c.status].cls}`}>{STATUS_BADGE[c.status].label}</span>
                  </div>
                  <div className="text-[11.5px] text-[#64748b] truncate">{c.sub}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 pt-3 border-t border-[#edf1f7]">
        <div className="text-[11px] font-extrabold tracking-wider uppercase text-[#55637a] mb-2">Upcoming exams</div>
        {exams.length === 0 ? (
          <div className="text-[12.5px] text-[#64748b] py-2">No exams in the next 14 days.</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {exams.map((e) => {
              const d = new Date(e.date);
              return (
                <li key={e.id} className="flex items-center gap-3">
                  <span className="w-11 h-11 rounded-xl bg-[#ffd200] text-[#063b78] flex flex-col items-center justify-center shrink-0 leading-none">
                    <span className="text-[15px] font-black num">{d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Asia/Dhaka' })}</span>
                    <span className="text-[9.5px] font-bold uppercase">{d.toLocaleDateString('en-US', { month: 'short', timeZone: 'Asia/Dhaka' })}</span>
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-[#092f63] truncate">{e.title}</div>
                    <div className="text-[11.5px] text-[#64748b] truncate">
                      {e.where} · {e.students} students
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}

// ---------- Top performers ----------

export function TopPerformers({ rows }: { rows: DashboardData['topPerformers'] }) {
  const medal = ['bg-[#ffd200] text-[#063b78]', 'bg-[#e9eef7] text-[#063b78]', 'bg-[#fde2c4] text-[#7a3e00]'];
  return (
    <Panel title="Top performers" subtitle="Who deserves recognition this term?" icon="award">
      {rows.length === 0 ? (
        <Empty>No exam results published yet.</Empty>
      ) : (
        <ol className="flex flex-col">
          {rows.map((r, i) => (
            <li key={r.id}>
              <Link href={`/students/${r.id}`} className="flex items-center gap-3 py-2 rounded-lg hover:bg-[#f5f8fd] px-1">
                <span className={`w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center shrink-0 ${medal[i] || 'bg-[#f5f8fd] text-[#55637a]'}`}>
                  {i + 1}
                </span>
                <div className="min-w-0 grow">
                  <div className="text-[13px] font-bold text-[#092f63] truncate">{r.name}</div>
                  <div className="text-[11.5px] text-[#64748b] truncate">{r.batch || `${r.exams} results`}</div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] font-extrabold text-[#063b78] num">{r.avg.toFixed(1)}</div>
                  {r.delta != null && (
                    <div className={`text-[11px] font-bold num ${r.delta >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                      {r.delta >= 0 ? '+' : ''}
                      {r.delta.toFixed(1)}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

// ---------- Teacher workload ----------

export function TeacherWorkload({ rows, target }: { rows: DashboardData['teacherWorkload']; target: number }) {
  const max = Math.max(target * 1.25, ...rows.map((r) => r.perWeek));
  return (
    <Panel title="Teacher workload" subtitle={`Is anyone overloaded? Classes per week against a ${target}-class target.`} icon="teacher">
      {rows.length === 0 ? (
        <Empty>No teachers assigned in the class routine yet.</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => {
            const over = r.perWeek > target;
            return (
              <li key={r.id}>
                <Link href={`/teachers/${r.id}`} className="flex items-center gap-3 group">
                  <span className="w-9 h-9 rounded-full bg-[#063b78] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                    {initials(r.name)}
                  </span>
                  <div className="min-w-0 grow">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-bold text-[#092f63] truncate group-hover:text-[#063b78]">{r.name}</span>
                      {over && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#fff6cc] text-[#7a5200] shrink-0">Over target</span>}
                    </div>
                    <div className="text-[11px] text-[#64748b] truncate">
                      {r.subjects.join(', ')} · {r.classes.join(', ')}
                    </div>
                    <div className="relative h-1.5 rounded-full bg-[#edf1f7] mt-1.5">
                      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(r.perWeek / max) * 100}%`, background: over ? '#f59e0b' : '#063b78' }} />
                      <div className="absolute -top-1 -bottom-1 w-[2px] bg-[#dc2626]/60" style={{ left: `${(target / max) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-[14px] font-extrabold text-[#063b78] num w-7 text-right">{r.perWeek}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ---------- Needs attention ----------

export function NeedsAttention({ rows, threshold, lowScore }: { rows: DashboardData['needsAttention']; threshold: number; lowScore: number }) {
  const tag = 'text-[10.5px] font-bold px-2 py-0.5 rounded-md';
  return (
    <Panel title="Needs attention" subtitle="Who is at risk of falling behind?" icon="alert">
      {rows.length === 0 ? (
        <Empty>
          No students below {threshold}% attendance, under {lowScore}% average or with overdue fees.
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-[#edf1f7] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-[#092f63] truncate">{r.name}</div>
                  {r.batch && <div className="text-[11px] text-[#64748b] truncate">{r.batch}</div>}
                </div>
                <Link href={`/students/${r.id}`} className="tb shrink-0" style={{ height: 28, fontSize: 11.5, padding: '0 10px' }}>
                  Contact
                </Link>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {r.attRate != null && (
                  <span className={`${tag} ${r.flags.attendance ? 'bg-[#fff6cc] text-[#7a5200]' : 'bg-[#eef2f8] text-[#55637a]'}`}>Attendance: {Math.round(r.attRate)}%</span>
                )}
                {r.score != null && (
                  <span className={`${tag} ${r.flags.score ? 'bg-[#fff6cc] text-[#7a5200]' : 'bg-[#eef2f8] text-[#55637a]'}`}>Avg score: {Math.round(r.score)}</span>
                )}
                {r.due > 0 && <span className={`${tag} bg-[#fee2e2] text-[#b91c1c]`}>{tkCompact(r.due)} due</span>}
              </div>
              {r.reason && <div className="text-[11.5px] text-[#64748b] mt-1.5">{r.reason}</div>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ---------- Batch occupancy ----------

export function BatchOccupancy({ rows }: { rows: DashboardData['occupancy'] }) {
  return (
    <Panel title="Batch occupancy" subtitle="Fill rate, sorted by capacity used">
      {rows.length === 0 ? (
        <Empty>No active batches yet.</Empty>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map((b) => {
            const pct = b.capacity > 0 ? Math.min(100, (b.enrolled / b.capacity) * 100) : 0;
            const full = pct >= 100;
            return (
              <Link key={b.id} href={`/batches/${b.id}`} className="rounded-xl border border-[#edf1f7] p-3.5 hover:border-[#063b78] transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-[#092f63] truncate">{b.name}</div>
                    <div className="text-[11.5px] text-[#64748b] truncate">{b.teacher || 'No teacher assigned'}</div>
                  </div>
                  {full && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#ffd200] text-[#063b78] shrink-0">Full</span>}
                </div>
                <div className="h-1.5 rounded-full bg-[#edf1f7] overflow-hidden mt-3">
                  <div className="h-full rounded-full bg-[#063b78]" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-[11.5px] text-[#55637a] mt-1.5 num">
                  {b.enrolled}/{b.capacity} seats
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
